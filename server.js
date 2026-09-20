const https = require("https");
const http  = require("http");

// ── CONFIG ───────────────────────────────────────────────────
const PIVISION_URL = process.env.PIVISION_URL || "https://pivision.ntpc.co.in/PIVision/Data/4df8d081-3a34-4468-97ce-e16e7ecc4ce1/DiffForData";
const COOKIE       = process.env.PI_COOKIE;
const RVT          = process.env.PI_RVT;
const POLL_MS      = 10000;
const PORT         = process.env.PORT || 3000;

// ── STATE ────────────────────────────────────────────────────
let latestData = {};
let lastFetch  = null;

// ── PARSE DiffForData response ───────────────────────────────
function parse(json) {
  const result = {};
  if (!Array.isArray(json)) return result;
  for (const symbol of json) {
    if (Array.isArray(symbol.Rows)) {
      for (const row of symbol.Rows) {
        const desc = (row.Description || row.Label || "").trim();
        if (!desc) continue;
        const v = parseFloat(row.Value);
        result[desc] = isFinite(v) ? v : null;
      }
    } else if (symbol.Description || symbol.Label) {
      const desc = (symbol.Description || symbol.Label || "").trim();
      if (!desc) continue;
      const v = parseFloat(symbol.Value);
      result[desc] = isFinite(v) ? v : null;
    }
  }
  return result;
}

// ── FETCH FROM PIVISION ──────────────────────────────────────
function fetchPIVision() {
  const body = JSON.stringify({
    Changes: {},
    StartTime: "-1mo",
    EndTime: "*",
    IncludeMetadata: false,
    TZ: "Asia/Calcutta"
  });

  const url = new URL(PIVISION_URL);
  const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: "POST",
    headers: {
      "Accept":                  "application/json, text/plain, */*",
      "Accept-Language":         "en-US",
      "Content-Type":            "application/json;charset=UTF-8",
      "Content-Length":          Buffer.byteLength(body),
      "Cookie":                  COOKIE,
      "RequestVerificationToken": RVT,
      "X-Requested-With":        "XMLHttpRequest",
      "Origin":                  "https://pivision.ntpc.co.in",
      "User-Agent":              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    }
  };

  const req = https.request(options, (res) => {
    let raw = "";
    res.on("data", d => raw += d);
    res.on("end", () => {
      if (res.statusCode !== 200) {
        console.error(`[poll] HTTP ${res.statusCode} — cookies may have expired`);
        return;
      }
      try {
        const json = JSON.parse(raw);
        const parsed = parse(json);
        const count = Object.keys(parsed).length;
        if (count > 0) {
          latestData = { ...parsed, _ts: Date.now() };
          lastFetch  = new Date().toISOString();
          console.log(`[poll] ${count} tags @ ${lastFetch}`);
        }
      } catch(e) {
        console.error("[poll] Parse error:", e.message);
      }
    });
  });
  req.on("error", e => console.error("[poll] Request error:", e.message));
  req.write(body);
  req.end();
}

// ── HTTP SERVER ──────────────────────────────────────────────
http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  if (req.url.startsWith("/data")) {
    res.writeHead(200);
    res.end(JSON.stringify(latestData));
    return;
  }
  if (req.url.startsWith("/health")) {
    const age = lastFetch ? Math.round((Date.now() - new Date(lastFetch).getTime()) / 1000) : null;
    res.writeHead(200);
    res.end(JSON.stringify({ status: age && age < 30 ? "live" : "starting", lastFetch, tags: Object.keys(latestData).length - 1 }));
    return;
  }
  res.writeHead(404);
  res.end("{}");
}).listen(PORT, () => console.log(`[server] Port ${PORT}`));

// ── POLL ─────────────────────────────────────────────────────
fetchPIVision();
setInterval(fetchPIVision, POLL_MS);

// ── SELF PING (keep Render free tier awake) ──────────────────
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    https.get(process.env.RENDER_EXTERNAL_URL + "/health", ()=>{}).on("error", ()=>{});
  }, 8 * 60 * 1000);
}
