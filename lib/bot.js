// Ayvon — Telegram bot. Bir marta yaratiladi va ikkala rejimda ishlatiladi:
//   - lokal/VPS: server.js da bot.startPolling() chaqiriladi (polling);
//   - Vercel: update'lar /api/telegram webhook'i orqali keladi (bot.processUpdate()).
const TelegramBot = require("node-telegram-bot-api");

function createBot({ token, adminChatId, storage }) {
  if (!token || !adminChatId) {
    throw new Error("BOT_TOKEN va ADMIN_CHAT_ID ko‘rsatilishi kerak.");
  }

  // polling: false — kerak bo‘lganda startPolling() bilan yoqiladi.
  const bot = new TelegramBot(token);

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
  bot.onText(/^\/id$/, (msg) => {
    bot.sendMessage(msg.chat.id, `Sizning Telegram ID: ${msg.chat.id}`);
  });

  // /cancel buyrug‘i — faqat admin uchun
  bot.onText(/^\/cancel(?:\s+([A-Za-z0-9]+))?$/, async (msg, match) => {
    if (String(msg.chat.id) !== String(adminChatId)) {
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

    let result = "not_found";

    try {
      result = await storage.markCancelled(id);
    } catch (error) {
      console.error("Bekor qilishda xato:", error.message);
      return bot.sendMessage(
        msg.chat.id,
        "Ma’lumotlar omboriga ulanib bo‘lmadi. Keyinroq urinib ko‘ring."
      );
    }

    if (result === "not_found") {
      return bot.sendMessage(msg.chat.id, "Bunday ID topilmadi.");
    }

    if (result === "already") {
      return bot.sendMessage(msg.chat.id, `#${id} allaqachon bekor qilingan.`);
    }

    return bot.sendMessage(msg.chat.id, `✅ #${id} bekor qilindi.`);
  });

  // Telegram xatolarini ko‘rsatish (tokenni logga chiqarmaslik uchun faqat xabar)
  bot.on("error", (error) => {
    console.error("Telegram xatosi:", (error && error.message) || error);
  });

  return bot;
}

module.exports = { createBot };
