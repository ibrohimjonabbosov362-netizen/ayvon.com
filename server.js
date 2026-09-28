require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");

const {
  BOT_TOKEN,
  ADMIN_CHAT_ID,
  PORT = 3000,
  TRUST_PROXY,
  ENABLE_HSTS,
  ALLOWED_ORIGINS
} = process.env;

if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
  console.error("BOT_TOKEN va ADMIN_CHAT_ID .env faylida ko‘rsatilishi kerak.");
  process.exit(1);
}

// Menyudagi taomlar. O‘zgarsa, public/app.js dagi ro‘yxat bilan bir xil qilinsin.
const MENU = ["Palov", "Manti", "Sho‘rva", "Lag‘mon", "Salat"];

const app = express();
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Faqat shu papka HTTP orqali beriladi: .env, server.js, data.json, .git, node_modules yopiq.
const publicDir = path.join(__dirname, "public");
// Mijozlarning shaxsiy ma’lumotlari (PII) kod papkasidan tashqarida saqlanadi.
const storageDir = path.join(__dirname, "storage");
const dataFile = path.join(storageDir, "data.json");
const legacyDataFile = path.join(__dirname, "data.json");

fs.mkdirSync(storageDir, { recursive: true });

if (!fs.existsSync(dataFile) && fs.existsSync(legacyDataFile)) {
  fs.renameSync(legacyDataFile, dataFile);
  console.log("data.json storage/ papkasiga ko‘chirildi.");
}

if (TRUST_PROXY === "1") app.set("trust proxy", 1);
app.disable("x-powered-by");

// Xavfsizlik header'lari
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self' https://images.unsplash.com data:",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "object-src 'none'"
    ].join("; ")
  );

  if (ENABLE_HSTS === "1") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  next();
});

app.use(express.json({ limit: "20kb" }));

// Statik sayt — faqat public/ papkasi, dotfile'lar butunlay bloklangan
app.use(
  express.static(publicDir, {
    dotfiles: "deny",
    index: "index.html",
    maxAge: "1h",
    fallthrough: true
  })
);

/* --------------------------- yordamchi funksiyalar --------------------------- */

// IP asosidagi oddiy rate limit (qo‘shimcha kutubxona talab qilmaydi)
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 8;
const rateHits = new Map();

function rateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const hits = (rateHits.get(key) || []).filter((time) => now - time < RATE_WINDOW_MS);

  if (hits.length >= RATE_MAX) {
    const retryAfter = Math.ceil((RATE_WINDOW_MS - (now - hits[0])) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({
      error: "Juda ko‘p so‘rov yuborildi. Iltimos, keyinroq urinib ko‘ring."
    });
  }

  hits.push(now);
  rateHits.set(key, hits);
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of rateHits) {
    if (!hits.some((time) => now - time < RATE_WINDOW_MS)) rateHits.delete(key);
  }
}, 5 * 60 * 1000).unref();

// Begona saytlar orqali forma spam qilinishining oldini olish
const allowedOrigins = String(ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

function sameOriginOnly(req, res, next) {
  const origin = req.get("origin");
  if (!origin) return next(); // brauzerdan bo‘lmagan so‘rov (curl, monitoring)

  if (allowedOrigins.length) {
    return allowedOrigins.includes(origin)
      ? next()
      : res.status(403).json({ error: "Ruxsat etilmagan manba." });
  }

  let originHost = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: "Ruxsat etilmagan manba." });
  }

  return originHost && originHost === req.get("host")
    ? next()
    : res.status(403).json({ error: "Ruxsat etilmagan manba." });
}

function readData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    return {
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      reservations: Array.isArray(parsed.reservations) ? parsed.reservations : []
    };
  } catch {
    return { orders: [], reservations: [] };
  }
}

// Avval vaqtinchalik faylga yozib, keyin nomini almashtiramiz — chala fayl qolmaydi
function writeData(data) {
  const tmpFile = path.join(storageDir, `.data-${process.pid}-${Date.now()}.tmp`);
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, dataFile);
}

// Bir vaqtda kelgan so‘rovlar bir-birining yozuvini o‘chirmasligi uchun navbat
let writeQueue = Promise.resolve();

function updateData(mutate) {
  writeQueue = writeQueue.then(() => {
    const data = readData();
    mutate(data);
    writeData(data);
  });

  return writeQueue.catch((error) => {
    console.error("Ma’lumotni saqlashda xato:", error.message);
  });
}

function makeId() {
  return "AY" + Date.now().toString().slice(-8);
}

// Bir qatorli maydon: yangi qator va boshqaruv belgilari olib tashlanadi
function cleanLine(value, max = 120) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

