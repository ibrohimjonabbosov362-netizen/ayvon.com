// Vercel Functions: faqat /api/* so‘rovlari shu funksiyaga keladi.
// Statik fayllar (public/) Vercel CDN orqali beriladi, funksiya ularga tegmaydi.
//
// Vercel bu faylni /api/order, /api/reserve, /api/telegram kabi yo‘llar uchun
// chaqiradi va dinamik qismni req.query.path ga yozadi. Express esa req.url
// bo‘yicha marshrutlaydi, shuning uchun URL'ni asl holiga qaytaramiz.

const { createApp } = require("../lib/app");
const { createBot } = require("../lib/bot");
const storage = require("../lib/storage");

// Menyudagi taomlar. O‘zgarsa, public/app.js dagi ro‘yxat bilan bir xil qilinsin.
const MENU = ["Palov", "Manti", "Sho‘rva", "Lag‘mon", "Salat"];

// Ilova bir marta yaratiladi va issiq (warm) instance ichida qayta ishlatiladi.
let cachedApp = null;

function getApp() {
  if (cachedApp) return cachedApp;

  const adminChatId = process.env.ADMIN_CHAT_ID;

  const bot = createBot({
    token: process.env.BOT_TOKEN,
    adminChatId,
    storage
  });

  cachedApp = createApp({
    bot,
    storage,
    adminChatId,
    menu: MENU,
    trustProxy: true, // Vercel proksi orqasida req.ip to‘g‘ri bo‘lishi uchun
    enableHsts: true, // Vercel har doim HTTPS orqali xizmat qiladi
    allowedOrigins: String(process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  });

  console.log(
    `Ayvon API tayyor. Ombor: ${storage.mode() === "redis" ? "Redis" : "fayl (Vercel'da yozilmaydi)"}`
  );

  return cachedApp;
}

module.exports = (req, res) => {
  const url = String(req.url || "");

  // Agar Vercel asl yo‘lni bermagan bo‘lsa, dinamik qismdan tiklaymiz.
  if (!url.startsWith("/api/")) {
    const parts = req.query && req.query.path;
    const rest = Array.isArray(parts) ? parts.join("/") : String(parts || "");
    req.url = rest ? `/api/${rest}` : "/api";
  }

  let app;

  try {
    app = getApp();
  } catch (error) {
    console.error("Ilovani ishga tushirishda xato:", error.message);
    return res.status(500).json({ error: "Server sozlamalari to‘liq emas." });
  }

  return app(req, res);
};
