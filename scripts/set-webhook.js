// Telegram webhook'ni o‘rnatish, ko‘rish yoki o‘chirish (deploy'dan keyin bir marta).
//
// Ishlatilishi:
//   node scripts/set-webhook.js https://<domen>   webhook o‘rnatadi
//   node scripts/set-webhook.js --info            hozirgi holat
//   node scripts/set-webhook.js --delete          webhook'ni o‘chiradi (lokal polling uchun)
//
// BOT_TOKEN .env faylidan olinadi va hech qachon ekranga chiqarilmaydi.

require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");

const { BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET } = process.env;
const WEBHOOK_PATH = "/api/telegram";
const argument = process.argv[2];

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN .env faylida topilmadi.");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN);

(async () => {
  if (!argument || argument === "--help") {
    console.log(`Ishlatilishi:
  node scripts/set-webhook.js https://<domen>   webhook'ni o‘rnatadi
  node scripts/set-webhook.js --info            hozirgi holatni ko‘rsatadi
  node scripts/set-webhook.js --delete          webhook'ni o‘chiradi (polling uchun)`);
    return;
  }

  if (argument === "--delete") {
    await bot.deleteWebHook();
    console.log("Webhook o‘chirildi. Endi lokal polling ishlashi mumkin.");
    return;
  }

  if (argument === "--info") {
    const info = await bot.getWebHookInfo();

    // Tokenni ko‘rsatmaslik uchun faqat kerakli maydonlar chop etiladi.
    console.log(
      JSON.stringify(
        {
          url: info.url,
          pending_update_count: info.pending_update_count,
          last_error_date: info.last_error_date,
          last_error_message: info.last_error_message
        },
        null,
        2
      )
    );
    return;
  }

  const base = String(argument).replace(/\/+$/, "");

  if (!base.startsWith("https://")) {
    console.error("Manzil https:// bilan boshlanishi kerak (Telegram HTTP'ni qabul qilmaydi).");
    process.exit(1);
  }

  const options = { allowed_updates: ["message"] };

  if (TELEGRAM_WEBHOOK_SECRET) {
    options.secret_token = TELEGRAM_WEBHOOK_SECRET;
  } else {
    console.warn(
      "OGOHLANTIRISH: TELEGRAM_WEBHOOK_SECRET bo‘sh — webhook maxfiy sarlavha bilan himoyalanmaydi."
    );
  }

  await bot.setWebHook(base + WEBHOOK_PATH, options);
  console.log(`Webhook o‘rnatildi: ${base}${WEBHOOK_PATH}`);
})().catch((error) => {
  console.error("Xato:", (error && error.message) || error);
  process.exit(1);
});
