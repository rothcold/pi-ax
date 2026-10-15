import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { AxRpcError, type AxTransport, type TaskRef } from '../src/ax/client.js';
import { parseWorkerTermination } from '../src/worker-protocol.js';
import { sha256 } from '../src/workspace.js';

/** Actual guest/Pi bash, no model: kill the wrapper group and require subreaper proof. */
export async function verifyGuestSupervision(transport: AxTransport, ref: TaskRef, output: string): Promise<void> {
  const proofPath = '/workspace/pi-ax-probe-termination.json';
  const pidPath = '/workspace/pi-ax-probe-bash.pid';
  const hash = sha256('pi-ax actual guest supervision probe');
  const tool = `import { createBashToolDefinition } from '/opt/pi/node_modules/@earendil-works/pi-coding-agent/dist/core/tools/bash.js';
await createBashToolDefinition('/workspace').execute('probe', {command: "trap '' TERM; echo $$ > ${pidPath}; sleep 300"});`;
  const wrapper = `import { spawn } from 'node:child_process';
const child=spawn('/opt/pi-ax/dist/worker/supervise',[String(process.pid),'${proofPath}','${ref.name}','${hash}','30000','node','/workspace/pi-ax-probe-tool.mjs'],{detached:true,stdio:'inherit',env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp/pi-ax-probe-home',PI_CODING_AGENT_DIR:'/tmp/pi-ax-probe-home/agent',PI_OFFLINE:'1'}});
child.on('error',()=>{process.exitCode=1;}); child.on('exit',()=>{process.exitCode=1;});`;
  await writeFile(path.join(output, 'supervision-intent.json'), JSON.stringify({ ref, hash, startMayBeAttempted: true }), { flag: 'wx', mode: 0o600 });
  await transport.writeFile(ref, '/workspace/pi-ax-probe-tool.mjs', Buffer.from(tool));
  await transport.writeFile(ref, '/workspace/pi-ax-probe-wrapper.mjs', Buffer.from(wrapper));
  const read = async (file: string) => {
    const chunks: Buffer[] = [];
    for await (const bytes of transport.readFile(ref, file, { maxBytes: 4096, timeoutMs: 5000 })) chunks.push(bytes);
    return Buffer.concat(chunks);
  };
  // A reused path would invalidate this test's correlation. Never repeat an uncertain start.
  try { await read(proofPath); throw new Error('Supervision probe already ran; do not replay'); }
  catch (error) { if (!(error instanceof AxRpcError) || error.code !== 5) throw error; }
  let processState = await transport.startProcess(ref, { command: ['node', '/workspace/pi-ax-probe-wrapper.mjs'], cwd: '/workspace', env: {}, timeoutSeconds: 900 });
  const save = async (name: string, data: unknown) => writeFile(path.join(output, name), JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  await save('supervision-process.json', processState);
  const readyDeadline = Date.now() + 15_000;
  let bashPid = 0;
  while (!bashPid) {
    try { bashPid = Number((await read(pidPath)).toString().trim()); assert(Number.isInteger(bashPid) && bashPid > 1); }
    catch (error) { if (!(error instanceof AxRpcError) || error.code !== 5) throw error; }
    assert(Date.now() < readyDeadline, 'Actual Pi bash did not start; supervision probe retained');
    if (!bashPid) await delay(100);
  }
  await transport.signalProcess(ref, processState.processId, 'SIGNAL_KILL');
  const deadline = Date.now() + 15_000;
  let proof;
  while (!proof || processState.state !== 'PROCESS_STATE_EXITED') {
    processState = await transport.getProcess(ref, processState.processId);
    try { proof = parseWorkerTermination(await read(proofPath)); }
    catch (error) { if (!(error instanceof AxRpcError) || error.code !== 5) throw error; }
    assert(Date.now() < deadline, 'Guest descendant termination unconfirmed; preserve probe for inspection');
    if (!proof || processState.state !== 'PROCESS_STATE_EXITED') await delay(100);
  }
  assert.equal(proof.taskId, ref.name); assert.equal(proof.snapshotSha256, hash); assert.equal(proof.interrupted, true);
  await save('supervision-process.json', processState); await save('supervision-termination.json', proof);
  await save('supervision-passed.json', { ref, bashPid, wrapperExit: processState.exitCode, confirmed: true, modelExecuted: false, real900SecondWait: false });
}
