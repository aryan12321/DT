
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/GLTFLoader.js";

/* ============================================================
   TURBINE DIGITAL TWIN
   GitHub Pages version
   Model: ./turbine.glb
   Data : Google Sheets published CSV
   ============================================================ */

const MODEL_URL = "./turbine.glb";

const SHEETS_CSV =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTGvHDpe6m7ycqjlbRf7FcWxogdy8gD0Km0dgfRLu_l_iSgOs5l0Emu8tGIICr5N8amuJsTLN4xPgm1/pub?gid=2032255384&single=true&output=csv";

const REFRESH_MS = 10000;

const VW = 75, VA = 100;
const TW = 80, TA = 90;

const BEARINGS = [
  {
    id: "BRG1",
    label: "BRG-1",
    sec: "HPT",
    dp: [-3.0, 0.9, 0],
    mk: ["BRG1", "BEARING1"],
    vX: "BRG 1 VIB-X SHAFT REL",
    vY: "BRG 1 VIB-Y SHAFT REL",
    t: "T METAL RADIAL BRG-1"
  },

  {
    id: "BRG2",
    label: "BRG-2",
    sec: "HPT/IPT",
    dp: [-1.8, 0.9, 0],
    mk: ["BRG2", "BEARING2"],
    vX: "BRG-2 VIB-X SHAFT REL",
    vY: "BRG-2 VIB-Y SHAFT REL",
    t: null
  },

  {
    id: "BRG3",
    label: "BRG-3",
    sec: "IPT",
    dp: [-0.5, 0.9, 0],
    mk: ["BRG3", "BEARING3"],
    vX: "BRG-3 VIB-X SHAFT REL",
    vY: "BRG-3 VIB-Y SHAFT REL",
    t: "T METAL RADIAL BRG-3"
  },

  {
    id: "BRG4",
    label: "BRG-4",
    sec: "LPT",
    dp: [0.8, 0.9, 0],
    mk: ["BRG4", "BEARING4"],
    vX: "BRG-4 VIB -X SHAFT REL",
    vY: "BRG-4 VIB -Y SHAFT REL",
    t: null
  },

  {
    id: "BRG5",
    label: "BRG-5 GEN",
    sec: "GEN",
    dp: [2.2, 0.9, 0],
    mk: ["BRG5", "BEARING5", "GEN"],
    vX: "BRG-5 VIB-X SHAFT REL GEN DE",
    vY: "BRG-5 VIB-Y SHAFT REL GEN DE",
    t: "T METAL RADIAL BRG-5"
  },

  {
    id: "THR",
    label: "THRUST BRG",
    sec: "HPT",
    dp: [-2.4, 1.5, 0],
    mk: ["THRUST"],
    vX: "T THRUST BRG FRONT",
    vY: "T THRUST BRG REAR",
    t: "T MTL RDL BRG EXC ACT VAL"
  }
];


/* ============================================================
   STATE
   ============================================================ */

let data = {};
let model = null;

let labelsOn = true;
let wire = false;

// FREEZE: when true, tags display frozenData snapshot instead of live data
let frozen = false;
let frozenData = {};

const wpos = {};
const tels = {};


/* ============================================================
   DOM
   ============================================================ */

const canvas = document.getElementById("c");
const hint = document.getElementById("hint");
const statusEl = document.getElementById("status");


function status(message, visible = true) {

  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.style.display = visible ? "block" : "none";
}


/* ============================================================
   THREE.JS SETUP
   ============================================================ */

const scene = new THREE.Scene();

scene.background = new THREE.Color(0x0a0d12);

scene.fog = new THREE.FogExp2(
  0x0a0d12,
  0.03
);


const camera = new THREE.PerspectiveCamera(
  45,
  innerWidth / innerHeight,
  0.01,
  500
);


const renderer = new THREE.WebGLRenderer({

  canvas,

  antialias: true,

  alpha: true,

  powerPreference: "high-performance"

});


renderer.setSize(
  innerWidth,
  innerHeight
);


renderer.setPixelRatio(
  Math.min(devicePixelRatio, 2)
);


renderer.outputColorSpace =
  THREE.SRGBColorSpace;


renderer.toneMapping =
  THREE.ACESFilmicToneMapping;


renderer.toneMappingExposure = 1.1;


renderer.shadowMap.enabled = true;


renderer.shadowMap.type =
  THREE.PCFSoftShadowMap;


renderer.xr.enabled = true;


/* ============================================================
   LIGHTING
   ============================================================ */

scene.add(
  new THREE.HemisphereLight(
    0xcfe7ff,
    0x111722,
    2.2
  )
);


