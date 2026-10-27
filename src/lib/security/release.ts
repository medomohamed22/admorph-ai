export function forbiddenReleasePath(relative: string): boolean {
  const parts = relative.replaceAll('\\', '/').split('/');
  const blocked = new Set(['node_modules','.next','.git','.vercel','test-results','playwright-report','coverage','releases']);
  return parts.some(part => !part || part === '..' || part === '.' || blocked.has(part.toLowerCase())) || /^[A-Za-z]:/.test(relative) || relative.startsWith('/') ||
    parts.some(part => part.toLowerCase().startsWith('.env') && part !== '.env.example') || /\.(?:pem|key|pfx|p12|log|zip|tsbuildinfo|db|sqlite3?)$/i.test(relative);
}
export function containsReleaseSecret(text: string): boolean {
  return [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /AIza[0-9A-Za-z_-]{35}/,
    /sk-or-v1-[a-f0-9]{64}/i, /gh[pousr]_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{50,}/,
    /(?:^|[\s"'])sk-[A-Za-z0-9_-]{40,}/].some(pattern => pattern.test(text));
}
