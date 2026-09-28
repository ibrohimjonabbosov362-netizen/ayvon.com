// Deploy'ni yakunlash: domenni tekshirish, Vercel'dagi env var'lar joyidami
// (webhook himoyalanganmi) va Telegram webhook'ni o'rnatish.
//
// Xavfsizlik: agar /api/telegram maxfiy sarlavhasiz so'rovni rad etmasa,
// webhook O'RNATILMAYDI (aks holda begona so'rovlar buyurtma yuborishi mumkin).
//
// Ishlatilishi:
//   node scripts/finish-deploy.js https://ayvon.vercel.app
//   node scripts/finish-deploy.js https://ayvon.vercel.app --no-webhook   (faqat tekshirish)

require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");

const args = process.argv.slice(2);
const SET_WEBHOOK = !args.includes("--no-webhook");
const base = (args.find((a) => a.startsWith("http")) || "").replace(/\/+$/, "");

const { BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET } = process.env;
const WEBHOOK_PATH = "/api/telegram";

if (!base) {
  console.error("Domen kerak. Masalan: node scripts/finish-deploy.js https://ayvon.vercel.app");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(path, options = {}) {
  try {
    const res = await fetch(base + path, {
      ...options,
      signal: AbortSignal.timeout(20000)
    });
    const body = await res.text();
    return { status: res.status, headers: res.headers, body };
  } catch (error) {
    return { status: 0, error: error.code || error.message, body: "" };
  }
}

(async () => {
  console.log(`Tekshirilmoqda: ${base}\n`);

  // 1) Domen ishga tushishini kutamiz (deploy tugashi kerak).
  let home = { status: 0 };
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    home = await request("/");
    if (home.status === 200) break;
    console.log(`  ${attempt}-urinish: HTTP ${home.status}${home.error ? ` (${home.error})` : ""} - 6s kutamiz...`);
    await sleep(6000);
  }

  if (home.status !== 200) {
    console.error(`\nSayt javob bermadi (oxirgi holat: HTTP ${home.status} ${home.error || ""}).`);
    process.exit(1);
  }

  const csp = home.headers.get("content-security-policy") ? "bor" : "YO'Q";
  const hsts = home.headers.get("strict-transport-security") ? "bor" : "YO'Q";
  console.log(`Sayt: HTTP 200 | ${home.body.length} bayt | CSP=${csp} | HSTS=${hsts}`);

  // 2) Statik resurslar
  for (const asset of ["/style.css", "/app.js"]) {
    const res = await request(asset);
    console.log(`  ${asset.padEnd(12)} HTTP ${res.status}`);
  }

  // 3) Yopiq fayllar
  for (const secretPath of ["/.env", "/storage/data.json"]) {
    const res = await request(secretPath);
    console.log(`  ${secretPath.padEnd(20)} HTTP ${res.status} ${res.status === 404 ? "(yopiq - yaxshi)" : "(TEKSHIRING!)"}`);
  }

  // 4) Webhook himoyasi: sarlavhasiz so'rov rad etilishi kerak
  const noSecret = await request(WEBHOOK_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  console.log(`\n/api/telegram (sarlavhasiz): HTTP ${noSecret.status} ${noSecret.body.slice(0, 70)}`);

  const protectedOk = noSecret.status === 403;

  if (noSecret.status === 503) {
    console.error(
      "XATO: Vercel'da TELEGRAM_WEBHOOK_SECRET yo'q. uni qo'shmasangiz webhook ishlamaydi."
    );
  }

  if (protectedOk && TELEGRAM_WEBHOOK_SECRET) {
    const okBody = JSON.stringify({ update_id: 1 });
    const okSecret = await request(WEBHOOK_PATH, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": TELEGRAM_WEBHOOK_SECRET
      },
      body: okBody
    });
    console.log(`/api/telegram (to'g'ri sarlavha): HTTP ${okSecret.status} ${okSecret.body.slice(0, 70)}`);
  }

  if (!SET_WEBHOOK) {
    console.log("\n--no-webhook: webhook o'rnatilmadi.");
    return;
  }

  if (!protectedOk) {
    console.error("\nWebhook O'RNATILMADI: /api/telegram himoyasi tasdiqlanmadi (403 kutilgan edi).");
    process.exit(1);
  }

  // 5) Webhook'ni o'rnatish
  const bot = new TelegramBot(BOT_TOKEN);
  await bot.setWebHook(base + WEBHOOK_PATH, {
    allowed_updates: ["message"],
    secret_token: TELEGRAM_WEBHOOK_SECRET
  });

  const info = await bot.getWebHookInfo();
  console.log(`\nWebhook o'rnatildi: ${info.url}`);
  console.log(`Pending: ${info.pending_update_count}${info.last_error_message ? ` | oxirgi xato: ${info.last_error_message}` : ""}`);
  console.log(
    "\nDiqqat: lokal server (polling) hali ishlayotgan bo'lsa, uni to'xtating - " +
      "aks holda Telegram 409 Conflict qaytaradi."
  );
})().catch((error) => {
  console.error("Xato:", error.message);
  process.exit(1);
});
