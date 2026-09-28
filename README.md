# Ayvon — kafe sayti

## Ishga tushirish
1. Node.js LTS o‘rnating.
2. Shu papkada terminal oching va `npm install` bajaring.
3. `.env.example` faylidan nusxa olib `.env` deb nomlang.
4. `.env` ichiga BotFather bergan `BOT_TOKEN` va kafe adminining `ADMIN_CHAT_ID` qiymatini kiriting.
5. `npm start` bajaring va `http://localhost:3000` manzilini oching.

## Telegram botni sozlash
- Telegramda @BotFather orqali `/newbot` buyrug‘i bilan bot yarating.
- Tokenni hech kimga yubormang va GitHub'ga joylamang.
- Admin botga avval `/start` yuborsin. Chat ID ni olish uchun botni ishga tushirgandan keyin Telegram ID ko‘rsatuvchi botdan foydalanish mumkin.
- Saytdagi buyurtma va stol band qilish so‘rovlari admin chatiga keladi.
- Bekor qilish: admin bot chatida `/cancel AY12345678` yuboradi. Saytdagi so‘rov identifikatori Telegram xabarida ko‘rsatiladi.

Eslatma: bu boshlang‘ich versiya. Bekor qilish ID bilgan odamga ochiq; haqiqiy mijozlar uchun telefon/Telegram orqali tasdiqlash va buyurtma egasini tekshirishni qo‘shish kerak. Ma’lumotlar `data.json` faylida saqlanadi; hostingda doimiy disk yoki ma’lumotlar bazasi kerak.
