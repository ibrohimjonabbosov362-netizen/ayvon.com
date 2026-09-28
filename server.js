
require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");

const { BOT_TOKEN, ADMIN_CHAT_ID, PORT = 3000 } = process.env;

if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
  console.error("BOT_TOKEN va ADMIN_CHAT_ID .env faylida ko‘rsatilishi kerak.");
  process.exit(1);
}

const app = express();
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const dataFile = path.join(__dirname, "data.json");

app.use(express.json({ limit: "100kb" }));
app.use(express.static(__dirname));

function readData() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch {
    return { orders: [], reservations: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function makeId() {
  return "AY" + Date.now().toString().slice(-8);
}

function clean(value) {
  return String(value ?? "").trim().slice(0, 1000);
}

function validPhone(value) {
  return /^[+0-9()\s-]{7,20}$/.test(String(value ?? "").trim());
}

// Yangi buyurtma
app.post("/api/order", async (req, res) => {
  const { dish, quantity, name, phone, message } = req.body || {};

  if (
    !dish ||
    !name ||
    !validPhone(phone) ||
    !Number.isInteger(Number(quantity)) ||
    Number(quantity) < 1 ||
    Number(quantity) > 50
  ) {
    return res.status(400).json({
      error: "Ma’lumotlarni to‘g‘ri kiriting."
    });
  }

  const id = makeId();

  const item = {
    id,
    type: "order",
    dish: clean(dish),
    quantity: Number(quantity),
    name: clean(name),
    phone: clean(phone),
    message: clean(message),
    status: "pending",
    createdAt: new Date().toISOString()
  };

  const data = readData();
  data.orders.push(item);
  writeData(data);

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
    console.error("Buyurtmani Telegramga yuborishda xato:", error);
    res.status(502).json({
      error: "Telegramga yuborilmadi. Bot sozlamalarini tekshiring."
    });
  }
});

// Stol band qilish
app.post("/api/reserve", async (req, res) => {
  const { name, phone, date, time, guests, message } = req.body || {};

  if (
    !name ||
    !validPhone(phone) ||
    !date ||
    !time ||
    !Number.isInteger(Number(guests)) ||
    Number(guests) < 1 ||
    Number(guests) > 100
  ) {
    return res.status(400).json({
      error: "Barcha majburiy maydonlarni to‘g‘ri to‘ldiring."
    });
  }

  const id = makeId();

  const item = {
    id,
    type: "reservation",
    name: clean(name),
    phone: clean(phone),
    date: clean(date),
    time: clean(time),
    guests: Number(guests),
    message: clean(message),
    status: "pending",
    createdAt: new Date().toISOString()
  };

  const data = readData();
  data.reservations.push(item);
  writeData(data);

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
    console.error("Band qilish xabarini yuborishda xato:", error);
    res.status(502).json({
      error: "Telegramga yuborilmadi. Bot sozlamalarini tekshiring."
    });
  }
});

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

  const data = readData();

  const item = [...data.orders, ...data.reservations].find(
    (order) => order.id === id
  );

  if (!item) {
    return bot.sendMessage(msg.chat.id, "Bunday ID topilmadi.");
  }

  if (item.status === "cancelled") {
    return bot.sendMessage(
      msg.chat.id,
      `#${id} allaqachon bekor qilingan.`
    );
  }

  item.status = "cancelled";
  writeData(data);

  await bot.sendMessage(msg.chat.id, `✅ #${id} bekor qilindi.`);
});

// Telegram xatolarini ko‘rsatish
bot.on("polling_error", (error) => {
  console.error("Telegram polling:", error.message);
});

// Serverni ishga tushirish
app.listen(PORT, () => {
  console.log(`Ayvon server http://localhost:${PORT}`);
});