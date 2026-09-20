import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/meshopt_decoder.module.js";

/* ============================================================
   TURBINE DIGITAL TWIN  v6
   7 bearing panels replicating DCS layout exactly
   + 1 machine panel (thrust/expansion) fixed top-left
   ============================================================ */

const MODEL_URL  = "./turbine.glb";
//const SHEETS_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTGvHDpe6m7ycqjlbRf7FcWxogdy8gD0Km0dgfRLu_l_iSgOs5l0Emu8tGIICr5N8amuJsTLN4xPgm1/pub?gid=2032255384&single=true&output=csv";
const DATA_URL = "https://pivision-bridge.onrender.com/data";
const REFRESH_MS = 10000;

const VW=75, VA=100;   // vib warn/alert µm
const TW=80, TA=90;    // temp warn/alert °C

/* ============================================================
   7 BEARING DEFINITIONS — mirrored from DCS screen exactly
   Each bearing has:
     vX, vY   — shaft relative vibration (µm)
     temps[]  — temperature sensors, labeled as on DCS
   Leave key:"" for points you will connect later.
   below: alternates to avoid overlap on long shaft
   axFrac: 0-1 fallback position along turbine X axis
   ============================================================ */
const BEARINGS = [
  {
    id:"BRG1", label:"BRG-1", sub:"MAD10", sec:"HPT",
    below:false, axFrac:0.04,
    dp:[-2.8,1.8,0],
    mk:["BRG1","BEARING1","BRG-1","MAD10"],
    vX:"BRG 1 VIB-X SHAFT REL",
    vY:"BRG 1 VIB-Y SHAFT REL",
    temps:[
      { label:"T METAL",   key:"T METAL RADIAL BRG-1" },
      { label:"LPT EXT T", key:"" },
      { label:"T VERT",    key:"" }
    ]
  },
  {
    id:"BRG2", label:"BRG-2", sub:"MAD21", sec:"HPT/IPT",
    below:true, axFrac:0.18,
    dp:[-1.9,0.9,0],
    mk:["BRG2","BEARING2","BRG-2","MAD21"],
    vX:"BRG-2 VIB-X SHAFT REL",
    vY:"BRG-2 VIB-Y SHAFT REL",
    temps:[
      { label:"T METAL-1", key:"" },
      { label:"T METAL-2", key:"T METAL THRUST BRG-2" }
    ]
  },
  {
    id:"BRG3", label:"BRG-3", sub:"MAC10/MAD31", sec:"IPT",
    below:false, axFrac:0.32,
    dp:[-0.8,1.8,0],
    mk:["BRG3","BEARING3","BRG-3","MAC10","MAD31"],
    vX:"BRG-3 VIB-X SHAFT REL",
    vY:"BRG-3 VIB-Y SHAFT REL",
    temps:[
      { label:"T METAL",   key:"T METAL RADIAL BRG-3" },
      { label:"LPT EXT T", key:"" },
      { label:"LPT VERT",  key:"" }
    ]
  },
  {
    id:"BRG4", label:"BRG-4", sub:"MAC20/MAD41", sec:"LPT",
    below:true, axFrac:0.47,
    dp:[0.3,0.9,0],
    mk:["BRG4","BEARING4","BRG-4","MAC20","MAD41"],
    vX:"BRG-4 VIB -X SHAFT REL",
    vY:"BRG-4 VIB -Y SHAFT REL",
    temps:[
      { label:"T METAL",   key:"T METAL RADIAL BRG-4" },
      { label:"LPT EXT T", key:"" },
      { label:"LPT VERT",  key:"" }
    ]
  },
  {
    id:"BRG5", label:"BRG-5", sub:"MKD11", sec:"LPT-2",
    below:false, axFrac:0.65,
    dp:[1.5,1.8,0],
    mk:["BRG5","BEARING5","BRG-5","MKD11"],
    vX:"",
    vY:"",
    temps:[
      { label:"T METAL",   key:"T MTL RADIAL BRG LPT-1" },
      { label:"T EXT",     key:"" }
    ]
  },
  {
    id:"BRG6", label:"BRG-6", sub:"MKD21", sec:"GEN DE",
    below:true, axFrac:0.80,
    dp:[2.4,0.9,0],
    mk:["BRG6","BEARING6","BRG-6","MKD21"],
    vX:"BRG-5 VIB-X SHAFT REL GEN DE",
    vY:"BRG-5 VIB-Y SHAFT REL GEN DE",
    temps:[
      { label:"T METAL",   key:"T MTL RADIAL BRG GEN DE" },
      { label:"T GEN NDE", key:"T MTL RADIAL BRG GEN NDE" }
    ]
  },
  {
    id:"BRG7", label:"BRG-7", sub:"MKD51", sec:"GEN NDE",
    below:false, axFrac:0.95,
    dp:[3.1,1.8,0],
    mk:["BRG7","BEARING7","BRG-7","MKD51"],
    vX:"BRG-5 VIB-X SHAFT REL GEN NDE",
    vY:"BRG-5 VIB-Y SHAFT REL GEN NDE",
    temps:[
      { label:"T METAL",   key:"T METAL RADIAL BRG-6" }
    ]
  }
];

