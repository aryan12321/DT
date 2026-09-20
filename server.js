/**
 * PIVision Bridge — Render.com deployment
 * Puppeteer opens real Chrome, logs in, intercepts DiffForData,
 * serves latest sensor values at GET /data
 */

const express    = require("express");
const puppeteer  = require("puppeteer");

const CONFIG = {
  url:      "https://pivision.ntpc.co.in/PIVision/#/Displays/47135/TANDA-TG-TSI-U-6",
  username: process.env.PI_USER || "tanda.abt1",
  password: process.env.PI_PASS || "ntpc@123",
  pollMs:   10000,
  port:     process.env.PORT || 3000,
};

// Sensor name → latest value
let latestData = {};
let lastFetch  = null;
let browser, page;

// ── SENSOR NAME MAP ─────────────────────────────────────────────────────────
// DiffForData returns values positionally (one per tag in display order).
// This list maps position → sensor name used in your app.js BEARINGS/MP.
// ORDER MUST MATCH the display's tag order in PIVision.
const SENSOR_NAMES = [
  "BRG 1 VIB-X SHAFT REL",
  "BRG 1 VIB-Y SHAFT REL",
  "BRG-2 VIB-X SHAFT REL",
  "BRG-2 VIB-Y SHAFT REL",
  "BRG-3 VIB-X SHAFT REL",
  "BRG-3 VIB-Y SHAFT REL",
  "BRG-4 VIB -X SHAFT REL",
  "BRG-4 VIB -Y SHAFT REL",
  "BRG-5 VIB-X SHAFT REL GEN DE",
  "BRG-5 VIB-Y SHAFT REL GEN DE",
  "BRG-5 VIB-X SHAFT REL GEN NDE",
  "BRG-5 VIB-Y SHAFT REL GEN NDE",
  "T METAL RADIAL BRG-1",
  "T METAL THRUST BRG-2",
  "T METAL RADIAL BRG-3",
  "T METAL RADIAL BRG-4",
  "T MTL RADIAL BRG LPT-1",
  "T MTL RADIAL BRG GEN DE",
  "T MTL RADIAL BRG GEN NDE",
  "T METAL RADIAL BRG-6",
  "T THRUST BRG FRONT",
  "T THRUST BRG REAR",
  "T MTL RDL BRG EXC ACT VAL",
  "THRUST POS-1",
  "THRUST POS-2",
  "THRUST POS-3",
  "THRUST POS 2O3 BRG 2",
  "DIFF EXP HP TURB",
  "DIFF EXP IP TURB",
  "DIFF EXP LP TURB1",
  "DIFF EXP LP TURB2",
  "ECCNTR HPT SHAFT",
  "ABS EXPANSION IPT",
  "LOAD",
];

// ── PARSE DiffForData RESPONSE ───────────────────────────────────────────────
function parseResponse(json) {
  const next = {};
  if (!Array.isArray(json)) return next;

  json.forEach((item, i) => {
    // Get latest value from Rows array
    let val = null;
    const rows = item.Rows || [];
    if (rows.length > 0) {
      const latest = rows[rows.length - 1];
      // "Bad" or non-numeric values become null
      const v = parseFloat(latest.Value);
      val = isFinite(v) ? v : null;
    }

    // Use name from response if present, else positional map
    const name = item.Name || item.TagName || item.Description || SENSOR_NAMES[i] || `TAG_${i}`;
    next[name] = val;
  });

  return next;
}

// ── LAUNCH BROWSER ───────────────────────────────────────────────────────────
async function launchBrowser() {
  console.log("[browser] Launching Puppeteer...");
 browser = await puppeteer.launch({
  headless: "new",
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--no-zygote",
  ],
});
  page = await browser.newPage();

  // Intercept DiffForData responses
  await page.setRequestInterception(true);
  page.on("request", req => req.continue());

  page.on("response", async (res) => {
    const url = res.url();
    if (!url.includes("DiffForData")) return;
    try {
      const json = await res.json();
      const parsed = parseResponse(json);
      if (Object.keys(parsed).length > 0) {
        latestData = { ...parsed, _ts: Date.now() };
        lastFetch  = new Date().toISOString();
        console.log(`[data] ${Object.keys(parsed).length} tags @ ${lastFetch}`);
      }
    } catch(_) {}
  });

  console.log("[browser] Ready.");
}

// ── LOGIN + LOAD DISPLAY ─────────────────────────────────────────────────────
async function loadDisplay() {
  console.log("[login] Navigating to PIVision...");

  await page.goto(CONFIG.url, { waitUntil: "networkidle2", timeout: 60000 });

  // Check if login form is present
  const loginForm = await page.$("input[name='UserName'], input[type='password'], #loginForm");

  if (loginForm) {
    console.log("[login] Login form detected, entering credentials...");

    // Fill username
    await page.evaluate(() => {
      const u = document.querySelector("input[name='UserName'], input[name='username'], #UserName");
      if (u) u.value = "";
    });
    await page.type("input[name='UserName'], input[name='username'], #UserName", CONFIG.username, { delay: 50 });

    // Fill password
    await page.type("input[type='password']", CONFIG.password, { delay: 50 });

    // Submit
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }),
      page.click("input[type='submit'], button[type='submit']"),
    ]);

    console.log("[login] Submitted. Waiting for display...");
  } else {
    console.log("[login] No login form — already authenticated or SSO.");
  }

  // Wait for display data to start loading
  await page.waitForResponse(
    res => res.url().includes("DiffForData") && res.status() === 200,
    { timeout: 60000 }
  ).catch(() => console.log("[login] Timeout waiting for DiffForData — display may still be loading."));

  console.log("[login] Display loaded. Data flowing.");
}

// ── SESSION WATCHDOG ─────────────────────────────────────────────────────────
// If no data received for 2 minutes, restart the browser session
async function watchdog() {
  if (!lastFetch) return;
  const age = Date.now() - new Date(lastFetch).getTime();
  if (age > 120000) {
    console.log("[watchdog] No data for 2min — restarting session...");
    try { await page.reload({ waitUntil: "networkidle2", timeout: 30000 }); }
    catch(_) {
      try { await browser.close(); } catch(_) {}
      await launchBrowser();
      await loadDisplay();
    }
  }
}

// ── SELF-PING (keeps Render free tier awake) ─────────────────────────────────
function selfPing() {
  const host = process.env.RENDER_EXTERNAL_URL || `http://localhost:${CONFIG.port}`;
  setInterval(() => {
    fetch(`${host}/health`).catch(() => {});
  }, 8 * 60 * 1000); // every 8 minutes
}

// ── EXPRESS SERVER ───────────────────────────────────────────────────────────
const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  next();
});

app.options("*", (req, res) => res.sendStatus(204));

// Main data endpoint — this is what app.js fetches
app.get("/data", (req, res) => {
  res.json(latestData);
});

// Health / status check
app.get("/health", (req, res) => {
  const age = lastFetch ? Math.round((Date.now() - new Date(lastFetch).getTime()) / 1000) : null;
  res.json({
    status:    lastFetch ? (age < 30 ? "live" : "stale") : "starting",
    lastFetch,
    dataAgeSeconds: age,
    tags:      Object.keys(latestData).filter(k => k !== "_ts").length,
  });
});

app.listen(CONFIG.port, () => console.log(`[server] Port ${CONFIG.port}`));

// ── BOOT ─────────────────────────────────────────────────────────────────────
(async () => {
  await launchBrowser();
  await loadDisplay();
  setInterval(watchdog, 30000);  // check every 30s
  selfPing();
})();
