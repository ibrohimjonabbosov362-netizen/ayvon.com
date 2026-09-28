# Ayvon — kafe sayti

## Papka tuzilishi
```
public/        -> faqat shu papka HTTP orqali ochiladi (index.html, style.css, app.js)
server.js      -> Express server + Telegram bot
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

## Keyingi qadamlar (tavsiya)
- Ma’lumotlarni bazaga (SQLite/Postgres) ko‘chirish, eski yozuvlar uchun arxiv/retention siyosati.
- Buyurtma/band qilishni mijozga SMS yoki Telegram orqali tasdiqlash.
- Admin uchun alohida panel (parol bilan) va audit log.
- HTTPS + zaxira nusxa (backup) + monitoring.
- `node-telegram-bot-api` (ichi `request`/`tough-cookie` zaif paketlarini olib keladi) o‘rniga
  `telegraf` yoki `grammy` ga o‘tish.


Eslatma: `.env` (BOT_TOKEN) va `data.json` (mijoz ma’lumotlari) ilgari git'ga commit qilingan edi — endi ular kuzatilmaydi (`.gitignore`). Agar token oshkor bo‘lgan bo‘lsa, @BotFather orqali albatta yangilang va tarixdan ham o‘chirish uchun `git filter-repo` yoki BFG ishlating. Shu bilan birga bu hali boshlang‘ich versiya. Bekor qilish ID bilgan odamga ochiq; haqiqiy mijozlar uchun telefon/Telegram orqali tasdiqlash va buyurtma egasini tekshirishni qo‘shish kerak. Ma’lumotlar `storage/data.json` faylida saqlanadi (veb orqali ochilmaydi); hostingda doimiy disk yoki ma’lumotlar bazasi kerak.