/* ============================================================
   MACHINE PANEL items (thrust + expansion)
   ============================================================ */
const MP = [
  // Thrust temps
  { id:"mp_thrF",  label:"THR FRONT",   key:"T THRUST BRG FRONT",        unit:"°C" },
  { id:"mp_thrR",  label:"THR REAR",    key:"T THRUST BRG REAR",         unit:"°C" },
  { id:"mp_thrM",  label:"THR METAL",   key:"T MTL RDL BRG EXC ACT VAL",unit:"°C" },
  // Thrust positions
  { id:"mp_tp1",   label:"THR POS-1",   key:"THRUST POS-1",              unit:"mm" },
  { id:"mp_tp2",   label:"THR POS-2",   key:"THRUST POS-2",              unit:"mm" },
  { id:"mp_tp3",   label:"THR POS-3",   key:"THRUST POS-3",              unit:"mm" },
  { id:"mp_tp23",  label:"POS 2/3 BRG2",key:"THRUST POS 2O3 BRG 2",     unit:"mm" },
  // Expansions
  { id:"mp_deHP",  label:"ΔExp HP",     key:"DIFF EXP HP TURB",          unit:"mm" },
  { id:"mp_deIP",  label:"ΔExp IP",     key:"DIFF EXP IP TURB",          unit:"mm" },
  { id:"mp_deLP1", label:"ΔExp LP1",    key:"DIFF EXP LP TURB1",         unit:"mm" },
  { id:"mp_deLP2", label:"ΔExp LP2",    key:"DIFF EXP LP TURB2",         unit:"mm" },
  { id:"mp_ecc",   label:"ECCENTR HPT", key:"ECCNTR HPT SHAFT",          unit:"µm" },
  { id:"mp_absIP", label:"ABS EXP IPT", key:"ABS EXPANSION IPT",         unit:"mm" },
  { id:"mp_load",  label:"LOAD",        key:"LOAD",                       unit:"MW" }
];

/* ============================================================
   STATE
   ============================================================ */
let data={}, model=null, labelsOn=true, wire=false, frozen=false, frozenData={};
let arMode=false, editMode=false;
const wpos={}, tels={};

/* ============================================================
   DOM
   ============================================================ */
const canvas  = document.getElementById("c");
const hint    = document.getElementById("hint");
const statusEl= document.getElementById("status");
function setStatus(msg,on=true){ if(!statusEl) return; statusEl.textContent=msg; statusEl.style.display=on?"block":"none"; }

/* ============================================================
   THREE.JS
   ============================================================ */
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x0a0d12);
scene.fog=new THREE.FogExp2(0x0a0d12,0.03);

const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,0.01,500);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:"high-performance"});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.1;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.xr.enabled=true;

scene.add(new THREE.HemisphereLight(0xcfe7ff,0x111722,2.2));
const sun=new THREE.DirectionalLight(0xffffff,2.5);
sun.position.set(6,10,6); sun.castShadow=true; scene.add(sun);
const fill=new THREE.DirectionalLight(0x4488ff,0.7);
fill.position.set(-6,3,-6); scene.add(fill);
const grid=new THREE.GridHelper(30,60,0x1e2d45,0x111622);
scene.add(grid);

/* ============================================================
   CAMERA ORBIT
   ============================================================ */
let theta=0, phi=Math.PI/5, radius=9;
const camTarget=new THREE.Vector3(0,1.8,0);
function updateCam(){
  camera.position.set(
    camTarget.x+radius*Math.sin(phi)*Math.sin(theta),
    camTarget.y+radius*Math.cos(phi),
    camTarget.z+radius*Math.sin(phi)*Math.cos(theta)
  );
  camera.lookAt(camTarget);
}
updateCam();

let isDragging=false,lastX=0,lastY=0;
canvas.addEventListener("mousedown",e=>{ if(arMode||editMode)return; isDragging=true; lastX=e.clientX; lastY=e.clientY; });
window.addEventListener("mouseup",()=>{ isDragging=false; });
window.addEventListener("mousemove",e=>{
  if(!isDragging||arMode||editMode)return;
  theta-=(e.clientX-lastX)*0.008;
  phi=THREE.MathUtils.clamp(phi+(e.clientY-lastY)*0.008,0.1,Math.PI*0.45);
  lastX=e.clientX; lastY=e.clientY; updateCam();
});
canvas.addEventListener("wheel",e=>{ if(arMode)return; radius=THREE.MathUtils.clamp(radius+e.deltaY*0.02,2,40); updateCam(); e.preventDefault(); },{passive:false});

