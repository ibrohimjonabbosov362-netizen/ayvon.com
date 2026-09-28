// Ayvon — buyurtma va band qilishlarni saqlash qatlami.
//
// Ikki rejimda ishlaydi:
//   1) Redis (Upstash REST) — Vercel kabi serverless muhit uchun. Doimiy saqlaydi.
//      Kerakli env: KV_REST_API_URL + KV_REST_API_TOKEN
//      (yoki UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).
//   2) Fayl (storage/data.json) — lokal kompyuter va oddiy VPS uchun (avvalgi xatti-harakat).
//
// Vercel'da Redis sozlanmagan bo'lsa disk faqat o'qish uchun bo'ladi: yozuv
// "saqlanmadi" deb qaytadi, lekin buyurtma baribir Telegramga yuboriladi.

const fs = require("fs");
const path = require("path");

const REDIS_URL = String(
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ""
).replace(/\/+$/, "");
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

// Redis kalitlari (kalitlar maxfiy emas, qiymatlarida PII bo'ladi).
const REDIS_KEYS = { orders: "ayvon:orders", reservations: "ayvon:reservations" };

const rootDir = path.join(__dirname, "..");
const storageDir = path.join(rootDir, "storage");
const dataFile = path.join(storageDir, "data.json");
const legacyDataFile = path.join(rootDir, "data.json");

const backend = REDIS_URL && REDIS_TOKEN ? "redis" : "file";

let warned = false;
function warnOnce(message) {
  if (warned) return;
  warned = true;
  console.error(message);
}

// Qaysi rejim ishlayotganini log uchun qaytaradi.
function mode() {
  return backend;
}

function isKind(kind) {
  return kind === "orders" || kind === "reservations";
}

function parseItem(json) {
  try {
    const item = JSON.parse(json);
    return item && typeof item === "object" ? item : null;
  } catch {
    return null;
  }
}

/* --------------------------------- Redis --------------------------------- */

async function redisCommand(command) {
  const response = await fetch(REDIS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || (payload && payload.error)) {
    throw new Error(`Redis: ${(payload && payload.error) || response.status}`);
  }

  return payload ? payload.result : null;
}

async function redisList(kind) {
  const rows = await redisCommand(["LRANGE", REDIS_KEYS[kind], "0", "-1"]);
  return Array.isArray(rows) ? rows.map(parseItem).filter(Boolean) : [];
}

/* ---------------------------------- Fayl ---------------------------------- */

let fileOk = null;

function fileAvailable() {
  if (fileOk !== null) return fileOk;

  try {
    fs.mkdirSync(storageDir, { recursive: true });

    if (!fs.existsSync(dataFile) && fs.existsSync(legacyDataFile)) {
      fs.renameSync(legacyDataFile, dataFile);
      console.log("data.json storage/ papkasiga ko‘chirildi.");
    }

    fileOk = true;
  } catch (error) {
    fileOk = false;
    warnOnce(
      `Faylga yozib bo‘lmaydi (${error.message}). Buyurtmalar saqlanmaydi — ` +
        "doimiy saqlash uchun KV_REST_API_URL va KV_REST_API_TOKEN sozlang."
    );
  }

  return fileOk;
}

function readFileData() {
  if (!fileAvailable()) return { orders: [], reservations: [] };

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

// Avval vaqtinchalik faylga yozib, keyin nomini almashtiramiz — chala fayl qolmaydi.
function writeFileData(data) {
  const tmpFile = path.join(storageDir, `.data-${process.pid}-${Date.now()}.tmp`);
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, dataFile);
}

// Bir vaqtda kelgan so‘rovlar bir-birining yozuvini o‘chirmasligi uchun navbat.
let writeQueue = Promise.resolve();

function updateFileData(mutate) {
  writeQueue = writeQueue.then(() => {
    const data = readFileData();
    mutate(data);
    writeFileData(data);
  });

  return writeQueue.catch((error) => {
    warnOnce(`Ma’lumotni saqlashda xato: ${error.message}`);
  });
}

/* ------------------------------ Tashqi interfeys ------------------------------ */

