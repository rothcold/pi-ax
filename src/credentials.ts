/** Shared host/worker policy; no Pi imports, filesystem access or credential reads. */
export function validateCredentialEnv(names: string[]): void {
  if (names.some((key) => !/^[A-Z][A-Z0-9_]*$/.test(key)) || new Set(names).size !== names.length) {
    throw new Error('credentialEnv must contain unique uppercase environment variable names');
  }
  // Credentials must not change guest executable/config discovery or load host code.
  if (names.some((key) => /^(?:PI_AX_|PI_|NODE_|LD_|DYLD_|BASH_|npm_)/.test(key)
    || ['PATH', 'HOME', 'ENV', 'SHELL', 'PWD', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME'].includes(key))) {
    throw new Error('credentialEnv contains a reserved execution/configuration variable');
  }
}

/** Call immediately before StartProcess; do not serialize or persist this result. */
export function readCredentialEnv(config: { credentialEnv: string[] }, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const key of config.credentialEnv) {
    const value = env[key];
    if (!value || value.includes('\0')) throw new Error(`Missing or invalid configured credential: ${key}`);
    result[key] = value;
  }
  return result;
}

/** Exact-value defense for returned text, not a secrecy guarantee against a malicious worker. */
export function redactText(text: string, secrets: Iterable<string>): string {
  const values = [...secrets].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const value of values) text = text.split(value).join('[REDACTED]');
  return text;
}