let lastTouch=null;
canvas.addEventListener("touchstart",e=>{ if(!arMode&&e.touches.length===1) lastTouch=e.touches[0]; },{passive:true});
canvas.addEventListener("touchmove",e=>{
  if(arMode||e.touches.length!==1||!lastTouch)return;
  const t=e.touches[0];
  theta-=(t.clientX-lastTouch.clientX)*0.01;
  phi=THREE.MathUtils.clamp(phi+(t.clientY-lastTouch.clientY)*0.01,0.1,Math.PI*0.45);
  lastTouch=t; updateCam(); e.preventDefault();
},{passive:false});

window.addEventListener("resize",()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });

/* ============================================================
   BUILD BEARING TAG HTML  — DCS style card
   Layout: VIB-X | VIB-Y  then each temp on its own row
   ============================================================ */
function buildTagHTML(b){
  // Vibration row pair
  let html=`
  <div class="tag-card">
    <div class="tc-head">
      <span class="tc-id">${b.label}</span>
      <span class="tc-sec">${b.sec}</span>
    </div>
    <div class="tc-sub">${b.sub}</div>
    <div class="tc-vib-row">
      <div class="tc-vib-cell">
        <div class="tc-vib-val"><span class="tv" id="${b.id}_vX">—</span><span class="tu"> µm</span></div>
        <div class="tc-vib-lbl">VIB-X</div>
      </div>
      <div class="tc-vib-div"></div>
      <div class="tc-vib-cell">
        <div class="tc-vib-val"><span class="tv" id="${b.id}_vY">—</span><span class="tu"> µm</span></div>
        <div class="tc-vib-lbl">VIB-Y</div>
      </div>
    </div>
    <div class="tc-div"></div>`;

  // Temperature rows
  b.temps.forEach((t,i)=>{
    html+=`
    <div class="tc-row">
      <span class="tl">${t.label}</span>
      <span><span class="tv" id="${b.id}_t${i}">—</span><span class="tu"> °C</span></span>
    </div>`;
  });

  html+=`</div>
  <div class="tag-line"></div>
  <div class="tag-dot"></div>`;
  return html;
}

/* ============================================================
   BUILD MACHINE PANEL
   ============================================================ */
function buildMachinePanel(){
  const el=document.getElementById("machine-panel");
  if(!el) return;
  const secs=[
    { title:"THRUST", ids:["mp_thrF","mp_thrR","mp_thrM","mp_tp1","mp_tp2","mp_tp3","mp_tp23"] },
    { title:"EXPANSION", ids:["mp_deHP","mp_deIP","mp_deLP1","mp_deLP2","mp_ecc","mp_absIP"] },
    { title:"UNIT", ids:["mp_load"] }
  ];
  let html=`<div class="mp-title">⚙ MACHINE</div>`;
  secs.forEach(sec=>{
    html+=`<div class="mp-sec-head">${sec.title}</div>`;
    sec.ids.forEach(id=>{
      const cfg=MP.find(m=>m.id===id); if(!cfg) return;
      html+=`<div class="mp-row">
        <span class="tl">${cfg.label}</span>
        <span><span class="tv" id="${id}">—</span><span class="tu"> ${cfg.unit}</span></span>
      </div>`;
    });
  });
  el.innerHTML=html;
}

/* ============================================================
   INIT TAGS + MACHINE PANEL
   ============================================================ */
function initTags(){
  const ll=document.getElementById("ll");
  BEARINGS.forEach(b=>{
    wpos[b.id]=new THREE.Vector3(...b.dp);
    const el=document.createElement("div");
    el.className="tag"+(b.below?" below":"");
    el.id="tg_"+b.id;
    el.style.transformOrigin="top left";
    el.style.scale="0.78";
    el.innerHTML=buildTagHTML(b);
    ll.appendChild(el);
    tels[b.id]=el;
  });
  buildMachinePanel();
}

/* ============================================================
   TAG PROJECTION
   ============================================================ */
const _proj=new THREE.Vector3();
function getScreenPos(b){
  if(!model||!wpos[b.id]) return null;
  _proj.copy(wpos[b.id]).applyMatrix4(model.matrixWorld);
  const cam=arMode?renderer.xr.getCamera(camera):camera;
  _proj.project(cam);
  if(_proj.z>1) return null;
  return{ x:(_proj.x*0.5+0.5)*innerWidth, y:(-_proj.y*0.5+0.5)*innerHeight };
}

function projectTags(){
  if(!model||!labelsOn) return;
  BEARINGS.forEach(b=>{
    const el=tels[b.id], pos=getScreenPos(b);
    if(!el) return;
    if(!pos){ el.style.display="none"; return; }
    el.style.display="flex";
    el.style.left=pos.x+"px";
    el.style.top=pos.y+"px";
  });
}

/* ============================================================
   CSV + SENSOR LOOKUP
   ============================================================ */