const sun =
  new THREE.DirectionalLight(
    0xffffff,
    2.5
  );

sun.position.set(
  6,
  10,
  6
);

sun.castShadow = true;

scene.add(sun);


const fill =
  new THREE.DirectionalLight(
    0x4488ff,
    0.7
  );

fill.position.set(
  -6,
  3,
  -6
);

scene.add(fill);


/* ============================================================
   GRID
   ============================================================ */

const grid = new THREE.GridHelper(
  30,
  60,
  0x1e2d45,
  0x111622
);

grid.position.y = 0;

scene.add(grid);


/* ============================================================
   CAMERA CONTROLS
   ============================================================ */

let theta = 0;

let phi =
  Math.PI / 5;

let radius = 9;


const target =
  new THREE.Vector3(
    0,
    1.8,
    0
  );


function updateCam() {

  camera.position.set(

    target.x +
      radius *
      Math.sin(phi) *
      Math.sin(theta),

    target.y +
      radius *
      Math.cos(phi),

    target.z +
      radius *
      Math.sin(phi) *
      Math.cos(theta)

  );

  camera.lookAt(target);
}


updateCam();


let isDragging = false;

let lastX = 0;
let lastY = 0;


canvas.addEventListener(
  "mousedown",
  e => {

    if (arMode) return;

    isDragging = true;

    lastX = e.clientX;
    lastY = e.clientY;

  }
);


window.addEventListener(
  "mouseup",
  () => {

    isDragging = false;

  }
);


window.addEventListener(
  "mousemove",
  e => {

    if (!isDragging || arMode)
      return;

    theta -=
      (e.clientX - lastX) *
      0.008;

    phi =
      THREE.MathUtils.clamp(

        phi +
          (e.clientY - lastY) *
          0.008,

        0.1,

        Math.PI * 0.45

      );


    lastX = e.clientX;
    lastY = e.clientY;

    updateCam();

  }
);


canvas.addEventListener(
  "wheel",
  e => {

    if (arMode) return;

    radius =
      THREE.MathUtils.clamp(

        radius +
          e.deltaY * 0.02,

        2,

        40

      );

    updateCam();

    e.preventDefault();

  },
  {
    passive: false
  }
);


/* ============================================================
   TOUCH CAMERA
   ============================================================ */

let lastTouch = null;


canvas.addEventListener(
  "touchstart",
  e => {

    if (arMode) return;

    if (e.touches.length === 1) {

      lastTouch =
        e.touches[0];

    }

  },
  {
    passive: true
  }
);


canvas.addEventListener(
  "touchmove",
  e => {

    if (
      arMode ||
      e.touches.length !== 1 ||
      !lastTouch
    )
      return;


    const t =
      e.touches[0];


    theta -=
      (t.clientX -
        lastTouch.clientX) *
      0.01;


    phi =
      THREE.MathUtils.clamp(

        phi +
          (t.clientY -
            lastTouch.clientY) *
          0.01,

        0.1,

        Math.PI * 0.45

      );


    lastTouch = t;

    updateCam();

    e.preventDefault();

  },
  {
    passive: false
  }
);


/* ============================================================
   RESIZE
   ============================================================ */

window.addEventListener(
  "resize",
  () => {

    camera.aspect =
      innerWidth /
      innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
      innerWidth,
      innerHeight
    );

  }
);


/* ============================================================
   TAG INITIALIZATION
   ============================================================ */

function initTags() {

  const ll =
    document.getElementById("ll");


  BEARINGS.forEach(b => {

    wpos[b.id] =
      new THREE.Vector3(
        ...b.dp
      );


    const el =
      document.createElement("div");


    el.className =
      "tag";


    el.id =
      "tg_" + b.id;


    el.innerHTML =

      '<div class="tag-card">' +

        '<div class="tn">' +
          b.label +
        '</div>' +

        '<div class="tr">' +

          '<span class="tl">' +
            'VIB-X' +
          '</span>' +

          '<span>' +

            '<span class="tv" id="' +
              b.id +
              '_vX">—</span> µm' +

          '</span>' +

        '</div>' +


        '<div class="tr">' +

          '<span class="tl">' +
            'VIB-Y' +
          '</span>' +

          '<span>' +

            '<span class="tv" id="' +
              b.id +
              '_vY">—</span> µm' +

          '</span>' +

        '</div>' +


        '<div class="tr">' +

          '<span class="tl">' +
            'TEMP' +
          '</span>' +

          '<span>' +

            '<span class="tv" id="' +
              b.id +
              '_t">—</span> °C' +

          '</span>' +

        '</div>' +


        '<div class="tr">' +

          '<span class="tl">' +
            'SEC' +
          '</span>' +

          '<span style="color:#4a6080;font-size:9px">' +

            b.sec +

          '</span>' +

        '</div>' +

      '</div>' +

      '<div class="tag-line"></div>' +

      '<div class="tag-dot"></div>';


    ll.appendChild(el);

    tels[b.id] = el;

  });

}


