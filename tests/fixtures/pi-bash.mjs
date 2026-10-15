// Actual root-tooling Pi bash implementation (root shrinkwrap), not the floating image runtime.
// No model or host Pi configuration; tests report this installed package's version.
import { createBashToolDefinition } from '../../node_modules/@earendil-works/pi-coding-agent/dist/core/tools/bash.js';
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;
const background = "setsid sh -c 'trap \"\" TERM; echo $$ > detached.pid; while :; do sleep 1; done' </dev/null >/dev/null 2>&1 &";
await createBashToolDefinition(process.cwd()).execute('actual-pi-bash', {
  command: `trap '' TERM; echo $$ > bash.pid; ${background} while [ ! -s detached.pid ]; do sleep 0.01; done; ${prompt === 'normal-detached' ? 'exit 0' : 'wait'}`,
});
console.log(JSON.stringify({ type: 'message_end', message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'actual bash fixture ended' }] } }));
console.log(JSON.stringify({ type: 'agent_settled' }));
