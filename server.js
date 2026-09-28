// Ayvon — lokal kompyuter yoki VPS uchun server (doimiy jarayon).
//
// Vercel/serverless muhit uchun alohida kirish nuqtasi bor: api/[...path].js
// (u ham shu lib/ papkasidagi kodni ishlatadi, faqat listen va polling yo‘q).

require("dotenv").config();

const path = require("path");

const { createApp } = require("./lib/app");
const { createBot } = require("./lib/bot");
const storage = require("./lib/storage");

const {
  BOT_TOKEN,
  ADMIN_CHAT_ID,
  PORT = 3000,
  TRUST_PROXY,
  ENABLE_HSTS,
  ALLOWED_ORIGINS,
  USE_WEBHOOK
} = process.env;

if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
  console.error("BOT_TOKEN va ADMIN_CHAT_ID .env faylida ko‘rsatilishi kerak.");
  process.exit(1);
}

// Menyudagi taomlar. O‘zgarsa, public/app.js dagi ro‘yxat bilan bir xil qilinsin.
const MENU = ["Palov", "Manti", "Sho‘rva", "Lag‘mon", "Salat"];

const allowedOrigins = String(ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const bot = createBot({ token: BOT_TOKEN, adminChatId: ADMIN_CHAT_ID, storage });

const app = createApp({
  bot,
  storage,
  adminChatId: ADMIN_CHAT_ID,
  menu: MENU,
  trustProxy: TRUST_PROXY === "1",
  enableHsts: ENABLE_HSTS === "1",
  allowedOrigins
});

// USE_WEBHOOK=1 bo‘lsa update'lar webhook orqali keladi (masalan, ngrok bilan sinov),
// aks holda lokal rejimda polling ishlaydi. Telegram bir vaqtda ikkalasini qabul qilmaydi.
if (USE_WEBHOOK === "1") {
  console.log("Polling o‘chirilgan (USE_WEBHOOK=1): update'lar POST /api/telegram ga keladi.");
} else {
  bot.startPolling();

  bot.on("polling_error", (error) => {
    console.error("Telegram polling:", error.message);
  });
}

// Kutilmagan promise xatolari serverni yiqitmasin
process.on("unhandledRejection", (error) => {
  console.error("Kutilmagan xato:", (error && error.message) || error);
});

// Serverni ishga tushirish
app.listen(PORT, () => {
  console.log(`Ayvon server http://localhost:${PORT}`);
  console.log(`Statik fayllar: ${path.join(__dirname, "public")}`);
  console.log(
    `Ma’lumotlar ombori: ${storage.mode() === "redis" ? "Redis" : "storage/data.json"}`
  );
});
