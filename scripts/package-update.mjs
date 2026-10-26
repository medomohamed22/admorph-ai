import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releases = path.join(root, 'releases');
function within(parent, relative) {
  const full = path.resolve(parent, relative); const part = path.relative(parent, full);
  if (!part || part.startsWith('..') || path.isAbsolute(part)) throw new Error('Path must stay inside the package directory.');
  return full;
}
async function exists(file) { try { await access(file); return true; } catch { return false; } }
const baseline = path.join(releases, 'AdMorph-GitHub-Vercel');
const current = within(releases, process.argv[2] ?? 'AdMorph-GitHub-Vercel-2');
const before = JSON.parse(await readFile(path.join(baseline, 'PACKAGE_MANIFEST.json'), 'utf8'));
const after = JSON.parse(await readFile(path.join(current, 'PACKAGE_MANIFEST.json'), 'utf8'));
const old = new Map(before.files.map(file => [file.path, file.sha256]));
const next = new Map(after.files.map(file => [file.path, file.sha256]));
const changed = after.files.filter(file => old.get(file.path) !== file.sha256);
const removed = before.files.filter(file => !next.has(file.path)).map(file => file.path);
let folder = path.join(releases, 'Campaign-Workflow-Update'), suffix = 2;
while (await exists(folder)) folder = path.join(releases, `Campaign-Workflow-Update-${suffix++}`);
const files = path.join(folder, 'files'); await mkdir(files, { recursive: true });
for (const item of changed) {
  const source = within(current, item.path), target = within(files, item.path);
  const bytes = await readFile(source);
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw new Error(`Source hash mismatch: ${item.path}`);
  await mkdir(path.dirname(target), { recursive: true }); await copyFile(source, target);
}
await copyFile(path.join(current, 'PACKAGE_MANIFEST.json'), path.join(files, 'PACKAGE_MANIFEST.json'));
const commit = 'feat: improve creative studio and campaign workflow';
const title = 'Improve campaign planning and creative workflow';
const body = `Adds product-image briefs, saved campaign drafts, Gemini planning with explicit consent, and three editable concepts with individual approval. Existing Brand Kits and provider settings are preserved by an additive storage migration.\n\nIncludes a clearly labelled local sample mode and English/Arabic UI. Image generation remains planned.\n\nValidation: lint, TypeScript, 70 unit tests, 84 browser checks across desktop/mobile, and production build/smoke. Gemini request handling uses synthetic fixtures; an authenticated live Gemini call has not been verified.\n`;
await writeFile(path.join(folder, 'COMMIT_MESSAGE.txt'), commit + '\n');
await writeFile(path.join(folder, 'PR_TITLE.txt'), title + '\n');
await writeFile(path.join(folder, 'PR_BODY.md'), body);
await writeFile(path.join(folder, 'DELETE_FILES.txt'), removed.length ? removed.join('\n') + '\n' : 'No file deletions are required.\n');
await writeFile(path.join(folder, 'UPDATE_MANIFEST.json'), JSON.stringify({ preparedAtUTC: new Date().toISOString(), baseVersion: before.version,
  version: after.version, changed: changed.map(item => ({ ...item, action: old.has(item.path) ? 'modified' : 'added' })), removed,
  manifestIncluded: true, uploadedFiles: changed.length + 1, paidApiCalls: false, remotePublication: false }, null, 2) + '\n');
await writeFile(path.join(folder, 'HOW_TO_UPLOAD_AR.md'), `# رفع التحديث يدويًا\n\nهذه الحزمة مخصّصة لتحديث نسخة المصدر السابقة AdMorph 0.3.0 في GitHub. مجلد النسخة السابقة لم يتغيّر.\n\n1. افتح مستودع المشروع، وارجع إلى الفرع main.\n2. من قائمة الفروع أنشئ فرعًا باسم feature/creative-workflow.\n3. افتح Add file ثم Upload files.\n4. من مجلد files داخل هذه الحزمة، ارفع **المحتويات** مع مجلداتها الفرعية إلى جذر المستودع حيث package.json. لا ترفع مجلد files نفسه ولا ملف ZIP. لا ترفع ملفات التعليمات وCOMMIT_MESSAGE وUPDATE_MANIFEST الموجودة خارج files. احتفظ بالمسارات؛ الملفات القديمة بالمسار نفسه تُستبدل.\n5. راجع الملفات؛ العدد ${changed.length + 1} بما فيه PACKAGE_MANIFEST.json. ${removed.length ? 'راجع DELETE_FILES.txt واحذف المسارات المذكورة من الفرع.' : 'لا توجد ملفات مطلوب حذفها.'}\n6. انسخ سطر COMMIT_MESSAGE.txt إلى خانة Commit message، ثم احفظ التغييرات على الفرع.\n7. اختر Compare & pull request: القاعدة main والمقارنة feature/creative-workflow. انسخ عنوان PR_TITLE.txt ووصف PR_BODY.md.\n8. أنشئ الـPR، انتظر فحص CI، راجع التغييرات ثم Merge pull request. إذا كان Vercel مربوطًا بفرع main فسيبدأ النشر بعد الدمج حسب إعدادات مشروعك.\n\nCommit message:\n\n\`\`\`text\n${commit}\n\`\`\`\n\nPR title:\n\n\`\`\`text\n${title}\n\`\`\`\n\nيمكن عمل أكثر من تحديث حقيقي في اليوم نفسه. استخدم لكل تحديث وصفًا يعكس محتواه؛ لا تحتاج ذكر رقم اليوم أو تغيير التواريخ. لم يتم رفع أي ملف أو نشر الموقع تلقائيًا.\n`);
console.log(JSON.stringify({ folder, files: changed.length + 1, added: changed.filter(item => !old.has(item.path)).length,
  modified: changed.filter(item => old.has(item.path)).length, removed: removed.length, commit, title }));