/* ============================================================
   TAG PROJECTION
   ============================================================ */

const projected =
  new THREE.Vector3();


function projectTags() {

  if (!model || !labelsOn)
    return;


  BEARINGS.forEach(b => {

    const el =
      tels[b.id];

    const wp =
      wpos[b.id];


    if (!el || !wp)
      return;


    /*
      Important for AR:

      Convert turbine-local coordinates
      into world coordinates before projecting.

      This means labels follow the turbine
      when the turbine is placed on a table.
    */

    const worldPoint =
      projected.set(0, 0, 0);


    worldPoint
      .copy(wp)
      .applyMatrix4(
        model.matrixWorld
      )
      .project(
        arMode
          ? renderer.xr.getCamera(camera)
          : camera
      );


    if (worldPoint.z > 1) {

      el.style.display =
        "none";

      return;

    }


    el.style.display =
      "block";


    el.style.left =

      (
        (
          worldPoint.x *
          0.5 +
          0.5
        ) *
        innerWidth
      ) +
      "px";


    el.style.top =

      (
        (
          -worldPoint.y *
          0.5 +
          0.5
        ) *
        innerHeight
      ) +
      "px";

  });

}


/* ============================================================
   GOOGLE SHEETS CSV PARSER
   ============================================================ */

function parseCSV(text) {

  const rows = [];

  let row = [];

  let cell = "";

  let quoted = false;


  for (
    let i = 0;
    i < text.length;
    i++
  ) {

    const ch =
      text[i];

    const next =
      text[i + 1];


    if (ch === '"') {

      if (
        quoted &&
        next === '"'
      ) {

        cell += '"';

        i++;

      } else {

        quoted =
          !quoted;

      }

    }


    else if (
      ch === "," &&
      !quoted
    ) {

      row.push(cell);

      cell = "";

    }


    else if (
      (
        ch === "\n" ||
        ch === "\r"
      ) &&
      !quoted
    ) {

      if (
        ch === "\r" &&
        next === "\n"
      ) {

        i++;

      }


      row.push(cell);

      cell = "";


      if (
        row.some(
          v =>
            v.trim() !== ""
        )
      ) {

        rows.push(row);

      }


      row = [];

    }


    else {

      cell += ch;

    }

  }


  row.push(cell);


  if (
    row.some(
      v =>
        v.trim() !== ""
    )
  ) {

    rows.push(row);

  }


  return rows;
}


/* ============================================================
   CLEAN SHEET KEY
   ============================================================ */

function cleanKey(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .trim();
}