function parseCSV(text){
  const rows=[];
  let row=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],nx=text[i+1];
    if(ch==='"'){if(quoted&&nx==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(ch===","&&!quoted){row.push(cell);cell="";}
    else if((ch==="\n"||ch==="\r")&&!quoted){
      if(ch==="\r"&&nx==="\n")i++;
      row.push(cell);cell="";
      if(row.some(v=>v.trim())) rows.push(row);
      row=[];
    }else cell+=ch;
  }
  row.push(cell);
  if(row.some(v=>v.trim())) rows.push(row);
  return rows;
}
function cleanKey(v){ return String(v??"").replace(/^\uFEFF/,"").trim().replace(/^"(.*)"$/,"$1").trim(); }
function sensorKey(v){ return cleanKey(v).toUpperCase().replace(/[‐‑‒–—−]/g,"-").replace(/\s+/g," ").trim(); }
function parseValue(v){
  const s=cleanKey(v);
  if(!s||/N\/A|NA|NULL|NONE/i.test(s)) return null;
  const n=parseFloat(s.replace(/,/g,""));
  return Number.isFinite(n)?n:null;
}
function getSensorFrom(src,name){
  if(!name||!src) return null;
  if(Object.prototype.hasOwnProperty.call(src,name)) return src[name];
  const k=sensorKey(name);
  if(Object.prototype.hasOwnProperty.call(src,k)) return src[k];
  const lo=k.toLowerCase();
  for(const key of Object.keys(src)){
    if(sensorKey(key).toLowerCase()===lo) return src[key];
  }
  return null;
}

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
/* ============================================================
   VALUE HELPERS
   ============================================================ */
function vc(v,w,a){ if(v==null) return"dim"; if(v>a) return"alert"; if(v>w) return"warn"; return"ok"; }
function setVal(id,v,w=TW,a=TA){
  const el=document.getElementById(id);
  if(!el) return;
  el.textContent=(v!=null&&Number.isFinite(v))?v.toFixed(1):"—";
  el.className="tv "+(v!=null?vc(v,w,a):"dim");
}

/* ============================================================
   UPDATE ALL PANELS
   ============================================================ */
function updateAllPanels(){
  const src=frozen?frozenData:data;
  let alerts=0;

  BEARINGS.forEach(b=>{
    const vX=b.vX?getSensorFrom(src,b.vX):null;
    const vY=b.vY?getSensorFrom(src,b.vY):null;
    setVal(b.id+"_vX",vX,VW,VA);
    setVal(b.id+"_vY",vY,VW,VA);

    b.temps.forEach((t,i)=>{
      const v=t.key?getSensorFrom(src,t.key):null;
      setVal(b.id+"_t"+i,v);
    });

    const maxVib=Math.max(vX??0,vY??0);
    const maxTemp=Math.max(...b.temps.map(t=>t.key?getSensorFrom(src,t.key)??0:0));
    let state="ok";
    if(maxVib>VA||maxTemp>TA){state="alert";alerts++;}
    else if(maxVib>VW||maxTemp>TW) state="warn";
    tels[b.id].className="tag"+(b.below?" below":"")+" "+state;
  });

  MP.forEach(cfg=>{ const v=cfg.key?getSensorFrom(src,cfg.key):null; setVal(cfg.id,v); });

  const allVibs=BEARINGS
    .flatMap(b=>[b.vX?getSensorFrom(src,b.vX):null, b.vY?getSensorFrom(src,b.vY):null])
    .filter(v=>v!=null&&Number.isFinite(v));
  const maxVib=allVibs.length?Math.max(...allVibs):null;
  const thrF=getSensorFrom(src,"T THRUST BRG FRONT");

  const hA=document.getElementById("hA");
  hA.textContent=alerts||"✓"; hA.className=alerts>2?"alert":alerts?"warn":"ok";
  const hV=document.getElementById("hV");
  hV.textContent=maxVib!=null?maxVib.toFixed(1)+" µm":"—"; hV.className=maxVib!=null?vc(maxVib,VW,VA):"";
  const hT=document.getElementById("hT");
  hT.textContent=thrF!=null?thrF.toFixed(1)+"°C":"—"; hT.className=thrF!=null?vc(thrF,TW,TA):"";
}

/* ============================================================
   GLB — LOAD + NORMALIZE
   ============================================================ */
const loader=new GLTFLoader();

/* ============================================================
   COMPRESSED GLB SUPPORT
   Supports:
   - EXT_meshopt_compression
   - KHR_texture_basisu / KTX2 textures

   Required for the compressed turbine_nw(1).glb.
   ============================================================ */
loader.setMeshoptDecoder(MeshoptDecoder);

const ktx2Loader = new KTX2Loader()
  .setTranscoderPath("https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/basis/");

ktx2Loader.detectSupport(renderer);
loader.setKTX2Loader(ktx2Loader);

function normalizeModel(root){
  const box=new THREE.Box3().setFromObject(root);
  if(box.isEmpty()) throw new Error("Empty GLB");
  const sz=box.getSize(new THREE.Vector3());
  const s=6/Math.max(sz.x,sz.y,sz.z);
  root.scale.setScalar(s);
  const sb=new THREE.Box3().setFromObject(root);
  const sc=sb.getCenter(new THREE.Vector3());
  root.position.x-=sc.x; root.position.z-=sc.z; root.position.y-=sb.min.y;
}