// Ko‘p qatorli maydon: yangi qator qoladi, boshqa boshqaruv belgilari olib tashlanadi
function cleanText(value, max = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

function validPhone(value) {
  return /^[+0-9()\s-]{7,20}$/.test(String(value ?? "").trim());
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/* ------------------------------- API yo‘llari ------------------------------- */

// Yangi buyurtma
app.post("/api/order", rateLimit, sameOriginOnly, async (req, res) => {
  const body = req.body || {};

  const dish = cleanLine(body.dish, 60);
  const name = cleanLine(body.name, 80);
  const phone = cleanLine(body.phone, 20);
  const message = cleanText(body.message, 500);
  const quantity = Number(body.quantity);

  if (
    !MENU.includes(dish) ||
    name.length < 2 ||
    !validPhone(phone) ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 50
  ) {
    return res.status(400).json({
      error: "Ma’lumotlarni to‘g‘ri kiriting."
    });
  }

  const id = makeId();

  const item = {
    id,
    type: "order",
    dish,
    quantity,
    name,
    phone,
    message,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  await updateData((data) => data.orders.push(item));

  try {
    await bot.sendMessage(
      ADMIN_CHAT_ID,
      `🛎 YANGI BUYURTMA

🆔 ${id}
🍽 ${item.dish}
🔢 Soni: ${item.quantity}
👤 ${item.name}
📞 ${item.phone}
📝 ${item.message || "Izoh yo‘q"}

Bekor qilish: /cancel ${id}`
    );

    res.json({ ok: true, id });
  } catch (error) {
    console.error("Buyurtmani Telegramga yuborishda xato:", error.message);
    res.status(502).json({
      error: "Telegramga yuborilmadi. Bot sozlamalarini tekshiring."
    });
  }
});

// Stol band qilish
app.post("/api/reserve", rateLimit, sameOriginOnly, async (req, res) => {
  const body = req.body || {};

  const name = cleanLine(body.name, 80);
  const phone = cleanLine(body.phone, 20);
  const date = cleanLine(body.date, 10);
  const time = cleanLine(body.time, 5);
  const message = cleanText(body.message, 500);
  const guests = Number(body.guests);
  const today = new Date().toISOString().slice(0, 10);

  if (
    name.length < 2 ||
    !validPhone(phone) ||
    !validDate(date) ||
    date < today ||
    !validTime(time) ||
    !Number.isInteger(guests) ||
    guests < 1 ||
    guests > 100
  ) {
    return res.status(400).json({
      error: "Barcha majburiy maydonlarni to‘g‘ri to‘ldiring."
    });
  }

  const id = makeId();

  const item = {
    id,
    type: "reservation",
    name,
    phone,
    date,
    time,
    guests,
    message,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  await updateData((data) => data.reservations.push(item));

  try {
    await bot.sendMessage(
      ADMIN_CHAT_ID,
      `📅 YANGI JOY BAND QILISH

🆔 ${id}
👤 ${item.name}
📞 ${item.phone}
📆 ${item.date} ${item.time}
👥 Mehmonlar: ${item.guests}
📝 ${item.message || "Izoh yo‘q"}

Bekor qilish: /cancel ${id}`
    );

    res.json({ ok: true, id });
  } catch (error) {
    console.error("Band qilish xabarini yuborishda xato:", error.message);
    res.status(502).json({
      error: "Telegramga yuborilmadi. Bot sozlamalarini tekshiring."
    });
  }
});

/* ----------------------------- Telegram buyruqlari ---------------------------- */

// /start buyrug‘i
bot.onText(/^\/start$/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `Assalomu alaykum! Ayvon kafesi botiga xush kelibsiz.

Buyurtma yoki joy band qilish uchun saytimizdagi shakllardan foydalaning.

Buyurtmani bekor qilish: /cancel BUYURTMA_ID`
  );
});

// Telegram ID ni olish
bot.onText(/^\/id$/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `Sizning Telegram ID: ${msg.chat.id}`
  );
});

// /cancel buyrug‘i — faqat admin uchun
bot.onText(/^\/cancel(?:\s+([A-Za-z0-9]+))?$/, async (msg, match) => {
  if (String(msg.chat.id) !== String(ADMIN_CHAT_ID)) {
    return bot.sendMessage(
      msg.chat.id,
      "Buyurtmani bekor qilish huquqi faqat admin uchun."
    );
  }

  const id = match[1];

  if (!id) {
    return bot.sendMessage(
      msg.chat.id,
      "Bekor qilish uchun ID yuboring: /cancel AY12345678"
    );
  }

  let found = null;
  let alreadyCancelled = false;

  await updateData((data) => {
    found = [...data.orders, ...data.reservations].find(
      (order) => order.id === id
    ) || null;

    if (!found) return;

    if (found.status === "cancelled") {
      alreadyCancelled = true;
      return;
    }

    found.status = "cancelled";
  });

  if (!found) {
    return bot.sendMessage(msg.chat.id, "Bunday ID topilmadi.");
  }

  if (alreadyCancelled) {
    return bot.sendMessage(
      msg.chat.id,
      `#${id} allaqachon bekor qilingan.`
    );
  }

  await bot.sendMessage(msg.chat.id, `✅ #${id} bekor qilindi.`);
});

// Telegram xatolarini ko‘rsatish (tokenni logga chiqarmaslik uchun faqat xabar)
bot.on("polling_error", (error) => {
  console.error("Telegram polling:", error.message);
});

// Kutilmagan promise xatolari serverni yiqitmasin
process.on("unhandledRejection", (error) => {
  console.error("Kutilmagan xato:", (error && error.message) || error);
});

/* --------------------------- Noma’lum yo‘llar, xatolar -------------------------- */

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Topilmadi." });
});

app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "So‘rov formati noto‘g‘ri." });
  }

  console.error("Server xatosi:", error.message);

  if (res.headersSent) return next(error);

  return res.status(500).json({ error: "Serverda xatolik yuz berdi." });
});

// Serverni ishga tushirish
app.listen(PORT, () => {
  console.log(`Ayvon server http://localhost:${PORT}`);
  console.log(`Statik fayllar: ${publicDir}`);
  console.log(`Ma’lumotlar fayli: ${dataFile}`);
});