function sensorKey(value) {
  return cleanKey(value)
    .toUpperCase()
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/* ============================================================
   PARSE NUMERIC VALUE
   ============================================================ */

function parseValue(value) {

  const s =
    cleanKey(value);


  if (
    !s ||
    /N\/A|NA|NULL|NONE/i.test(s)
  ) {

    return null;

  }


  const n =
    parseFloat(
      s.replace(
        /,/g,
        ""
      )
    );


  return Number.isFinite(n)
    ? n
    : null;

}


/* ============================================================
   FETCH GOOGLE SHEET
   ============================================================ */

async function fetchData() {

  try {

    const url =

      SHEETS_CSV +

      (
        SHEETS_CSV.includes("?")
          ? "&"
          : "?"
      ) +

      "t=" +
      Date.now();


    const response =
      await fetch(
        url,
        {
          cache:
            "no-store"
        }
      );


    if (!response.ok) {

      throw new Error(
        "Google Sheet HTTP " +
        response.status
      );

    }


    const csv =
      await response.text();


    const rows =
      parseCSV(csv);


    const next = {};


    for (
      const row of rows
    ) {

      const key =
        cleanKey(
          row[0]
        );


      if (!key)
        continue;


      next[key] =
        parseValue(
          row[1]
        );

    }


    data =
      next;

    // Only push to display if not frozen
    if (!frozen) {
      updateTags();
      colorMeshes();
    }


    document.getElementById(
      "hR"
    ).textContent =
      Math.round(
        REFRESH_MS / 1000
      ) + "s";

    updateFreezeBar();

    if (!frozen) {
      status(

        "LIVE • Google Sheet updated " +

        new Date()
          .toLocaleTimeString(),

        true

      );


      setTimeout(
        () => status("", false),
        1800
      );
    }


  }

  catch (error) {

    console.error(
      "Google Sheet error:",
      error
    );


    status(

      "Google Sheet update failed: " +
      error.message,

      true

    );

  }

}


/* ============================================================
   VALUE CLASS
   ============================================================ */

function vc(
  v,
  warn,
  alert
) {

  if (v == null)
    return "";


  if (v > alert)
    return "alert";


  if (v > warn)
    return "warn";


  return "ok";

}


/* ============================================================
   SET TAG VALUE
   ============================================================ */

function setValue(
  id,
  value,
  warn,
  alert
) {

  const el =
    document.getElementById(
      id
    );


  if (!el)
    return;


  el.textContent =

    value != null &&
    Number.isFinite(value)

      ? value.toFixed(1)

      : "—";


  el.className =
    "tv " +
    vc(
      value,
      warn,
      alert
    );

}


/* ============================================================
   UPDATE ALL TAGS
   ============================================================ */

function getSensorValue(name) {
  return getSensorValueFrom(data, name);
}

// Generic: look up a sensor name in any data object (live or frozen snapshot)
function getSensorValueFrom(src, name) {
  if (!name) return null;
  if (Object.prototype.hasOwnProperty.call(src, name)) {
    return src[name];
  }
  const k = sensorKey(name);
  if (Object.prototype.hasOwnProperty.call(src, k)) {
    return src[k];
  }
  // Fallback: case-insensitive search
  const lower = k.toLowerCase();
  for (const key of Object.keys(src)) {
    if (sensorKey(key).toLowerCase() === lower) return src[key];
  }
  return null;
}

function updateTags() {

  // Use frozen snapshot if freeze mode is active
  const src = frozen ? frozenData : data;

  let alerts = 0;


  BEARINGS.forEach(
    b => {

      const vX =
        getSensorValueFrom(src, b.vX);

      const vY =
        getSensorValueFrom(src, b.vY);

      const temp =
        b.t
          ? getSensorValueFrom(src, b.t)
          : null;


      setValue(
        b.id + "_vX",
        vX,
        VW,
        VA
      );


      setValue(
        b.id + "_vY",
        vY,
        VW,
        VA
      );


      setValue(
        b.id + "_t",
        temp,
        TW,
        TA
      );


      const maxVib =
        Math.max(
          vX ?? 0,
          vY ?? 0
        );


      let state =
        "ok";


      if (
        maxVib > VA ||
        (
          temp != null &&
          temp > TA
        )
      ) {

        state =
          "alert";

        alerts++;

      }


      else if (
        maxVib > VW ||
        (
          temp != null &&
          temp > TW
        )
      ) {

        state =
          "warn";

      }


      tels[b.id].className =
        "tag " +
        state;

    }
  );


  const vibrations =

    BEARINGS

      .flatMap(
        b => [
          getSensorValueFrom(src, b.vX),
          getSensorValueFrom(src, b.vY)
        ]
      )

      .filter(
        v =>
          v != null &&
          Number.isFinite(v)
      );


  const maxVib =

    vibrations.length

      ? Math.max(
          ...vibrations
        )

      : null;


  const thrust =
    getSensorValueFrom(src, "T THRUST BRG FRONT");


  const hA =
    document.getElementById(
      "hA"
    );


  hA.textContent =
    alerts ||
    "✓";


  hA.className =

    alerts > 2

      ? "alert"

      : alerts

        ? "warn"

        : "ok";


  const hV =
    document.getElementById(
      "hV"
    );


  hV.textContent =

    maxVib != null

      ? maxVib.toFixed(1) +
        " µm"

      : "—";


  hV.className =

    maxVib != null

      ? vc(
          maxVib,
          VW,
          VA
        )

      : "";


  const hT =
    document.getElementById(
      "hT"
    );


  hT.textContent =

    thrust != null

      ? thrust.toFixed(1) +
        "°C"

      : "—";


  hT.className =

    thrust != null

      ? vc(
          thrust,
          TW,
          TA
        )

      : "";

}


/* ============================================================
   GLB LOADING
   ============================================================ */

const loader =
  new GLTFLoader();


function normalizeModel(root) {

  const box =
    new THREE.Box3()
      .setFromObject(root);


  if (box.isEmpty()) {

    throw new Error(
      "The GLB contains no visible geometry."
    );

  }


  const size =
    box.getSize(
      new THREE.Vector3()
    );


  const center =
    box.getCenter(
      new THREE.Vector3()
    );


  const largest =
    Math.max(
      size.x,
      size.y,
      size.z
    );


  const scale =
    6 / largest;


  root.scale.setScalar(
    scale
  );


  const scaledBox =
    new THREE.Box3()
      .setFromObject(root);


  const scaledCenter =
    scaledBox.getCenter(
      new THREE.Vector3()
    );


  root.position.x -=
    scaledCenter.x;


  root.position.z -=
    scaledCenter.z;


  root.position.y -=
    scaledBox.min.y;


  return new THREE.Box3()
    .setFromObject(root);

}


/* ============================================================
   NORMALIZE NODE NAME
   ============================================================ */

function normalizedName(name) {

  return String(
    name || ""
  )

    .toUpperCase()

    .replace(
      /[\s_-]/g,
      ""
    );

}


/* ============================================================
   FIND BEARING MESHES
   ============================================================ */

function anchorTagsToMeshes() {

  if (!model)
    return;


  BEARINGS.forEach(
    b => {

      let found = null;


      model.traverse(
        child => {

          if (
            !child.isMesh ||
            found
          )
            return;


          const n =
            normalizedName(
              child.name
            );


          for (
            const key of b.mk
          ) {

            if (
              n.includes(
                normalizedName(
                  key
                )
              )
            ) {

              found =
                child;

              break;

            }

          }

        }
      );


      if (found) {

        const box =
          new THREE.Box3()
            .setFromObject(
              found
            );


        const p =
          box.getCenter(
            new THREE.Vector3()
          );


        p.y =
          box.max.y +
          0.15;


        wpos[b.id]
          .copy(p);

      }

    }
  );

}


/* ============================================================
   LOAD TURBINE.GLB
   ============================================================ */

function loadModel() {

  status(
    "Loading turbine.glb from GitHub…",
    true
  );


  loader.load(

    MODEL_URL,


    gltf => {

      try {

        if (model) {

          scene.remove(
            model
          );

        }


        model =
          gltf.scene;


        model.traverse(
          child => {

            if (!child.isMesh)
              return;


            child.castShadow =
              true;


            child.receiveShadow =
              true;


            if (
              Array.isArray(
                child.material
              )
            ) {

              child.material =
                child.material.map(
                  m => m.clone()
                );

            }

            else if (
              child.material
            ) {

              child.material =
                child.material.clone();

            }

          }
        );


        normalizeModel(
          model
        );


        scene.add(
          model
        );


        anchorTagsToMeshes();


        colorMeshes();


        hint.style.display =
          "none";


        status(
          "Turbine loaded • connecting live data…",
          true
        );


        checkAR();


        console.log(
          "Turbine GLB loaded successfully."
        );

      }


      catch (error) {

        console.error(
          error
        );


        status(

          "Model loaded but could not be prepared: " +
          error.message,

          true

        );

      }

    },


    xhr => {

      if (xhr.total) {

        const percent =
          Math.round(
            xhr.loaded /
            xhr.total *
            100
          );


        status(

          "Loading turbine.glb… " +
          percent +
          "%",

          true

        );

      }

    },


    error => {

      console.error(
        "GLB loading failed:",
        error
      );


      hint.style.display =
        "block";


      hint.querySelector(
        "h2"
      ).textContent =
        "3D model could not load";


      hint.querySelector(
        "p"
      ).innerHTML =

        "Check that <b>turbine.glb</b> is in the same GitHub repository folder as index.html.<br><br>" +

        "Expected path:<br>" +

        "<span style='color:#00c8ff'>./turbine.glb</span>";


      status(
        "GLB load failed. See browser console.",
        true
      );

    }

  );

}


/* ============================================================
   COLOR BEARING MESHES
   ============================================================ */

function colorMeshes() {

  if (!model)
    return;


  BEARINGS.forEach(
    b => {

      const vX =
        data[b.vX] ??
        0;


      const vY =
        data[b.vY] ??
        0;


      const maxV =
        Math.max(
          vX,
          vY
        );


      const color =
        new THREE.Color(

          maxV > VA

            ? 0xff3d3d

            : maxV > VW

              ? 0xffb300

              : 0x00e676

        );


      model.traverse(
        child => {

          if (!child.isMesh)
            return;


          const n =
            normalizedName(
              child.name
            );


          if (
            !b.mk.some(
              key =>
                n.includes(
                  normalizedName(
                    key
                  )
                )
            )
          ) {

            return;

          }


          const mats =

            Array.isArray(
              child.material
            )

              ? child.material

              : [
                  child.material
                ];


          mats.forEach(
            mat => {

              if (!mat)
                return;


              if (mat.color) {

                mat.color.copy(
                  color
                );

              }


              if (mat.emissive) {

                mat.emissive.copy(
                  color
                );


                mat.emissiveIntensity =
                  0.18;

              }

            }
          );

        }
      );

    }
  );

}


/* ============================================================
   AR / WEBXR
   ============================================================ */

let arMode = false;
let xrSession = null;
let modelPlaced = false;

const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.06, 0.09, 32),
  new THREE.MeshBasicMaterial({
    color: 0x00c8ff,
    side: THREE.DoubleSide
  })
);

