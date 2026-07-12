# Blogger Control

لوحة تحكم (Admin Dashboard) لإدارة مدونة Blogger، تعمل بالكامل على GitHub Pages بدون أي Framework — HTML + CSS + JavaScript خالص.

```
├── index.html
├── css/{style.css, dark.css}
├── js/{ui, auth, blogger, uploader, generator, projects, app}.js
├── data/{projects.json, config.enc}
└── assets/
```

## التشغيل السريع

1. ارفع المجلد كاملاً إلى مستودع GitHub وفعّل GitHub Pages من إعدادات المستودع.
2. افتح الصفحة المنشورة. بما أنه لا يوجد `data/config.enc` بعد، ستظهر لك شاشة **"إعداد أول مرة"**:
   اختر كلمة مرور، ثم أدخل: `Blog ID`، بيانات Google OAuth (Client ID/Secret + Refresh Token)، مفتاح ImgBB، ومفتاح/بيانات GitHub (Owner/Repo/Token).
3. إذا أدخلت GitHub Token صالحاً، سيقوم التطبيق بحفظ `config.enc` مباشرة في المستودع عبر GitHub Contents API. إن لم تُدخله، سيُنزَّل الملف محلياً وعليك رفعه يدوياً إلى `data/config.enc`.
4. من الآن فصاعداً، الدخول يتم فقط بكلمة المرور — لا تُخزَّن في أي مكان، وتُستخدم فقط لفك تشفير `config.enc` في تلك الجلسة.

## من أين تحصل على كل مفتاح

- **Blog ID**: من Blogger → الإعدادات → معرّف المدونة الرقمي في الرابط.
- **Google OAuth Client ID/Secret**: من Google Cloud Console → إنشاء بيانات اعتماد OAuth 2.0 (نوع Desktop app) وتفعيل Blogger API v3.
- **Refresh Token**: نفّذ تدفق الموافقة مرة واحدة يدوياً (أو استخدم زر "Generate OAuth Link" داخل التطبيق عند أول فشل اتصال) للحصول عليه.
- **ImgBB API Key**: من imgbb.com/api عبر حساب مجاني.
- **GitHub Token**: أنشئ Fine-grained Personal Access Token بصلاحية **Contents: Read and write** على هذا المستودع فقط.

## لماذا GitHub API مطلوب لحفظ التغييرات؟

GitHub Pages استضافة **ثابتة بالكامل** — الصفحة لا يمكنها كتابة ملفات على القرص. لذلك أي حفظ لـ `projects.json` أو `config.enc` (مثلاً بعد إضافة مشروع أو تحديث الإعدادات) يتم عملياً بإرسال طلب `PUT` إلى GitHub Contents API لعمل commit جديد في المستودع من داخل المتصفح. هذا يعني:

- كل حفظ = commit جديد في تاريخ المستودع.
- بدون GitHub Token صالح، الحفظ التلقائي غير ممكن — ستحصل بدلاً منه على تنزيل يدوي للملف.

## ملاحظات أمنية مهمة (رجاءً اقرأها)

- التشفير المستخدم هو **AES-256-GCM** مع اشتقاق مفتاح عبر **PBKDF2 (150,000 تكرار)**. هذا يحمي الأسرار في حالة السكون (داخل تاريخ Git أو على القرص) وخلف كلمة مرور من الوصول العرضي.
- لكن هذا **ليس مكافئاً لخزنة أسرار من جهة خادم (server-side secret store)**. أي شخص يملك كلمة المرور وصفحة مفتوحة يمكنه الوصول للأسرار عبر أدوات المطوّر في المتصفح — هذه طبيعة أي تطبيق يعمل بالكامل من جهة العميل (client-side) على استضافة ثابتة.
- استخدم دائماً صلاحيات محدودة قدر الإمكان: GitHub Token بصلاحية Contents فقط على هذا المستودع، وعميل Google OAuth مخصص لهذا الاستخدام فقط.
- عامل هذه اللوحة كأداة شخصية لإدارة مدونتك الخاصة، وليس كلوحة تحكم متعددة المستخدمين.

## تجديد Refresh Token تلقائياً

عند فشل أي طلب لـ Blogger API برسالة `invalid_grant` أو `expired_refresh_token`:

1. لا تتوقف الصفحة ولا تُعاد تحميلها.
2. يظهر Dialog يحتوي زر **"Generate OAuth Link"** يفتح صفحة موافقة Google.
3. تلصق **Authorization Code** الناتج داخل نفس الـ Dialog.
4. يقوم التطبيق تلقائياً بتبادل الرمز عن Refresh Token جديد، تحديث `config.enc` (commit جديد عبر GitHub API)، ثم إعادة محاولة الطلب الأصلي.

**ملاحظة على CORS**: هذا التدفق يعتمد على أن نقطة `https://oauth2.googleapis.com/token` تقبل الطلب من متصفحك مباشرة. إذا واجهت خطأ CORS من طرف المتصفح، فهذا قيد من جهة Google على نوع بيانات الاعتماد المستخدمة، ولا حل له من داخل تطبيق ثابت بدون خادم وسيط (proxy) — الحل البديل عندها هو تنفيذ هذه الخطوة يدوياً من الطرفية (curl/Postman) ولصق الـ Refresh Token الجديد في صفحة الإعدادات.

## عداد التحميل في صفحة التحميل المولّدة

العداد المعروض في الصفحة المولّدة هو عداد محلي تقريبي (يعتمد على `localStorage` في متصفح كل زائر) لغرض تحسين تجربة الاستخدام فقط — وليس عداد تحليلات دقيق عبر كل الزوار، لأن منشورات Blogger صفحات HTML ثابتة بلا خادم خلفي. لعداد حقيقي متعدد الزوار، اربط الزر بخدمة عدّاد خارجية (مثل CountAPI أو خدمة مشابهة) داخل نفس السكربت.

## بنية الوحدات (Modules)

| ملف | مسؤوليته |
|---|---|
| `js/ui.js` | Toasts، Modals، Loading overlay، الوضع الليلي، أدوات عامة |
| `js/auth.js` | تشفير/فك تشفير `config.enc`، تدفق OAuth وتجديد الاتصال، عميل GitHub API |
| `js/blogger.js` | `publishPost` `updatePost` `deletePost` `getPosts` `searchPosts` `uploadImage` |
| `js/uploader.js` | السحب والإفلات، الضغط، شريط التقدم، إعادة الترتيب |
| `js/generator.js` | توليد صفحة التحميل الكاملة (SEO + Schema.org + OG + Twitter Card) |
| `js/projects.js` | إدارة `projects.json` عبر GitHub Contents API |
| `js/app.js` | التوجيه بين الصفحات، شاشة القفل، لوحة المعلومات، المعالج (Wizard)، الإعدادات |

## القيود المعروفة

- لا توجد Virtualization كاملة لقوائم ضخمة جداً (آلاف المقالات) — التصفح يعتمد على `pageToken` من Blogger API بدلاً من ذلك، وهو أخف من تحميل كل شيء دفعة واحدة.
- الرفع يعتمد على ImgBB لأن Blogger API v3 لا يوفر نقطة رفع وسائط مباشرة.
- لا يوجد Build step أو حزم (bundler) — الملفات تُحمَّل كما هي عبر `<script>` عادية، لذلك ترتيب التحميل في `index.html` مهم (`ui → auth → blogger → uploader → generator → projects → app`).