function nname(s){ return String(s||"").toUpperCase().replace(/[\s_-]/g,""); }

/* ============================================================
   ANCHOR TAGS TO BEARING SURFACES
   Key fix: anchor point is placed ON the bearing ring surface
   (at shaft radius height), not inside or above the model.
   Fallback uses the shaft centerline at axFrac along X.
   ============================================================ */
function anchorTagsToMeshes(){
  if(!model) return;
  const invW=new THREE.Matrix4().copy(model.matrixWorld).invert();

  /* Build tight model-local bounding box from all geometry */
  const localBox=new THREE.Box3();
  model.traverse(c=>{
    if(!c.isMesh) return;
    const geo=c.geometry;
    if(!geo.boundingBox) geo.computeBoundingBox();
    const mb=geo.boundingBox.clone();
    mb.applyMatrix4(c.matrixWorld.clone().premultiply(invW));
    localBox.union(mb);
  });

  const lbSz =localBox.getSize(new THREE.Vector3());
  const lbCtr=localBox.getCenter(new THREE.Vector3());

  /* Auto-detect shaft axis = longest bounding box dimension (X or Z).
     Y is always vertical (above/below the shaft). */
  const shaftAxis = lbSz.x >= lbSz.z ? "x" : "z";
  const shaftLen  = shaftAxis === "x" ? lbSz.x : lbSz.z;
  const shaftMin  = shaftAxis === "x" ? localBox.min.x : localBox.min.z;
  console.log(`Shaft axis=${shaftAxis} len=${shaftLen.toFixed(2)} bbox x=${lbSz.x.toFixed(2)} y=${lbSz.y.toFixed(2)} z=${lbSz.z.toFixed(2)}`);

  /* Y offsets: above/below shaft at 30% of model height for clear separation */
  const shaftY    = lbCtr.y;
  const surfAbove = shaftY + lbSz.y * 0.30;
  const surfBelow = shaftY - lbSz.y * 0.05;

  /* Spread bearings along detected shaft axis using axFrac.
     Non-shaft horizontal axis stays at model centre (z or x). */
  BEARINGS.forEach(b=>{
    const along = shaftMin + shaftLen * b.axFrac;
    const y     = b.below ? surfBelow : surfAbove;
    if(shaftAxis === "x"){
      wpos[b.id].set(along, y, lbCtr.z);
    } else {
      wpos[b.id].set(lbCtr.x, y, along);
    }
    console.log(`${b.id} → ${shaftAxis}=${along.toFixed(3)} y=${y.toFixed(3)}`);
  });
}

function loadModel(){
  setStatus("Loading turbine.glb…",true);
  loader.load(MODEL_URL,
    gltf=>{
      try{
        if(model) scene.remove(model);
        model=gltf.scene;
        model.traverse(c=>{
          if(!c.isMesh) return;
          c.castShadow=c.receiveShadow=true;
          if(Array.isArray(c.material)) c.material=c.material.map(m=>m.clone());
          else if(c.material) c.material=c.material.clone();
        });
        console.group("=== GLB MESH NAMES — update b.mk to match ===");
        model.traverse(c=>{ if(c.isMesh) console.log("MESH:",c.name); });
        console.groupEnd();

        normalizeModel(model);
        scene.add(model);
        anchorTagsToMeshes();
        // loadSavedPositions() disabled — positions computed from model bounding box.
        // Re-enable only after using Edit Mode to manually place tags, then Save.
        colorMeshes();

        hint.style.display="none";
        document.getElementById("machine-panel").style.display="block";
        setStatus("Turbine loaded • live data connecting…",true);
        checkAR();
      }catch(err){ console.error(err); setStatus("Model error: "+err.message,true); }
    },
    xhr=>{ if(xhr.total) setStatus("Loading… "+Math.round(xhr.loaded/xhr.total*100)+"%",true); },
    err=>{
      console.error(err);
      hint.querySelector("h2").textContent="Cannot load 3D model";
      hint.querySelector("p").innerHTML="Ensure <b>turbine.glb</b> is in the same folder as index.html.";
      setStatus("GLB load failed",true);
    }
  );
}

/* ============================================================
   COLOR MESHES BY VIBRATION
   ============================================================ */
function colorMeshes(){
  if(!model) return;
  BEARINGS.forEach(b=>{
    const maxV=Math.max((b.vX?getSensorFrom(data,b.vX):null)??0,(b.vY?getSensorFrom(data,b.vY):null)??0);
    const col=new THREE.Color(maxV>VA?0xff3d3d:maxV>VW?0xffb300:0x00e676);
    model.traverse(c=>{
      if(!c.isMesh) return;
      const n=nname(c.name);
      if(!b.mk.some(k=>n.includes(nname(k)))) return;
      const mats=Array.isArray(c.material)?c.material:[c.material];
      mats.forEach(mat=>{ if(!mat) return; if(mat.color) mat.color.copy(col); if(mat.emissive){mat.emissive.copy(col);mat.emissiveIntensity=0.2;} });
    });
  });
}