reticle.rotation.x = -Math.PI / 2;
reticle.visible = false;
scene.add(reticle);

/* ============================================================
   CHECK AR
   ============================================================ */

function checkAR() {
  const button = document.getElementById("bAR");

  if (!navigator.xr || !button) return;

  navigator.xr.isSessionSupported("immersive-ar")
    .then(supported => {
      if (supported) button.style.display = "block";
    })
    .catch(() => {});
}

/* ============================================================
   START AR
   ============================================================ */

async function startAR() {

  if (!model) {
    alert("Turbine is still loading.");
    return;
  }

  if (!navigator.xr) {
    alert(
      "WebXR is not available in this browser. Open this page in Chrome on a compatible AR Android device."
    );
    return;
  }

  try {
    console.log("AR 1: checking immersive-ar support...");

    const supported =
      await navigator.xr.isSessionSupported("immersive-ar");

    if (!supported) {
      throw new Error("Immersive AR is not supported on this device/browser.");
    }

    console.log("AR 2: requesting AR with DOM overlay...");

    /*
      DOM OVERLAY IS REQUIRED here.

      This is the important difference from the previous version:
      the browser was entering the XR fullscreen camera, but because
      DOM overlay was only OPTIONAL, some devices accepted AR without
      exposing our HTML controls. The user therefore saw only the
      camera/fullscreen view and had no placement button.

      We do NOT request viewer/hit-test reference spaces during startup.
      Therefore the previous requestReferenceSpace device error cannot
      block camera startup.
    */
    const session =
      await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["dom-overlay"],
        optionalFeatures: [],
        domOverlay: {
          root: document.body
        }
      });

    console.log("AR 3: XR session created with DOM overlay.");

    xrSession = session;

    /* Connect Three.js immediately. */
    await renderer.xr.setSession(session);

    console.log("AR 4: Three.js renderer connected. Camera active.");

    arMode = true;
    modelPlaced = false;

    scene.background = null;
    scene.fog = null;
    grid.visible = false;
    model.visible = false;
    reticle.visible = false;

    document.getElementById("bar").style.display = "none";
    document.getElementById("ctrls").style.display = "none";

    const arTap = document.getElementById("arTap");
    const arExit = document.getElementById("arExit");

    /*
      These are DOM-overlay elements, so they remain visible over the
      live camera feed while immersive AR is running.
    */
    arTap.textContent = "👆 TAP TO PLACE TURBINE ON FLOOR";
    arTap.style.display = "block";
    arExit.style.display = "block";

    /*
      Place the normalized turbine approximately on the floor in front
      of the user. This deliberately uses only the XR camera and does
      not require hit-test/reference-space support.
    */
    const placeModel = () => {
      if (modelPlaced || !model) return;

      const xrCamera = renderer.xr.getCamera(camera);
      const direction = new THREE.Vector3();

      xrCamera.getWorldDirection(direction);
      direction.y = 0;

      if (direction.lengthSq() < 0.0001) {
        direction.set(0, 0, -1);
      } else {
        direction.normalize();
      }

      const position = xrCamera.position
        .clone()
        .addScaledVector(direction, 1.5);

      /*
        The model was normalized so its base is at local y=0.
        XR local space normally starts around the user's position,
        so lowering by the current camera height puts the base near
        floor level without asking for a reference space.
      */
      position.y -= xrCamera.position.y;
      position.y += 0.03;

      model.position.copy(position);
      model.visible = true;
      modelPlaced = true;

      arTap.style.display = "none";

      console.log("AR 5: turbine placed on floor.", position);
    };

    arTap.onclick = placeModel;

    /* Also allow a normal XR select/tap as a secondary placement method. */
    session.addEventListener("select", placeModel);

    session.addEventListener("end", () => {
      console.log("AR 6: XR session ended.");
      cleanupAR(false);
    });

    const button = document.getElementById("bAR");
    if (button) button.textContent = "⏹ EXIT AR";

    console.log("AR 7: READY. Camera + placement button should be visible.");

  } catch (error) {
    console.error("AR START ERROR:", error);
    cleanupAR(false);

    alert(
      "AR could not start.\n\n" +
      (error?.message || "The browser/device did not start the AR camera.")
    );
  }
}

