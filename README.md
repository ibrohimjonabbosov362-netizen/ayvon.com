# Ayvon — kafe sayti

## Papka tuzilishi
```
public/        -> faqat shu papka HTTP orqali ochiladi (index.html, style.css, app.js)
server.js      -> lokal/VPS uchun server (Express + Telegram polling)
lib/app.js     -> Express ilovasi (marshrutlar, xavfsizlik) — serverless uchun ham umumiy
lib/bot.js     -> Telegram bot va buyruqlar (/start, /id, /cancel)
lib/storage.js -> ma’lumotlar ombori: Redis (Vercel) yoki storage/data.json (lokal)
api/[...path].js -> Vercel Functions kirish nuqtasi (/api/*)
vercel.json    -> Vercel sozlamalari (statik papka va xavfsizlik header’lari)
scripts/set-webhook.js -> Telegram webhook’ni o‘rnatish/o‘chirish
scripts/finish-deploy.js -> deploy’ni tekshirish va webhook’ni xavfsiz o‘rnatish
scripts/vercel-fix.js  -> Vercel loyihasini tuzatish (nom, env var’lar) — token kerak
storage/       -> buyurtmalar va band qilishlar (data.json). Git'ga tushmaydi, ochilmaydi.
.env           -> maxfiy sozlamalar (BOT_TOKEN, ADMIN_CHAT_ID). Git'ga tushmaydi.
.env.example   -> namuna fayl (haqiqiy token YOZILMAYDI)
```

## Ishga tushirish
1. Node.js 18+ (LTS) o‘rnating.
2. Shu papkada terminal oching va `npm install` bajaring.
3. `.env.example` faylidan nusxa olib `.env` deb nomlang.
4. `.env` ichiga BotFather bergan `BOT_TOKEN` va kafe adminining `ADMIN_CHAT_ID` qiymatini kiriting.
5. `npm start` bajaring va `http://localhost:3000` manzilini oching.

> `.env` faylini hech qachon GitHub'ga yubormang. `.gitignore` uni allaqachon himoyalaydi.
> Agar token bir marta oshkor bo‘lgan bo‘lsa, @BotFather orqali **albatta yangilang** (Revoke token).

## Vercel’ga joylash (serverless)

Vercel’da funksiya uzoq vaqt ishlamaydi va disk faqat o‘qish uchun. Shuning uchun:

- Telegram **polling** o‘rniga **webhook** ishlatiladi (`POST /api/telegram`);
- `storage/data.json` ga yozib bo‘lmaydi (Vercel’da), doimiy saqlash uchun **Upstash Redis** qo‘shiladi.
  Redis sozlanmasa ham buyurtma Telegram’ga yetib boradi, lekin tarix saqlanmaydi va `/cancel` ishlamaydi;
- statik sayt (`public/`) Vercel CDN’dan beriladi, API esa `api/[...path].js` funksiyasida ishlaydi.

Qadamlar:

1. Kodni GitHub’ga yuboring (`commit` + `push`).
2. https://vercel.com/new → shu repozitoriyani tanlang (Root Directory: `.`).
3. Project → Settings → Environment Variables ichiga qo‘shing:

   | Nomi | Qiymati |
   |---|---|
   | `BOT_TOKEN` | BotFather bergan token |
   | `ADMIN_CHAT_ID` | admin chat ID |
   | `TELEGRAM_WEBHOOK_SECRET` | `.env` dagi bilan **bir xil** tasodifiy satr |

   Ixtiyoriy (doimiy saqlash uchun): `KV_REST_API_URL`, `KV_REST_API_TOKEN`
   (Vercel → Storage → Upstash Redis; qiymatlar avtomatik beriladi).

4. Deploy qilib domenni oling (masalan `https://ayvon.vercel.app`).

   > **Muhim (tekshirilgan muammo):** loyiha nomida **nuqta bo‘lmasin**. Agar nom
   > `ayvon.com` bo‘lsa, Vercel domenni `ayvon.com.vercel.app` qiladi — bu 3 bo‘g‘inli
   > nom umumiy `*.vercel.app` sertifikatiga tushmaydi va sayt **TLS xatosi bilan
   > umuman ochilmaydi** (edge `DEPLOYMENT_NOT_FOUND` qaytaradi). Yechim: Settings →
   > General → Project Name ni `ayvon` ga o‘zgartirish (yoki o‘z domeningizni ulash).
   > Nom o‘zgarsa yoki env var qo‘shilsa, yangi deploy kerak (bo‘sh commit yetarli:
   > `git commit --allow-empty -m "chore: redeploy" ; git push`).

   Nom va env var’larni token bilan avtomatik tuzatish:

   ```
   $env:VERCEL_TOKEN="<vercel.com/account/tokens dan olingan token>"
   node scripts/vercel-fix.js            # faqat tekshiruv
   node scripts/vercel-fix.js --apply    # nom + yetishmayotgan env var’larni tuzatadi
   ```

5. Webhook’ni lokal kompyuterdan o‘rnating:

   ```
   node scripts/set-webhook.js https://<domen>
   node scripts/set-webhook.js --info     (tekshirish)
   node scripts/set-webhook.js --delete   (o‘chirish)
   ```