/* ============================================================
   AR / WEBXR  — with pinch-zoom, rotate, drag gestures
   ============================================================ */
let xrSession=null, modelPlaced=false;
const reticle=new THREE.Mesh(new THREE.RingGeometry(0.06,0.09,32),new THREE.MeshBasicMaterial({color:0x00c8ff,side:THREE.DoubleSide}));
reticle.rotation.x=-Math.PI/2; reticle.visible=false; scene.add(reticle);

/* ── AR gesture state ── */
const arGesture = {
  touches: {},          // id → {x,y}
  lastDist: null,       // pinch distance
  lastAngle: null,      // twist angle
  lastMidX: null,       // pan midpoint
  lastMidY: null
};

function arTouchCount(){ return Object.keys(arGesture.touches).length; }

function arGetMid(){
  const pts=Object.values(arGesture.touches);
  return { x:(pts[0].x+pts[1].x)/2, y:(pts[0].y+pts[1].y)/2 };
}
function arGetDist(){
  const pts=Object.values(arGesture.touches);
  const dx=pts[1].x-pts[0].x, dy=pts[1].y-pts[0].y;
  return Math.sqrt(dx*dx+dy*dy);
}
function arGetAngle(){
  const pts=Object.values(arGesture.touches);
  return Math.atan2(pts[1].y-pts[0].y, pts[1].x-pts[0].x);
}

function onARTouchStart(e){
  if(!arMode||!modelPlaced) return;
  e.preventDefault();
  Array.from(e.changedTouches).forEach(t=>{ arGesture.touches[t.identifier]={x:t.clientX,y:t.clientY}; });

  if(arTouchCount()===2){
    arGesture.lastDist  = arGetDist();
    arGesture.lastAngle = arGetAngle();
    const mid=arGetMid();
    arGesture.lastMidX=mid.x; arGesture.lastMidY=mid.y;
  } else if(arTouchCount()===1){
    const pt=Object.values(arGesture.touches)[0];
    arGesture.lastMidX=pt.x; arGesture.lastMidY=pt.y;
  }
}

function onARTouchMove(e){
  if(!arMode||!modelPlaced||!model) return;
  e.preventDefault();
  Array.from(e.changedTouches).forEach(t=>{ arGesture.touches[t.identifier]={x:t.clientX,y:t.clientY}; });

  const n=arTouchCount();

  if(n===1){
    /* ── ONE FINGER: pan / drag model on floor plane ── */
    const pt=Object.values(arGesture.touches)[0];
    const dx=(pt.x-arGesture.lastMidX)/innerWidth;
    const dz=(pt.y-arGesture.lastMidY)/innerHeight;

    /* Move relative to camera's forward direction projected onto XZ */
    const xrCam=renderer.xr.getCamera(camera);
    const forward=new THREE.Vector3();
    xrCam.getWorldDirection(forward); forward.y=0; forward.normalize();
    const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();

    model.position.addScaledVector(right,   dx * 2.0);
    model.position.addScaledVector(forward, -dz * 2.0);

    arGesture.lastMidX=pt.x; arGesture.lastMidY=pt.y;

  } else if(n===2){
    /* ── TWO FINGERS: pinch = scale, twist = rotate ── */
    const dist  = arGetDist();
    const angle = arGetAngle();
    const mid   = arGetMid();

    /* Scale */
    if(arGesture.lastDist!==null){
      const scaleFactor = dist / arGesture.lastDist;
      const newScale = THREE.MathUtils.clamp(model.scale.x * scaleFactor, 0.1, 10);
      model.scale.setScalar(newScale);
    }

    /* Rotate around Y axis (twist gesture) */
    if(arGesture.lastAngle!==null){
      const dAngle = angle - arGesture.lastAngle;
      model.rotation.y += dAngle;
    }

    /* Pan with two-finger midpoint */
    if(arGesture.lastMidX!==null){
      const dx=(mid.x-arGesture.lastMidX)/innerWidth;
      const dz=(mid.y-arGesture.lastMidY)/innerHeight;
      const xrCam=renderer.xr.getCamera(camera);
      const forward=new THREE.Vector3();
      xrCam.getWorldDirection(forward); forward.y=0; forward.normalize();
      const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
      model.position.addScaledVector(right,   dx * 2.0);
      model.position.addScaledVector(forward, -dz * 2.0);
    }

    arGesture.lastDist  = dist;
    arGesture.lastAngle = angle;
    arGesture.lastMidX  = mid.x;
    arGesture.lastMidY  = mid.y;
  }
}

function onARTouchEnd(e){
  if(!arMode) return;
  Array.from(e.changedTouches).forEach(t=>{ delete arGesture.touches[t.identifier]; });

  /* Reset gesture baseline when fingers lift */
  arGesture.lastDist=null; arGesture.lastAngle=null;
  if(arTouchCount()===1){
    const pt=Object.values(arGesture.touches)[0];
    arGesture.lastMidX=pt.x; arGesture.lastMidY=pt.y;
  }
}