/* ============================================================
   CLEANUP AR
   ============================================================ */

function cleanupAR(
  endSession = true
) {

  arMode =
    false;


  modelPlaced =
    false;



  if (
    endSession &&
    xrSession
  ) {

    try {

      xrSession.end();

    }

    catch (_) {}

  }


  xrSession =
    null;


  scene.background =
    new THREE.Color(
      0x0a0d12
    );


  scene.fog =
    new THREE.FogExp2(
      0x0a0d12,
      0.03
    );


  grid.visible =
    true;


  if (model) {

    model.visible =
      true;


    model.position.set(
      0,
      0,
      0
    );

  }


  reticle.visible =
    false;


  document.getElementById(
    "bAR"
  ).textContent =
    "📷 START AR";


  document.getElementById(
    "arExit"
  ).style.display =
    "none";


  document.getElementById(
    "arTap"
  ).style.display =
    "none";


  document.getElementById(
    "bar"
  ).style.display =
    "flex";


  document.getElementById(
    "ctrls"
  ).style.display =
    "flex";

}


/* ============================================================
   EXIT AR
   ============================================================ */

function exitAR() {

  cleanupAR(true);

}


document.getElementById(
  "bAR"
).onclick = () => {

  if (arMode)
    exitAR();

  else
    startAR();

};


