import assert from 'node:assert/strict';
import { AxRpcError, type AxTransport, type TaskRef } from '../src/ax/client.js';
import { EgressRpcError, withNativeEvidence, type NativeActorEvidence, type NativeTemplateEvidence } from '../src/ax/egress-client.js';
import type { AxConfig } from '../src/config.js';
import type { EvidenceSave } from './e2e-lifecycle.js';

export interface RuntimeEvidence {
  actor: NativeActorEvidence; template: NativeTemplateEvidence; goldenRef: TaskRef;
  golden: NativeActorEvidence | null;
}
async function absent(read: () => Promise<unknown>): Promise<boolean> {
  try { await read(); } catch (error) {
    if ((error instanceof AxRpcError || error instanceof EgressRpcError) && error.code === 5) return true;
    throw error;
  }
  return false;
}
export async function captureRuntime(config: AxConfig, transport: AxTransport, ref: TaskRef, save: EvidenceSave, expectedScope: unknown): Promise<RuntimeEvidence> {
  assert(config.egress, 'Native evidence requires explicit egress credentials');
  const task = await transport.getTask(ref);
  await save('ax-evidence.json', { ref, image: task.spec?.image, actor: task.status?.actor, phase: task.status?.phase });
  assert.equal(task.metadata?.name, ref.name); assert.equal(task.metadata?.atespace, ref.atespace);
  assert.equal(task.status?.actor, ref.name); assert.equal(task.spec?.image, config.workerImage);
  return withNativeEvidence(config.egress, async (reader) => {
    const actor = await reader.getActor(ref);
    await save('native-evidence.json', { actor });
    const template = await reader.getActorTemplate(actor.template);
    await save('native-evidence.json', { actor, template });
    // AX's pinned per-task template contract (reconciler.go taskTemplateName). Never accept fallback/shared templates.
    assert.equal(template.ref.atespace, ref.atespace);
    assert(template.ref.name.startsWith(`${ref.name}-tmpl-`) && /^[0-9a-f]{8}$/.test(template.ref.name.slice(ref.name.length + 6)));
    assert(template.images.length === 1 && template.images[0] === config.workerImage);
    assert.equal(template.sandboxClass, 'SANDBOX_CLASS_GVISOR');
    if (actor.templateUid) assert.equal(actor.templateUid, template.uid);
    // Pinned Substrate template_reconciler.go names the golden actor by template UID, not a guessed task prefix.
    const goldenRef = { atespace: 'ate-golden', name: template.uid };
    let golden: NativeActorEvidence | null = null;
    try { golden = await reader.getActor(goldenRef); }
    catch (error) { if (!(error instanceof EgressRpcError) || error.code !== 5) throw error; }
    if (golden) { assert.deepEqual(golden.template, template.ref); if (golden.templateUid) assert.equal(golden.templateUid, template.uid); }
    const evidence = { actor, template, goldenRef, golden };
    await save('native-evidence.json', evidence);
    return evidence;
  }, expectedScope);
}

/** No delete retries: this readback must establish all four absences before releasing ownership. */
export async function confirmRuntimeAbsent(config: AxConfig, transport: AxTransport, evidence: RuntimeEvidence, save: EvidenceSave, expectedScope: unknown): Promise<void> {
  assert(config.egress);
  const observations: { kind: string; ref: TaskRef; status: string; code?: number }[] = [];
  const check = async (kind: string, ref: TaskRef, read: () => Promise<unknown>) => {
    let missing: boolean;
    try { missing = await absent(read); }
    catch (error) {
      observations.push({ kind, ref, status: 'unknown', code: error instanceof AxRpcError || error instanceof EgressRpcError ? error.code : undefined });
      await save('absence.json', { observations, allNotFound: false });
      throw error;
    }
    observations.push({ kind, ref, status: missing ? 'not_found' : 'present' });
    await save('absence.json', { observations, allNotFound: false });
    assert(missing, 'Owned remote resource still exists; cleanup unconfirmed');
  };
  await withNativeEvidence(config.egress, async (reader) => {
    await check('task', evidence.actor.ref, () => transport.getTask(evidence.actor.ref));
    await check('actor', evidence.actor.ref, () => reader.getActor(evidence.actor.ref));
    await check('template', evidence.template.ref, () => reader.getActorTemplate(evidence.template.ref));
    await check('golden', evidence.goldenRef, () => reader.getActor(evidence.goldenRef));
  }, expectedScope);
  await save('absence.json', { observations, allNotFound: true });
}
