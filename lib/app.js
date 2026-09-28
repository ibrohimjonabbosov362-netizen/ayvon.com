// Ayvon — Express ilovasi (marshrutlar va xavfsizlik qatlami).
//
// Bu fayl ilovani yaratadi, lekin uni tinglamaydi (listen yo‘q) va Telegram'ni
// poll qilmaydi. Shu tufayli bir xil kod ham lokal serverda, ham Vercel
// Functions (serverless) ichida ishlaydi.
//
// Ishlatilishi:
//   const app = createApp({ bot, storage, adminChatId, menu, trustProxy, enableHsts });

const express = require("express");
const path = require("path");

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 8;

function createApp({
  bot,
  storage,
  adminChatId,
  menu,
  trustProxy = false,
  enableHsts = false,
  allowedOrigins = []
}) {
  const app = express();

  const publicDir = path.join(__dirname, "..", "public");

  if (trustProxy) app.set("trust proxy", 1);
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

    if (enableHsts) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    next();
  });

  /* ------------------------------ Telegram webhook ------------------------------ */
  // Serverless rejimida update'lar shu yo‘lga keladi. Telegram so‘rovga maxfiy
  // sarlavha qo‘shadi, shuning uchun begona so‘rovlar rad etiladi.
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";

  app.post("/api/telegram", express.json({ limit: "256kb" }), async (req, res) => {
    if (!webhookSecret) {
      console.error("TELEGRAM_WEBHOOK_SECRET ko‘rsatilmagan — webhook o‘chirilgan.");
      return res.status(503).json({ error: "Webhook sozlanmagan." });
    }

    const received = req.get("x-telegram-bot-api-secret-token") || "";

    if (received !== webhookSecret) {
      return res.status(403).json({ error: "Ruxsat yo‘q." });
    }

    try {
      await bot.processUpdate(req.body);
    } catch (error) {
      console.error("Webhook update xatosi:", error.message);
    }

    // Telegram'ga har doim tez 200 qaytaramiz, aks holda u qayta yuboraveradi.
    return res.json({ ok: true });
  });

  app.use(express.json({ limit: "20kb" }));

  // Statik sayt — faqat public/ papkasi, dotfile'lar butunlay bloklangan.
  // Vercel'da statik fayllar CDN'dan beriladi; bu qatlam lokal server uchun.
  app.use(
    express.static(publicDir, {
      dotfiles: "deny",
      index: "index.html",
      maxAge: "1h",
      fallthrough: true
    })
  );

  /* --------------------------- yordamchi funksiyalar --------------------------- */

  // Rate limit: Redis bo‘lsa umumiy hisoblagich, aks holda xotirada.
  async function rateLimit(req, res, next) {
    const key = req.ip || req.socket.remoteAddress || "unknown";

    try {
      const { allowed, retryAfter } = await storage.hitRate(key, RATE_MAX, RATE_WINDOW_MS);

      if (!allowed) {
        res.setHeader("Retry-After", String(retryAfter));
        return res.status(429).json({
          error: "Juda ko‘p so‘rov yuborildi. Iltimos, keyinroq urinib ko‘ring."
        });
      }
    } catch (error) {
      // Hisoblagich ishlamasa ham buyurtmalar yo‘qolmasin (fail-open).
      console.error("Rate limit tekshiruvida xato:", error.message);
    }

    return next();
  }

  // Begona saytlar orqali forma spam qilinishining oldini olish
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

  // Yozuvni saqlash: ombor ishlamasa ham buyurtma Telegramga borishi kerak.
  async function saveRecord(kind, item) {
    try {
      const saved = await storage.addRecord(kind, item);

      if (!saved) {
        console.warn(`#${item.id} saqlanmadi (doimiy ombor sozlanmagan).`);
      }
    } catch (error) {
      console.error("Yozuvni saqlashda xato:", error.message);
    }
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
      !menu.includes(dish) ||
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

    await saveRecord("orders", item);

    try {
      await bot.sendMessage(
        adminChatId,
        `🛎 YANGI BUYURTMA

🆔 ${id}
🍽 ${item.dish}
🔢 Soni: ${item.quantity}
👤 ${item.name}
📞 ${item.phone}
📝 ${item.message || "Izoh yo‘q"}

Bekor qilish: /cancel ${id}`
      );

      return res.json({ ok: true, id });
    } catch (error) {
      console.error("Buyurtmani Telegramga yuborishda xato:", error.message);
      return res.status(502).json({
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
        error: "Ma’lumotlarni to‘g‘ri kiriting."
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

    await saveRecord("reservations", item);

    try {
      await bot.sendMessage(
        adminChatId,
        `📅 YANGI JOY BAND QILISH

🆔 ${id}
👤 ${item.name}
📞 ${item.phone}
📆 ${item.date} ${item.time}
👥 Mehmonlar: ${item.guests}
📝 ${item.message || "Izoh yo‘q"}

Bekor qilish: /cancel ${id}`
      );

      return res.json({ ok: true, id });
    } catch (error) {
      console.error("Band qilish xabarini yuborishda xato:", error.message);
      return res.status(502).json({
        error: "Telegramga yuborilmadi. Bot sozlamalarini tekshiring."
      });
    }
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

  return app;
}

module.exports = { createApp, RATE_MAX, RATE_WINDOW_MS };