document.getElementById(
  "arExit"
).onclick =
  exitAR;


/* ============================================================
   RENDER LOOP
   ============================================================ */

function renderLoop(timestamp, frame) {
  renderer.render(scene, camera);

  if (labelsOn) {
    projectTagsWithEdit();
  }
}

renderer.setAnimationLoop(renderLoop);

/* ============================================================
   BASIC CONTROLS
   ============================================================ */

document.getElementById(
  "bReset"
).onclick = () => {

  theta = 0;

  phi =
    Math.PI / 5;

  radius = 9;

  updateCam();

};


document.getElementById(
  "bLabel"
).onclick = e => {

  labelsOn =
    !labelsOn;


  document.getElementById(
    "ll"
  ).style.visibility =
    labelsOn
      ? "visible"
      : "hidden";


  e.currentTarget
    .classList
    .toggle(
      "active",
      labelsOn
    );

};


document.getElementById(
  "bWire"
).onclick = e => {

  wire =
    !wire;


  if (model) {

    model.traverse(
      child => {

        if (!child.isMesh)
          return;


        const mats =

          Array.isArray(
            child.material
          )

            ? child.material

            : [
                child.material
              ];


        mats.forEach(
          mat => {

            if (mat) {

              mat.wireframe =
                wire;

            }

          }
        );

      }
    );

  }


  e.currentTarget
    .classList
    .toggle(
      "active",
      wire
    );

};


/* ============================================================
   EDIT MODE
   ============================================================ */

let editMode =
  false;


let dragState =
  null;


const screenPos =
  {};


/* ============================================================
   SAVE LABEL POSITIONS
   ============================================================ */

function saveScreenPos() {

  localStorage.setItem(

    "turbine_tag_pos",

    JSON.stringify(
      screenPos
    )

  );

}


/* ============================================================
   LOAD LABEL POSITIONS
   ============================================================ */

function loadSavedScreenPos() {

  try {

    const saved =

      JSON.parse(

        localStorage.getItem(
          "turbine_tag_pos"
        ) || "null"

      );


    if (!saved)
      return;


    Object.keys(saved)
      .forEach(
        id => {

          screenPos[id] =
            saved[id];


          if (tels[id]) {

            tels[id].style.left =
              saved[id].x +
              "px";


            tels[id].style.top =
              saved[id].y +
              "px";

          }

        }
      );

  }

  catch (_) {}

}


/* ============================================================
   EDIT BUTTON
   ============================================================ */

document.getElementById(
  "bEdit"
).onclick = e => {

  editMode =
    !editMode;


  document.body
    .classList
    .toggle(
      "editmode",
      editMode
    );


  e.currentTarget
    .classList
    .toggle(
      "active",
      editMode
    );


  if (editMode) {

    BEARINGS.forEach(
      b => {

        const el =
          tels[b.id];


        if (!el)
          return;


        screenPos[b.id] = {

          x:
            parseFloat(
              el.style.left
            ) ||
            innerWidth / 2,

          y:
            parseFloat(
              el.style.top
            ) ||
            innerHeight / 2

        };


        el.style.display =
          "block";

      }
    );


    loadSavedScreenPos();

  }


  else {

    saveScreenPos();

  }

};


