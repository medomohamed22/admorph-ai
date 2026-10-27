import { mkdir, readdir, readFile, writeFile, copyFile, lstat, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { forbiddenReleasePath as forbidden, containsReleaseSecret } from '../src/lib/security/release.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releases = path.join(root, 'releases');
const rootFiles = ['package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'eslint.config.mjs',
  'vitest.config.mts', 'playwright.config.ts', '.gitignore', '.gitattributes', '.vercelignore', '.env.example',
  'vercel.json', 'README.md', 'AGENTS.md', 'ADMORPH_BUILD_PLAN.md', 'DAY1_VALIDATION.md', 'DAY2_VALIDATION.md',
  'DAY3_VALIDATION.md', 'HACKATHON.md', 'BUILD_LOG.md', 'DEPLOY_GITHUB_VERCEL_AR.md', 'RELEASE_VERIFICATION.md', 'CAMPAIGN_UPDATE_VALIDATION.md',
  'STUDIO_VALIDATION.md', 'CRITIC_VALIDATION.md', 'REPAIR_VALIDATION.md', 'DAY8_VALIDATION.md', 'DAY9_VALIDATION.md',
  'LICENSE', 'THIRD_PARTY_NOTICES.md', 'SUBMISSION_GUIDE.md','META_ONLY_IMPLEMENTATION.md','META_ONLY_VERIFICATION.md'];
const directories = ['src', 'public', 'scripts', 'tests', '.github', 'docs'];
const blocked = new Set(['node_modules', '.next', '.git', '.vercel', 'test-results', 'playwright-report', 'coverage', 'releases']);
async function exists(file) { try { await access(file); return true; } catch { return false; } }
async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if ((await lstat(full)).isSymbolicLink()) throw new Error(`Symlinks are not packaged: ${path.relative(root, full)}`);
    if (entry.isDirectory()) result.push(...await walk(full)); else if (entry.isFile()) result.push(full);
  }
  return result;
}
async function manifest(folder) {
  const entries = [];
  for (const full of (await walk(folder)).sort()) {
    const relative = path.relative(folder, full).split(path.sep).join('/');
    if (relative === 'PACKAGE_MANIFEST.json') continue;
    if (forbidden(relative)) throw new Error(`Excluded file found in package: ${relative}`);
    const bytes = await readFile(full);
    if (/\.(?:[cm]?[jt]sx?|json|md|ya?ml|txt|example|srt|vtt)$/.test(relative) || path.basename(relative) === 'LICENSE') {
      const text = bytes.toString('utf8');
      if (containsReleaseSecret(text)) throw new Error(`Possible credential in ${relative}; package stopped.`);
      if (path.basename(relative) === '.env.example' && text.split(/\r?\n/).some(line => line.trim() && !line.trim().startsWith('#'))) throw new Error('Environment example must contain comments only.');
    }
    entries.push({ path: relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const pkg = JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8'));
  const record = { schemaVersion: 1, name: pkg.name, version: pkg.version, preparedAtUTC: new Date().toISOString(),
    timezone: 'Africa/Cairo', node: pkg.engines.node, files: entries,
    excluded: [...blocked, '.env.local', 'API keys', 'browser databases', 'passphrases'],
    deployment: 'Source package only. GitHub upload and Vercel deployment are performed by the owner.',
    liveProviderVerified: false, remoteDeploymentVerified: false };
  await writeFile(path.join(folder, 'PACKAGE_MANIFEST.json'), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}
if (process.argv[2] === '--refresh-manifest') {
  const folder = path.resolve(process.argv[3] ?? '');
  const relative = path.relative(releases, folder);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Package must be inside this project’s releases directory.');
  const result = await manifest(folder);
  console.log(JSON.stringify({ folder, files: result.files.length }));
} else {
  await mkdir(releases, { recursive: true });
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')), label = `AdMorph-${pkg.version}-GitHub-Vercel`;
  let folder = path.join(releases, label), suffix = 2;
  while (await exists(folder)) folder = path.join(releases, `${label}-${suffix++}`);
  await mkdir(folder);
  const files = [];
  for (const file of rootFiles) if (await exists(path.join(root, file))) files.push(path.join(root, file));
  for (const directory of directories) files.push(...await walk(path.join(root, directory)));
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    if (forbidden(relative)) continue;
    const target = path.join(folder, ...relative.split('/'));
    await mkdir(path.dirname(target), { recursive: true }); await copyFile(file, target);
  }
  const record = await manifest(folder);
  console.log(JSON.stringify({ folder, files: record.files.length, bytes: record.files.reduce((sum, entry) => sum + entry.bytes, 0) }));
}
