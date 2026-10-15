import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Docker aliases share an image ID; RepoDigests[0] need not name our registry. */
export function selectImageDigest(repository, digests) {
  const matches = digests.filter((value) => value.startsWith(`${repository}@sha256:`) && /^[a-f0-9]{64}$/.test(value.split('@sha256:')[1]));
  if (matches.length !== 1) throw new Error('Expected exactly one digest for the local registry repository');
  return matches[0];
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(selectImageDigest(process.argv[2], JSON.parse(readFileSync(0, 'utf8'))));
}