function attachARGestures(){
  /* Attach to the overlay root so gestures work over the canvas */
  document.body.addEventListener("touchstart", onARTouchStart, {passive:false});
  document.body.addEventListener("touchmove",  onARTouchMove,  {passive:false});
  document.body.addEventListener("touchend",   onARTouchEnd,   {passive:false});
  document.body.addEventListener("touchcancel",onARTouchEnd,   {passive:false});
}
function detachARGestures(){
  document.body.removeEventListener("touchstart", onARTouchStart);
  document.body.removeEventListener("touchmove",  onARTouchMove);
  document.body.removeEventListener("touchend",   onARTouchEnd);
  document.body.removeEventListener("touchcancel",onARTouchEnd);
}

function checkAR(){
  const btn=document.getElementById("bAR");
  if(!navigator.xr||!btn) return;
  navigator.xr.isSessionSupported("immersive-ar").then(ok=>{ if(ok) btn.style.display="block"; }).catch(()=>{});
}

async function startAR(){
  if(!model){alert("Still loading.");return;}
  if(!navigator.xr){alert("WebXR not available.");return;}
  try{
    if(!await navigator.xr.isSessionSupported("immersive-ar")) throw new Error("AR not supported.");
    const session=await navigator.xr.requestSession("immersive-ar",{
      requiredFeatures:["dom-overlay"],
      domOverlay:{root:document.body}
    });
    xrSession=session;
    renderer.xr.setReferenceSpaceType("local");
    await renderer.xr.setSession(session);
    arMode=true; modelPlaced=false;

    /* Reset gesture state */
    Object.keys(arGesture.touches).forEach(k=>delete arGesture.touches[k]);
    arGesture.lastDist=arGesture.lastAngle=arGesture.lastMidX=arGesture.lastMidY=null;

    scene.background=null; scene.fog=null;
    grid.visible=model.visible=false;
    ["bar","ctrls","machine-panel"].forEach(id=>document.getElementById(id).style.display="none");

    const arTap=document.getElementById("arTap"), arExit=document.getElementById("arExit");
    arTap.textContent="👆 TAP TO PLACE TURBINE";
    arTap.style.display=arExit.style.display="block";

    const place=()=>{
      if(modelPlaced||!model) return;
      const xrCam=renderer.xr.getCamera(camera);
      const dir=new THREE.Vector3();
      xrCam.getWorldDirection(dir); dir.y=0;
      if(dir.lengthSq()<0.0001) dir.set(0,0,-1); else dir.normalize();
      const pos=xrCam.position.clone().addScaledVector(dir,1.5);
      pos.y=0.03;
      model.position.copy(pos);
      model.scale.setScalar(1);   // reset scale on each placement
      model.rotation.y=0;
      model.visible=true;
      modelPlaced=true;
      arTap.style.display="none";

      /* Show gesture hint briefly */
      setStatus("1 finger: move • 2 fingers: pinch=zoom, twist=rotate",true);
      setTimeout(()=>setStatus("",false),3500);
    };

    arTap.onclick=place;
    session.addEventListener("select",place);
    session.addEventListener("end",()=>cleanupAR(false));
    document.getElementById("bAR").textContent="⏹ EXIT AR";

    attachARGestures();

  }catch(err){ console.error(err); cleanupAR(false); alert("AR failed: "+(err.message||"?")); }
}

function cleanupAR(end=true){
  arMode=false; modelPlaced=false;
  detachARGestures();

  if(end&&xrSession){try{xrSession.end();}catch(_){}}
  xrSession=null;

  scene.background=new THREE.Color(0x0a0d12);
  scene.fog=new THREE.FogExp2(0x0a0d12,0.03);
  grid.visible=true;
  if(model){ model.visible=true; model.position.set(0,0,0); model.scale.setScalar(1); model.rotation.y=0; }
  reticle.visible=false;

  document.getElementById("bAR").textContent="📷 START AR";
  ["arExit","arTap"].forEach(id=>document.getElementById(id).style.display="none");
  document.getElementById("bar").style.display="flex";
  document.getElementById("ctrls").style.display="flex";
  if(model) document.getElementById("machine-panel").style.display="block";
}

document.getElementById("bAR").onclick=()=>arMode?cleanupAR(true):startAR();
document.getElementById("arExit").onclick=()=>cleanupAR(true);

/* ============================================================
   RENDER LOOP
   ============================================================ */
renderer.setAnimationLoop(()=>{ renderer.render(scene,camera); if(labelsOn) projectTags(); });

/* ============================================================
   CONTROLS
   ============================================================ */
document.getElementById("bReset").onclick=()=>{ theta=0;phi=Math.PI/5;radius=9;updateCam(); };
document.getElementById("bLabel").onclick=e=>{
  labelsOn=!labelsOn;
  document.getElementById("ll").style.visibility=labelsOn?"visible":"hidden";
  if(model) document.getElementById("machine-panel").style.display=labelsOn?"block":"none";
  e.currentTarget.classList.toggle("active",labelsOn);
};
document.getElementById("bWire").onclick=e=>{
  wire=!wire;
  if(model) model.traverse(c=>{ if(!c.isMesh) return; (Array.isArray(c.material)?c.material:[c.material]).forEach(m=>{if(m)m.wireframe=wire;}); });
  e.currentTarget.classList.toggle("active",wire);
};

