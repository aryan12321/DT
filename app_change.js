/* ================================================================
   ONLY CHANGE NEEDED IN app.js  (3 things)
   ================================================================ */

// 1. REPLACE this line at the top:
const SHEETS_CSV = "https://docs.google.com/spreadsheets/d/e/...";
// WITH:
const DATA_URL = "https://pivision-bridge.onrender.com/data";
//               ^^^^ your Render URL — set once, never changes


// 2. REPLACE the entire fetchData() function:
async function fetchData() {
  try {
    const r = await fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    data = await r.json();                          // already { "SENSOR NAME": value }
    if (!frozen) { updateAllPanels(); colorMeshes(); }
    document.getElementById("hR").textContent = Math.round(REFRESH_MS / 1000) + "s";
    updateFreezeBar();
    if (!frozen) {
      setStatus("LIVE • " + new Date().toLocaleTimeString(), true);
      setTimeout(() => setStatus("", false), 1800);
    }
  } catch (err) {
    console.error(err);
    setStatus("Bridge error: " + err.message, true);
  }
}


// 3. DELETE these functions — no longer needed:
//    parseCSV()
//    cleanKey()
//    sensorKey()
//    parseValue()