// Yangi yozuv qo‘shadi. Saqlangan bo‘lsa true, saqlanmagan bo‘lsa false qaytaradi.
async function addRecord(kind, item) {
  if (!isKind(kind)) throw new Error("Noto‘g‘ri bo‘lim.");

  if (backend === "redis") {
    await redisCommand(["RPUSH", REDIS_KEYS[kind], JSON.stringify(item)]);
    return true;
  }

  if (!fileAvailable()) return false;

  await updateFileData((data) => data[kind].push(item));
  return true;
}

// Barcha yozuvlar (eng eskisidan boshlab).
async function listRecords(kind) {
  if (!isKind(kind)) throw new Error("Noto‘g‘ri bo‘lim.");

  if (backend === "redis") return redisList(kind);

  const data = readFileData();
  return data[kind];
}

// ID bo‘yicha yozuvni topadi: { kind, item } yoki null.
async function findRecord(id) {
  const kinds = ["orders", "reservations"];

  for (const kind of kinds) {
    const items = await listRecords(kind);
    const item = items.find((row) => row.id === id);
    if (item) return { kind, item };
  }

  return null;
}

// Buyurtmani bekor qiladi: "ok" | "already" | "not_found".
async function markCancelled(id) {
  const kinds = ["orders", "reservations"];

  for (const kind of kinds) {
    if (backend === "redis") {
      const rows = await redisCommand(["LRANGE", REDIS_KEYS[kind], "0", "-1"]);
      if (!Array.isArray(rows)) continue;

      for (let index = 0; index < rows.length; index++) {
        const item = parseItem(rows[index]);
        if (!item || item.id !== id) continue;

        if (item.status === "cancelled") return "already";

        item.status = "cancelled";
        await redisCommand(["LSET", REDIS_KEYS[kind], String(index), JSON.stringify(item)]);
        return "ok";
      }

      continue;
    }

    let result = "not_found";

    await updateFileData((data) => {
      const items = data[kind];
      const index = items.findIndex((row) => row.id === id);
      if (index === -1) return;

      if (items[index].status === "cancelled") {
        result = "already";
        return;
      }

      items[index].status = "cancelled";
      result = "ok";
    });

    if (result !== "not_found") return result;
  }

  return "not_found";
}

/* -------------------------------- Rate limit -------------------------------- */

// Redis bo‘lsa hisoblagich serverlar orasida umumiy bo‘ladi; aks holda xotirada.
const memoryHits = new Map();

function memoryRate(key, max, windowMs) {
  const now = Date.now();
  const hits = (memoryHits.get(key) || []).filter((time) => now - time < windowMs);

  if (hits.length >= max) {
    return { allowed: false, retryAfter: Math.ceil((windowMs - (now - hits[0])) / 1000) };
  }

  hits.push(now);
  memoryHits.set(key, hits);
  return { allowed: true, retryAfter: 0 };
}

setInterval(() => {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;

  for (const [key, hits] of memoryHits) {
    if (!hits.some((time) => now - time < windowMs)) memoryHits.delete(key);
  }
}, 5 * 60 * 1000).unref();

async function hitRate(key, max, windowMs) {
  if (backend !== "redis") return memoryRate(key, max, windowMs);

  const redisKey = `ayvon:rate:${key}`;
  const seconds = String(Math.ceil(windowMs / 1000));
  const count = Number(await redisCommand(["INCR", redisKey]));

  if (count === 1) await redisCommand(["EXPIRE", redisKey, seconds]);

  if (count > max) {
    const ttl = Number(await redisCommand(["TTL", redisKey]));
    return { allowed: false, retryAfter: ttl > 0 ? ttl : Number(seconds) };
  }

  return { allowed: true, retryAfter: 0 };
}

module.exports = {
  mode,
  addRecord,
  listRecords,
  findRecord,
  markCancelled,
  hitRate,
  // Testlar va biznes-logika uchun foydali
  readData: async () => ({
    orders: await listRecords("orders"),
    reservations: await listRecords("reservations")
  })
};