/* ============================================================
   SAVE / LOAD TAG POSITIONS
   ============================================================ */
const TAG_KEY="turbine_tag_v3", TAG_URL="./tag-positions.json";
function buildSaveObj(){ const o={_version:3}; BEARINGS.forEach(b=>{ if(wpos[b.id]) o[b.id]={x:wpos[b.id].x,y:wpos[b.id].y,z:wpos[b.id].z}; }); return o; }
function applyPositions(obj){
  if(!obj||typeof obj!=="object") return false; let ok=false;
  Object.keys(obj).forEach(id=>{ if(id==="_version"||!wpos[id]||!obj[id]) return; const x=+obj[id].x,y=+obj[id].y,z=+(obj[id].z??0); if(Number.isFinite(x)&&Number.isFinite(y)){wpos[id].set(x,y,z);ok=true;} });
  return ok;
}
function savePosLocal(){ try{localStorage.setItem(TAG_KEY,JSON.stringify(buildSaveObj()));}catch(_){} }
function loadSavedPositions(){
  try{ const loc=JSON.parse(localStorage.getItem(TAG_KEY)||"null"); if(loc&&loc._version===3&&applyPositions(loc)) return; }catch(_){}
  fetch(TAG_URL+"?t="+Date.now(),{cache:"no-store"}).then(r=>{ if(!r.ok) throw 0; return r.json(); }).then(applyPositions).catch(()=>{});
}
document.getElementById("bSave").onclick=()=>{
  savePosLocal();
  const blob=new Blob([JSON.stringify(buildSaveObj(),null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=Object.assign(document.createElement("a"),{href:url,download:"tag-positions.json"});
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  setStatus("Positions exported",true); setTimeout(()=>setStatus("",false),2000);
};

/* ============================================================
   EDIT MODE — drag tags in 3D
   ============================================================ */
let dragState=null;
const _dPlane=new THREE.Plane(),_dRay=new THREE.Raycaster(),_dHit=new THREE.Vector3(),_dInv=new THREE.Matrix4();

document.getElementById("bEdit").onclick=e=>{
  editMode=!editMode;
  document.body.classList.toggle("editmode",editMode);
  e.currentTarget.classList.toggle("active",editMode);
  if(!editMode) savePosLocal();
};
document.getElementById("ll").addEventListener("mousedown",e=>{
  if(!editMode||!model) return;
  const tag=e.target.closest(".tag"); if(!tag) return;
  const id=tag.id.replace("tg_",""); if(!wpos[id]) return;
  const wa=wpos[id].clone().applyMatrix4(model.matrixWorld);
  dragState={id,planeY:wa.y}; e.preventDefault(); e.stopPropagation();
});
window.addEventListener("mousemove",e=>{
  if(!dragState||!editMode||!model) return;
  const nx=(e.clientX/innerWidth)*2-1, ny=-(e.clientY/innerHeight)*2+1;
  _dRay.setFromCamera({x:nx,y:ny},camera);
  _dPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0,1,0),new THREE.Vector3(0,dragState.planeY,0));
  if(_dRay.ray.intersectPlane(_dPlane,_dHit)){ _dInv.copy(model.matrixWorld).invert(); _dHit.applyMatrix4(_dInv); wpos[dragState.id].x=_dHit.x; wpos[dragState.id].z=_dHit.z; }
});
window.addEventListener("mouseup",()=>{ if(!dragState) return; savePosLocal(); dragState=null; });

/* ============================================================
   FREEZE
   ============================================================ */
function updateFreezeBar(){
  const pill=document.getElementById("hFreeze"),btn=document.getElementById("bFreeze");
  if(!pill) return;
  if(frozen){ pill.innerHTML="❄ FROZEN <b style='color:#00c8ff'>"+new Date(frozenData._ts||Date.now()).toLocaleTimeString()+"</b>"; btn&&btn.classList.add("active"); }
  else{ pill.innerHTML="🔴 <b class='ok'>LIVE</b>"; btn&&btn.classList.remove("active"); }
}
document.getElementById("bFreeze").onclick=()=>{
  frozen=!frozen;
  if(frozen){ frozenData=Object.assign({},data,{_ts:Date.now()}); setStatus("❄ Frozen at "+new Date().toLocaleTimeString(),true); }
  else setStatus("▶ Resumed live data",true);
  updateAllPanels(); colorMeshes(); updateFreezeBar();
  setTimeout(()=>setStatus("",false),2000);
};

/* ============================================================
   INIT
   ============================================================ */
initTags();
fetchData();
setInterval(fetchData,REFRESH_MS);
loadModel();
console.log("Turbine Digital Twin v6 ready.");