/* ============================================================
   DRAG LABELS
   ============================================================ */

document.getElementById(
  "ll"
).addEventListener(
  "mousedown",
  e => {

    if (!editMode)
      return;


    const tag =
      e.target.closest(
        ".tag"
      );


    if (!tag)
      return;


    const id =
      tag.id.replace(
        "tg_",
        ""
      );


    const p =
      screenPos[id] || {

        x:
          parseFloat(
            tag.style.left
          ) || 0,

        y:
          parseFloat(
            tag.style.top
          ) || 0

      };


    dragState = {

      id,

      startX:
        e.clientX,

      startY:
        e.clientY,

      origX:
        p.x,

      origY:
        p.y

    };


    e.preventDefault();

  }
);


window.addEventListener(
  "mousemove",
  e => {

    if (!dragState)
      return;


    const x =

      dragState.origX +

      e.clientX -
      dragState.startX;


    const y =

      dragState.origY +

      e.clientY -
      dragState.startY;


    screenPos[
      dragState.id
    ] = {

      x,
      y

    };


    const el =
      tels[
        dragState.id
      ];


    if (el) {

      el.style.left =
        x + "px";


      el.style.top =
        y + "px";

    }

  }
);


window.addEventListener(
  "mouseup",
  () => {

    if (!dragState)
      return;


    saveScreenPos();


    dragState =
      null;

  }
);


/* ============================================================
   EXPORT LABEL POSITIONS
   ============================================================ */

document.getElementById(
  "bSave"
).onclick = () => {

  const blob =
    new Blob(

      [
        JSON.stringify(
          screenPos,
          null,
          2
        )
      ],

      {
        type:
          "application/json"
      }

    );


  const url =
    URL.createObjectURL(
      blob
    );


  const a =
    document.createElement(
      "a"
    );


  a.href =
    url;


  a.download =
    "tag-positions.json";


  a.click();


  URL.revokeObjectURL(
    url
  );

};


/* ============================================================
   EDIT-MODE TAG PROJECTION
   ============================================================ */

const originalProjectTags =
  projectTags;


function projectTagsWithEdit() {

  if (editMode) {

    BEARINGS.forEach(
      b => {

        const el =
          tels[b.id];


        const p =
          screenPos[b.id];


        if (
          el &&
          p
        ) {

          el.style.left =
            p.x + "px";


          el.style.top =
            p.y + "px";


          el.style.display =
            "block";

        }

      }
    );


    return;

  }


  originalProjectTags();

}


/* ============================================================
   FREEZE
   ============================================================ */

function updateFreezeBar() {
  const pill = document.getElementById("hFreeze");
  const btn  = document.getElementById("bFreeze");
  if (!pill) return;

  if (frozen) {
    pill.innerHTML = "❄ FROZEN <b style='color:#00c8ff'>" +
      new Date(frozenData._ts || Date.now()).toLocaleTimeString() + "</b>";
    if (btn) btn.classList.add("active");
  } else {
    pill.innerHTML = "🔴 <b class='ok'>LIVE</b>";
    if (btn) btn.classList.remove("active");
  }
}

const bFreezeEl = document.getElementById("bFreeze");
if (bFreezeEl) bFreezeEl.onclick = e => {

  frozen = !frozen;

  if (frozen) {
    // Snapshot current live data
    frozenData = Object.assign({}, data);
    frozenData._ts = Date.now();
    // Render frozen snapshot immediately
    updateTags();
    colorMeshes();
    status("❄ Data frozen at " + new Date().toLocaleTimeString(), true);
    setTimeout(() => status("", false), 2500);
  } else {
    // Unfreeze: push latest live data
    updateTags();
    colorMeshes();
    status("▶ Resumed live data", true);
    setTimeout(() => status("", false), 1800);
  }

  updateFreezeBar();

};


/* ============================================================
   START
   ============================================================ */

initTags();


loadSavedScreenPos();


fetchData();


setInterval(
  fetchData,
  REFRESH_MS
);


loadModel();


console.log(
  "Turbine Digital Twin initialized."
);


console.log(
  "Model URL:",
  MODEL_URL
);


console.log(
  "Google Sheet CSV:",
  SHEETS_CSV
);