> **Muhim:** webhook o‘rnatilgandan keyin Telegram polling ishlamaydi (409 Conflict).
> Shu sababli lokal `node server.js` ni to‘xtating yoki `USE_WEBHOOK=1` bilan ishga tushiring.

Deploy’dan keyin tekshiriladigan narsalar:

- `https://<domen>/` → 200; `/.env`, `/data.json`, `/server.js`, `/storage/data.json` → 404;
- javob header’ida CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` bor;
- saytdagi formadan buyurtma yuborilsa admin chatiga xabar keladi.

6. Tekshirish va webhook’ni bir buyruqda o‘rnatish (tavsiya):

   ```
   node scripts/finish-deploy.js https://<domen>              # tekshirib, webhook o‘rnatadi
   node scripts/finish-deploy.js https://<domen> --no-webhook # faqat tekshiradi
   ```

   Skript sayt 200 qaytarishini, resurslarni, yopiq fayllarni va
   `/api/telegram` himoyasini (sarlavhasiz so‘rov 403 bo‘lishi) tekshiradi.
   Himoya tasdiqlanmasa webhook **o‘rnatilmaydi** — bu buyurtmalar xavfsizligi uchun.

## Telegram botni sozlash
- Telegramda @BotFather orqali `/newbot` buyrug‘i bilan bot yarating.
- Tokenni hech kimga yubormang va GitHub'ga joylamang.
- Admin botga avval `/start` yuborsin; chat ID olish uchun botga `/id` yuboring.
- Saytdagi buyurtma va stol band qilish so‘rovlari admin chatiga keladi.
- Bekor qilish: admin bot chatida `/cancel AY12345678` yuboradi (faqat `ADMIN_CHAT_ID` ishlaydi).

## Xavfsizlik (amalga oshirilgan)
- `express.static` faqat `public/` papkani beradi: `.env`, `server.js`, `storage/data.json`,
  `.git`, `node_modules` HTTP orqali ochilmaydi.
- Xavfsizlik header'lari: CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`; `x-powered-by` o‘chirilgan.
- IP asosidagi rate limit: 10 daqiqada 8 ta so‘rov (`/api/order`, `/api/reserve`).
- Origin tekshiruvi: faqat shu domendan (yoki `ALLOWED_ORIGINS` ro‘yxatidan) so‘rov qabul qilinadi.
- Kiritishni tekshirish: taom menyudan olinadi, telefon/sana/vaqt formati qat’iy,
  yangi qator va boshqaruv belgilari tozalanadi.
- Ma’lumotlar `storage/data.json` ga atomik (tmp + rename) va navbat bilan yoziladi.
- Xato loglarida faqat `error.message` yoziladi (token logga tushmaydi).

## Sozlamalar (.env)
| O‘zgaruvchi | Tavsif |
|---|---|
| `BOT_TOKEN` | BotFather bergan token (majburiy) |
| `ADMIN_CHAT_ID` | Buyurtmalar keladigan admin chat ID (majburiy) |
| `PORT` | Server porti (default 3000) |
| `TRUST_PROXY=1` | nginx/reverse-proxy orqasida ishlasa (to‘g‘ri IP uchun) |
| `ENABLE_HSTS=1` | HTTPS orqasida HSTS header qo‘shadi |
| `ALLOWED_ORIGINS` | API uchun ruxsat etilgan domenlar, vergul bilan |
| `USE_WEBHOOK=1` | Polling o‘chadi: update’lar `POST /api/telegram` ga keladi |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram webhook so‘rovini tasdiqlovchi maxfiy satr (Vercel’da majburiy) |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis (doimiy saqlash; Vercel’da kerak) |

## Keyingi qadamlar (tavsiya)
- Ma’lumotlarni bazaga (SQLite/Postgres) ko‘chirish, eski yozuvlar uchun arxiv/retention siyosati.
- Buyurtma/band qilishni mijozga SMS yoki Telegram orqali tasdiqlash.
- Admin uchun alohida panel (parol bilan) va audit log.
- HTTPS + zaxira nusxa (backup) + monitoring.
- `node-telegram-bot-api` (ichi `request`/`tough-cookie` zaif paketlarini olib keladi) o‘rniga
  `telegraf` yoki `grammy` ga o‘tish.


Eslatma: `.env` (BOT_TOKEN) va `data.json` (mijoz ma’lumotlari) ilgari git'ga commit qilingan edi — endi ular kuzatilmaydi (`.gitignore`). Agar token oshkor bo‘lgan bo‘lsa, @BotFather orqali albatta yangilang va tarixdan ham o‘chirish uchun `git filter-repo` yoki BFG ishlating. Shu bilan birga bu hali boshlang‘ich versiya. Bekor qilish ID bilgan odamga ochiq; haqiqiy mijozlar uchun telefon/Telegram orqali tasdiqlash va buyurtma egasini tekshirishni qo‘shish kerak. Ma’lumotlar `storage/data.json` faylida saqlanadi (veb orqali ochilmaydi); hostingda doimiy disk yoki ma’lumotlar bazasi kerak.
