# رفع تحديث AdMorph إلى GitHub وفتح Pull Request

هذه نسخة مصدر كاملة بأحدث التغييرات، وليست ملف تحديث يفترض نسخة قديمة بعينها. فك الضغط أولاً؛ ارفع ملفات المشروع نفسها. ضع package.json وباقي الملفات في نفس مكان ملفات التطبيق الحالية، بدون إضافة مجلد خارجي جديد حولها.

## الطريقة الأسهل: GitHub Desktop

1. افتح GitHub Desktop وسجّل دخولك بحساب GitHub الذي يملك المستودع. استخدم بريداً مرتبطاً بالحساب ضمن File > Options > Git.
2. اختر File > Clone repository، ثم مستودع المشروع. إذا كان موجوداً لديك بالفعل، افتحه، اختر main ثم Fetch origin وPull origin إن ظهر تحديث.
3. اختر Current Branch > New Branch، واكتب feature/meta-workflow-update. اجعل المصدر main، أو الفرع الافتراضي الفعلي للمستودع إن اختلف اسمه. اضغط Create Branch.
4. اختر Repository > Show in Explorer. انسخ محتويات ملف ZIP بعد فكّه إلى مكان التطبيق في هذا المستودع ووافق على استبدال الملفات. يجب أن يستبدل package.json الموجود بالفعل، وليس أن يصبح داخل مجلد إضافي. احتفظ بمجلد .git الموجود في النسخة المستنسخة.
5. ارجع إلى GitHub Desktop وراجع Changes. رسالة الـcommit المقترحة:

   Improve Meta integration and creative workflows

6. اضغط Commit to feature/meta-workflow-update، ثم Publish branch. إذا كان الفرع منشوراً من قبل، اضغط Push origin.
7. افتح مستودعك على موقع GitHub واضغط Compare & pull request. أو استخدم Pull requests > New pull request.
8. اختر base: main وcompare: feature/meta-workflow-update. استخدم عنوان ووصف الطلب أدناه ثم Create pull request.
9. راجع تبويب Files changed والفحوصات. عندما تريد إدخال التحديث إلى main وبعد نجاح الفحوصات، اضغط Merge pull request ثم Confirm merge.

إن كان اسم الفرع مستخدماً، اختر اسماً جديداً مثل feature/meta-workflow-update-2. لا تنشئ مستودعاً جديداً لهذا التحديث.

## بديل: الرفع من متصفح GitHub فقط

GitHub يقبل حتى 100 ملف في عملية رفع واحدة. هذه الحزمة أكبر من ذلك، ولذلك تحتاج إلى أربع دفعات مع الحفاظ على المسارات:

1. افتح المستودع على GitHub واختر الفرع الافتراضي main. افتح قائمة الفروع، اكتب feature/meta-workflow-update، ثم Create branch. تأكد أن الفرع الجديد هو المختار قبل كل رفع.
2. من جذر التطبيق في المستودع اختر Add file > Upload files. اسحب كل محتويات الحزمة المفكوكة **عدا src وdocs**. تشمل هذه الدفعة ملفات الجذر و.github وpublic وscripts وtests. ارفع المحتويات، وليس مجلد الحزمة الخارجي أو ملف ZIP نفسه. هذه الدفعة أقل من 100 ملف. اكتب Update project configuration, assets and checks ثم Commit changes إلى الفرع الجديد.
3. في جذر التطبيق نفسه اختر Upload files وارفع مجلد docs كاملاً (56 ملفاً)، ثم Commit changes بعنوان Update project documentation and validation evidence.
4. افتح مجلد src داخل مستودع GitHub. اختر Upload files وارفع مجلدات app وcomponents وmessages من src في النسخة المفكوكة (59 ملفاً). بهذا تبقى المسارات src/app وsrc/components وsrc/messages صحيحة. اكتب Improve creative workflows and Meta feedback ثم Commit changes.
5. وأنت داخل src في المستودع، ارفع مجلد lib من src في النسخة المفكوكة (59 ملفاً). اكتب Improve Meta request handling and model selection ثم Commit changes.
6. بعد اكتمال الدفعات الأربع افتح Pull requests > New pull request. اختر main كـbase والفرع الجديد كـcompare، ثم Create pull request. انتظر الفحوصات النهائية بعد آخر دفعة قبل الدمج؛ أثناء رفع الدفعات تكون النسخة على الفرع غير مكتملة.

## عنوان ووصف PR جاهزان للنسخ

Title:

Improve Meta integration and creative workflows

Description:

```markdown
## Changes
- Improve Meta model selection and direct brand/image workflows.
- Make preliminary model tests optional while preserving explicit request consent.
- Improve request validation and redact sensitive data from error diagnostics.
- Fix development reload instability and update supporting checks and documentation.

## Validation
- 150 unit tests passed.
- Three focused browser checks passed for local request validation across desktop and mobile sizes.
- Lint, type checking and an independent production build passed.
- Local no-provider request validation returned HTTP 200 with zero Meta calls.
- Paid Meta generation and remote deployment have not been verified by this release check.
```

## ما الذي يسجله GitHub؟

الـcommits المنشورة والـPR تسجل تحديثاتك بوقتها الفعلي ويمكن الرجوع إلى تفاصيل الملفات والفحوصات. استخدم بريد Git مرتبطاً بحسابك لنسبة الـcommits إليك. ظهور الـcommits في رسم المساهمات له شروط منها وجودها في الفرع الافتراضي؛ افتح PR ثم ادمجه بعد المراجعة عندما يصبح جاهزاً.

## التشغيل والنشر

الحزمة تستبعد node_modules و.next و.env.local والمفاتيح وبيانات المستخدم المحلية. للتشغيل المحلي: npm ci ثم npm run dev. اتبع DEPLOY_GITHUB_VERCEL_AR.md للنشر، واجعل Root Directory في Vercel مكان package.json. لا تحتاج إلى رفع ملف ZIP نفسه ككود للموقع.

لم يتم رفع المستودع أو نشر الموقع نيابة عنك.

## المراجع الرسمية

- https://docs.github.com/en/desktop/making-changes-in-a-branch/managing-branches-in-github-desktop
- https://docs.github.com/en/desktop/making-changes-in-a-branch/committing-and-reviewing-changes-to-your-project-in-github-desktop
- https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
