// Vercel loyihasini tuzatish (token bilan ishlaydi).
//
// Muammo: loyiha nomi nuqtali bo'lsa (masalan "ayvon.com"), Vercel avtomatik
// domenni "ayvon.com.vercel.app" qilib beradi. Bu 3 bo'g'inli nom umumiy
// "*.vercel.app" sertifikatiga tushmaydi — natijada TLS uziladi va sayt
// ochilmaydi (DEPLOYMENT_NOT_FOUND). Tuzatish: nomni nuqtasiz qilish.
//
// Ishlatilishi (PowerShell):
//   $env:VERCEL_TOKEN="<token>"
//   node scripts/vercel-fix.js                      # faqat tekshiradi (hech narsa o'zgarmaydi)
//   node scripts/vercel-fix.js --apply              # nomni va env var'larni tuzatadi
//   node scripts/vercel-fix.js --apply --name=ayvon # nomni o'zingiz tanlaysiz
//   node scripts/vercel-fix.js --team=<team-slug>   # jamoa (team) loyihasi uchun
//
// Token: vercel.com/account/tokens -> Create Token (scope: full account).
// Ish tugagach tokenni o'chirib tashlang.

require("dotenv").config();

const API = "https://api.vercel.com";
const TOKEN = process.env.VERCEL_TOKEN;

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const argValue = (name) => {
  const found = argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
};
const TEAM = argValue("team");
const WANTED_NAME = argValue("name");
// Zaxira nomlar: birinchisi band bo'lsa, keyingisi sinaladi.
const NAME_CANDIDATES = WANTED_NAME
  ? [WANTED_NAME]
  : ["ayvon", "ayvon-cafe", "ayvon-uzbekistan"];

// .env dagi qiymatlar Vercel'ga yoziladi (agar yo'q bo'lsa).
const ENV_KEYS = ["BOT_TOKEN", "ADMIN_CHAT_ID", "TELEGRAM_WEBHOOK_SECRET"];

if (!TOKEN) {
  console.error(
    "VERCEL_TOKEN topilmadi.\n" +
      "1) vercel.com/account/tokens -> Create Token\n" +
      "2) PowerShell:  $env:VERCEL_TOKEN=\"olingan-token\"\n" +
      "3) keyin:       node scripts/vercel-fix.js"
  );
  process.exit(1);
}

async function api(path, { method = "GET", body, teamId = TEAM } = {}) {
  const url = new URL(API + path);
  if (teamId) url.searchParams.set("teamId", teamId);

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000)
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const message = (data && (data.error?.message || data.message)) || res.statusText;
    const error = new Error(`HTTP ${res.status}: ${message}`);
    error.status = res.status;
    throw error;
  }

  return data;
}

(async () => {
  try {
    const me = await api("/v2/user");
    console.log(`Hisob: ${me.user.username || me.user.email || me.user.id}`);
  } catch (error) {
    console.log(`Hisobni aniqlab bo'lmadi (${error.message}) - davom etamiz.`);
  }
  console.log(`Rejim: ${APPLY ? "TUZATISH (--apply)" : "faqat tekshiruv"}\n`);

  let projects = [];
  try {
    const home = await api("/v9/projects?limit=100");
    projects = home.projects || [];
  } catch (error) {
    console.log(`Shaxsiy loyihalarni olishda xato: ${error.message}`);
  }

  // Jamoaga tegishli bo'lsa, o'sha yerda qidiramiz.
  if (!projects.length) {
    const teams = await api("/v2/teams?limit=100");
    for (const team of teams.teams || []) {
      try {
        const list = await api("/v9/projects?limit=100", { teamId: team.id });
        for (const project of list.projects || []) {
          projects.push(Object.assign(project, { __teamId: team.id, __teamName: team.slug }));
        }
      } catch {
        /* ba'zi jamoalarga ruxsat bo'lmasligi mumkin */
      }
    }
  }

  const project = projects.find((p) => /ayvon/i.test(p.name)) || projects[0];

  if (!project) {
    console.error("Loyiha topilmadi. --team=<slug> bilan qayta urinib ko'ring.");
    process.exit(1);
  }

  const teamId = project.__teamId || undefined;
  console.log(
    `Loyiha: "${project.name}" (id=${project.id}${project.__teamName ? `, team=${project.__teamName}` : ""})`
  );

  const domains = await api(`/v9/projects/${project.id}/domains?limit=50`, { teamId });
  console.log(`Domenlar: ${(domains.domains || []).map((d) => d.name).join(", ") || "(yo'q)"}`);

  const envs = await api(`/v9/projects/${project.id}/env?limit=100`, { teamId });
  const existingKeys = (envs.envs || []).map((e) => e.key);
  const missing = ENV_KEYS.filter((key) => !existingKeys.includes(key));
  console.log(`Env var'lar mavjud: ${existingKeys.join(", ") || "(yo'q)"}`);
  console.log(`Yetishmayotgan: ${missing.join(", ") || "yo'q"}`);

  const nameHasDot = project.name.includes(".");
  console.log(`\nNom nuqtali? ${nameHasDot ? "HA - sayt TLS sababli ochilmaydi" : "YO'Q (yaxshi)"}`);
  console.log(`Umumiy holat: ${nameHasDot || missing.length ? "TUZATISH KERAK" : "muammo topilmadi"}\n`);

  if (!APPLY) {
    console.log("Tuzatish uchun:  node scripts/vercel-fix.js --apply");
    return;
  }

  // 1) Yetishmayotgan env var'larni qo'shish (qiymatlar lokal .env'dan olinadi).
  for (const key of missing) {
    const value = process.env[key];
    if (!value) {
      console.log(`! ${key} lokal .env'da ham yo'q - o'tkazib yuborildi.`);
      continue;
    }

    await api(`/v10/projects/${project.id}/env?upsert=true`, {
      method: "POST",
      teamId,
      body: {
        key,
        value,
        type: "encrypted",
        target: ["production", "preview", "development"]
      }
    });
    console.log(`+ ${key} Vercel'ga qo'shildi.`);
  }

  // 2) Nomni nuqtasiz qilish: yangi avtomatik domen sertifikatga tushadi.
  let finalName = project.name;

  if (nameHasDot) {
    for (const candidate of NAME_CANDIDATES) {
      try {
        await api(`/v9/projects/${project.id}`, {
          method: "PATCH",
          teamId,
          body: { name: candidate }
        });
        finalName = candidate;
        console.log(`+ Loyiha nomi o'zgartirildi: "${project.name}" -> "${candidate}"`);
        break;
      } catch (error) {
        console.log(`! "${candidate}" bo'lmadi (${error.message}), keyingi nom sinaladi...`);
      }
    }
  }

  console.log(
    "\nKeyingi qadam: yangi deployment kerak (env var'lar shundagina kuchga kiradi):\n" +
      "  git commit --allow-empty -m \"chore: redeploy\" ; git push\n" +
      `So'ng domen tekshiriladi: https://${finalName}.vercel.app`
  );
})().catch((error) => {
  console.error("Xato:", error.message);
  process.exit(1);
});
