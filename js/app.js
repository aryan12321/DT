import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/GLTFLoader.js";

/* ============================================================
   TURBINE DIGITAL TWIN  v5
   7 bearing panels anchored to turbine + 1 fixed machine panel
   ============================================================ */

const MODEL_URL  = "./turbine.glb";
const SHEETS_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTGvHDpe6m7ycqjlbRf7FcWxogdy8gD0Km0dgfRLu_l_iSgOs5l0Emu8tGIICr5N8amuJsTLN4xPgm1/pub?gid=2032255384&single=true&output=csv";
const REFRESH_MS = 10000;

/* ── Thresholds ── */
const VW  = 75,  VA  = 100;   // vibration µm  warn / alert
const TW  = 80,  TA  = 90;    // bearing temp °C
const TTW = 80,  TTA = 90;    // thrust temp °C
const DEW = 12,  DEA = 15;    // differential expansion mm
const TPW = 0.3, TPA = 0.38;  // thrust position mm

/* ============================================================
   BEARING DEFINITIONS
   Sensor names match your Google Sheet column-A exactly.
   below:true  → card hangs below the shaft (stem points up)
   below:false → card floats above the shaft (stem points down)

   Physical layout  L→R:
     BRG-1(HPT) · BRG-2(HPT/IPT) · BRG-3(IPT) · BRG-4(LPT)
     · BRG-5(LPT-2/MKD11) · BRG-6(GEN DE/MKD21) · BRG-7(GEN NDE/MKD51)

   Alternating above/below avoids label overlap on a long shaft.
   ============================================================ */
const BEARINGS = [
  {
    id:"BRG1", label:"BRG-1", sec:"HPT", below:false,
    dp:[-2.8,1.6,0], axFrac:0.06,
    mk:["BRG1","BEARING1","BRG-1","MAD10","BRNG1"],
    vX:"BRG 1 VIB-X SHAFT REL",
    vY:"BRG 1 VIB-Y SHAFT REL",
    temps:[
      { label:"T RADIAL", key:"T METAL RADIAL BRG-1", warnV:TW, alertV:TA },
      { label:"T HPT RDL",key:"T RDL BRG HPT",        warnV:TW, alertV:TA }
    ]
  },
  {
    id:"BRG2", label:"BRG-2", sec:"HPT/IPT", below:true,
    dp:[-1.9,1.0,0], axFrac:0.21,
    mk:["BRG2","BEARING2","BRG-2","MAD21","BRNG2"],
    vX:"BRG-2 VIB-X SHAFT REL",
    vY:"BRG-2 VIB-Y SHAFT REL",
    temps:[
      { label:"T THRUST", key:"T METAL THRUST BRG-2", warnV:TTW, alertV:TTA }
    ]
  },
  {
    id:"BRG3", label:"BRG-3", sec:"IPT", below:false,
    dp:[-0.8,1.6,0], axFrac:0.36,
    mk:["BRG3","BEARING3","BRG-3","MAC10","BRNG3"],
    vX:"BRG-3 VIB-X SHAFT REL",
    vY:"BRG-3 VIB-Y SHAFT REL",
    temps:[
      { label:"T RADIAL", key:"T METAL RADIAL BRG-3", warnV:TW, alertV:TA }
    ]
  },
  {
    id:"BRG4", label:"BRG-4", sec:"LPT", below:true,
    dp:[0.3,1.0,0], axFrac:0.51,
    mk:["BRG4","BEARING4","BRG-4","MAC20","BRNG4"],
    vX:"BRG-4 VIB -X SHAFT REL",
    vY:"BRG-4 VIB -Y SHAFT REL",
    temps:[
      { label:"T RADIAL", key:"T METAL RADIAL BRG-4", warnV:TW, alertV:TA }
    ]
  },
  {
    id:"BRG5", label:"BRG-5", sec:"LPT-2", below:false,
    dp:[1.3,1.6,0], axFrac:0.64,
    mk:["BRG5","BEARING5","BRG-5","MKD11","BRNG5"],
    vX:"BRG-4 VIB -X SHAFT REL",  // MKD11 shares LPT sensor per your SCADA
    vY:"BRG-4 VIB -Y SHAFT REL",
    temps:[
      { label:"T LPT-1",  key:"T MTL RADIAL BRG LPT-1", warnV:TW, alertV:TA },
      { label:"T LPT-2",  key:"T MTL RADIAL BRG LPT-2", warnV:TW, alertV:TA }
    ]
  },
  {
    id:"BRG6", label:"BRG-6", sec:"GEN DE", below:true,
    dp:[2.1,1.0,0], axFrac:0.79,
    mk:["BRG6","BEARING6","BRG-6","MKD21","GENDE","BRNG6"],
    vX:"BRG-5 VIB-X SHAFT REL GEN DE",
    vY:"BRG-5 VIB-Y SHAFT REL GEN DE",
    temps:[
      { label:"T GEN DE",  key:"T MTL RADIAL BRG GEN DE",  warnV:TW, alertV:TA },
      { label:"T METAL-5", key:"T METAL RADIAL BRG-5",      warnV:TW, alertV:TA }
    ]
  },
  {
    id:"BRG7", label:"BRG-7", sec:"GEN NDE", below:false,
    dp:[2.9,1.6,0], axFrac:0.93,
    mk:["BRG7","BEARING7","BRG-7","MKD51","GENNDE","BRNG7"],
    vX:"BRG-5 VIB-X SHAFT REL GEN NDE",
    vY:"BRG-5 VIB-Y SHAFT REL GEN NDE",
    temps:[
      { label:"T GEN NDE", key:"T MTL RADIAL BRG GEN NDE", warnV:TW, alertV:TA },
      { label:"T METAL-6", key:"T METAL RADIAL BRG-6",      warnV:TW, alertV:TA }
    ]
  }
];

/* ============================================================
   MACHINE PANEL — fixed top-left HUD
   Thrust temps, thrust positions, expansion, load
   ============================================================ */
const MP = [
  { id:"mp_thrF",  label:"THR FRONT",   key:"T THRUST BRG FRONT",        unit:"°C",  warnV:TTW, alertV:TTA },
  { id:"mp_thrR",  label:"THR REAR",    key:"T THRUST BRG REAR",         unit:"°C",  warnV:TTW, alertV:TTA },
  { id:"mp_thrM",  label:"THR METAL",   key:"T MTL RDL BRG EXC ACT VAL",unit:"°C",  warnV:TTW, alertV:TTA },
  { id:"mp_tp1",   label:"THR POS-1",   key:"THRUST POS-1",              unit:"mm",  warnV:TPW, alertV:TPA },
  { id:"mp_tp2",   label:"THR POS-2",   key:"THRUST POS-2",              unit:"mm",  warnV:TPW, alertV:TPA },
  { id:"mp_tp3",   label:"THR POS-3",   key:"THRUST POS-3",              unit:"mm",  warnV:TPW, alertV:TPA },
  { id:"mp_tp23",  label:"POS 2/3 B2",  key:"THRUST POS 2O3 BRG 2",     unit:"mm",  warnV:TPW, alertV:TPA },
  { id:"mp_deHP",  label:"ΔExp HP",     key:"DIFF EXP HP TURB",          unit:"mm",  warnV:DEW, alertV:DEA },
  { id:"mp_deIP",  label:"ΔExp IP",     key:"DIFF EXP IP TURB",          unit:"mm",  warnV:DEW, alertV:DEA },
  { id:"mp_deLP1", label:"ΔExp LP1",    key:"DIFF EXP LP TURB1",         unit:"mm",  warnV:DEW, alertV:DEA },
  { id:"mp_deLP2", label:"ΔExp LP2",    key:"DIFF EXP LP TURB2",         unit:"mm",  warnV:DEW, alertV:DEA },
  { id:"mp_ecc",   label:"ECCENTR HPT", key:"ECCNTR HPT SHAFT",          unit:"µm",  warnV:12,  alertV:15  },
  { id:"mp_absIP", label:"ABS EXP IPT", key:"ABS EXPANSION IPT",         unit:"mm",  warnV:12,  alertV:15  },
  { id:"mp_load",  label:"LOAD",        key:"LOAD",                       unit:"MW",  warnV:500, alertV:650 }
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
function setStatus(msg, on=true){
  if(!statusEl) return;
  statusEl.textContent=msg;
  statusEl.style.display=on?"block":"none";
}

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

/* Lights */
scene.add(new THREE.HemisphereLight(0xcfe7ff,0x111722,2.2));
const sun=new THREE.DirectionalLight(0xffffff,2.5);
sun.position.set(6,10,6); sun.castShadow=true; scene.add(sun);
const fill=new THREE.DirectionalLight(0x4488ff,0.7);
fill.position.set(-6,3,-6); scene.add(fill);

/* Grid */
const grid=new THREE.GridHelper(30,60,0x1e2d45,0x111622);
scene.add(grid);

/* ============================================================
   CAMERA ORBIT
   ============================================================ */
let theta=0, phi=Math.PI/5, radius=9;
const target=new THREE.Vector3(0,1.8,0);
function updateCam(){
  camera.position.set(
    target.x+radius*Math.sin(phi)*Math.sin(theta),
    target.y+radius*Math.cos(phi),
    target.z+radius*Math.sin(phi)*Math.cos(theta)
  );
  camera.lookAt(target);
}
updateCam();

let isDragging=false, lastX=0, lastY=0;
canvas.addEventListener("mousedown",e=>{ if(arMode||editMode) return; isDragging=true; lastX=e.clientX; lastY=e.clientY; });
window.addEventListener("mouseup",()=>{ isDragging=false; });
window.addEventListener("mousemove",e=>{
  if(!isDragging||arMode||editMode) return;
  theta-=(e.clientX-lastX)*0.008;
  phi=THREE.MathUtils.clamp(phi+(e.clientY-lastY)*0.008,0.1,Math.PI*0.45);
  lastX=e.clientX; lastY=e.clientY; updateCam();
});
canvas.addEventListener("wheel",e=>{ if(arMode) return; radius=THREE.MathUtils.clamp(radius+e.deltaY*0.02,2,40); updateCam(); e.preventDefault(); },{passive:false});

let lastTouch=null;
canvas.addEventListener("touchstart",e=>{ if(!arMode&&e.touches.length===1) lastTouch=e.touches[0]; },{passive:true});
canvas.addEventListener("touchmove",e=>{
  if(arMode||e.touches.length!==1||!lastTouch) return;
  const t=e.touches[0];
  theta-=(t.clientX-lastTouch.clientX)*0.01;
  phi=THREE.MathUtils.clamp(phi+(t.clientY-lastTouch.clientY)*0.01,0.1,Math.PI*0.45);
  lastTouch=t; updateCam(); e.preventDefault();
},{passive:false});

window.addEventListener("resize",()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});

/* ============================================================
   BUILD BEARING TAG HTML
   Each card: VIB-X · VIB-Y · then temp row(s)
   ============================================================ */
function buildTagHTML(b){
  let rows=`
    <div class="tc-row">
      <span class="tl">VIB-X</span>
      <span><span class="tv" id="${b.id}_vX">—</span><span class="tu"> µm</span></span>
    </div>
    <div class="tc-row">
      <span class="tl">VIB-Y</span>
      <span><span class="tv" id="${b.id}_vY">—</span><span class="tu"> µm</span></span>
    </div>`;

  if(b.temps && b.temps.length){
    rows+=`<div class="tc-div"></div>`;
    b.temps.forEach((t,i)=>{
      rows+=`<div class="tc-row">
        <span class="tl">${t.label}</span>
        <span><span class="tv" id="${b.id}_t${i}">—</span><span class="tu"> °C</span></span>
      </div>`;
    });
  }

  return `
    <div class="tag-card">
      <div class="tc-head">
        <span class="tc-id">${b.label}</span>
        <span class="tc-sec">${b.sec}</span>
      </div>
      <div class="tc-rows">${rows}</div>
    </div>
    <div class="tag-line"></div>
    <div class="tag-dot"></div>`;
}

/* ============================================================
   BUILD MACHINE PANEL HTML (injected into #machine-panel)
   ============================================================ */
function buildMachinePanel(){
  const el=document.getElementById("machine-panel");
  if(!el) return;

  /* Group into sections */
  const sections=[
    { title:"THRUST",    ids:["mp_thrF","mp_thrR","mp_thrM","mp_tp1","mp_tp2","mp_tp3","mp_tp23"] },
    { title:"EXPANSION", ids:["mp_deHP","mp_deIP","mp_deLP1","mp_deLP2","mp_ecc","mp_absIP"] },
    { title:"LOAD",      ids:["mp_load"] }
  ];

  let html=`<div class="mp-title">⚙ MACHINE</div>`;

  sections.forEach(sec=>{
    html+=`<div class="mp-sec-head">${sec.title}</div>`;
    sec.ids.forEach(id=>{
      const cfg=MP.find(m=>m.id===id);
      if(!cfg) return;
      html+=`<div class="mp-row">
        <span class="tl">${cfg.label}</span>
        <span><span class="tv" id="${id}">—</span><span class="tu"> ${cfg.unit}</span></span>
      </div>`;
    });
  });

  el.innerHTML=html;
}

/* ============================================================
   INIT TAGS
   ============================================================ */
function initTags(){
  const ll=document.getElementById("ll");
  BEARINGS.forEach(b=>{
    wpos[b.id]=new THREE.Vector3(...b.dp);
    const el=document.createElement("div");
    el.className="tag"+(b.below?" below":"");
    el.id="tg_"+b.id;
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
   CSV + DATA
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
  if(!name) return null;
  if(Object.prototype.hasOwnProperty.call(src,name)) return src[name];
  const k=sensorKey(name);
  if(Object.prototype.hasOwnProperty.call(src,k)) return src[k];
  const lo=k.toLowerCase();
  for(const key of Object.keys(src)){
    if(sensorKey(key).toLowerCase()===lo) return src[key];
  }
  return null;
}

async function fetchData(){
  try{
    const r=await fetch(SHEETS_CSV+"&t="+Date.now(),{cache:"no-store"});
    if(!r.ok) throw new Error("HTTP "+r.status);
    const rows=parseCSV(await r.text());
    const next={};
    for(const row of rows){ const k=cleanKey(row[0]); if(k) next[k]=parseValue(row[1]); }
    data=next;
    if(!frozen){ updateAllPanels(); colorMeshes(); }
    document.getElementById("hR").textContent=Math.round(REFRESH_MS/1000)+"s";
    updateFreezeBar();
    if(!frozen){
      setStatus("LIVE • "+new Date().toLocaleTimeString(),true);
      setTimeout(()=>setStatus("",false),1800);
    }
  }catch(err){
    console.error(err);
    setStatus("Sheet error: "+err.message,true);
  }
}

/* ============================================================
   VALUE HELPERS
   ============================================================ */
function vc(v,w,a){ if(v==null) return"dim"; if(v>a) return"alert"; if(v>w) return"warn"; return"ok"; }

function setVal(id,v,w,a,dec=1){
  const el=document.getElementById(id);
  if(!el) return;
  el.textContent=(v!=null&&Number.isFinite(v))?v.toFixed(dec):"—";
  el.className="tv "+(v!=null?vc(v,w,a):"dim");
}

/* ============================================================
   UPDATE ALL PANELS
   ============================================================ */
function updateAllPanels(){
  const src=frozen?frozenData:data;
  let alerts=0;

  BEARINGS.forEach(b=>{
    const vX=getSensorFrom(src,b.vX);
    const vY=getSensorFrom(src,b.vY);
    setVal(b.id+"_vX",vX,VW,VA);
    setVal(b.id+"_vY",vY,VW,VA);

    if(b.temps){
      b.temps.forEach((t,i)=>{
        const v=getSensorFrom(src,t.key);
        setVal(b.id+"_t"+i,v,t.warnV,t.alertV);
      });
    }

    const maxVib=Math.max(vX??0,vY??0);
    const maxTemp=b.temps
      ? Math.max(...b.temps.map(t=>getSensorFrom(src,t.key)??0))
      : 0;

    let state="ok";
    if(maxVib>VA||maxTemp>TA){ state="alert"; alerts++; }
    else if(maxVib>VW||maxTemp>TW) state="warn";

    tels[b.id].className="tag"+(b.below?" below":"")+" "+state;
  });

  /* Machine panel */
  MP.forEach(cfg=>{ setVal(cfg.id,getSensorFrom(src,cfg.key),cfg.warnV,cfg.alertV); });

  /* Top bar */
  const allVibs=BEARINGS
    .flatMap(b=>[getSensorFrom(src,b.vX),getSensorFrom(src,b.vY)])
    .filter(v=>v!=null&&Number.isFinite(v));
  const maxVib=allVibs.length?Math.max(...allVibs):null;
  const thrF=getSensorFrom(src,"T THRUST BRG FRONT");

  const hA=document.getElementById("hA");
  hA.textContent=alerts||"✓";
  hA.className=alerts>2?"alert":alerts?"warn":"ok";

  const hV=document.getElementById("hV");
  hV.textContent=maxVib!=null?maxVib.toFixed(1)+" µm":"—";
  hV.className=maxVib!=null?vc(maxVib,VW,VA):"";

  const hT=document.getElementById("hT");
  hT.textContent=thrF!=null?thrF.toFixed(1)+"°C":"—";
  hT.className=thrF!=null?vc(thrF,TTW,TTA):"";
}

/* ============================================================
   GLB LOAD + NORMALIZE
   ============================================================ */
const loader=new GLTFLoader();

function normalizeModel(root){
  const box=new THREE.Box3().setFromObject(root);
  if(box.isEmpty()) throw new Error("Empty GLB");
  const sz=box.getSize(new THREE.Vector3());
  const s=6/Math.max(sz.x,sz.y,sz.z);
  root.scale.setScalar(s);
  const sb=new THREE.Box3().setFromObject(root);
  const sc=sb.getCenter(new THREE.Vector3());
  root.position.x-=sc.x;
  root.position.z-=sc.z;
  root.position.y-=sb.min.y;
}

function nname(s){ return String(s||"").toUpperCase().replace(/[\s_-]/g,""); }

/* ============================================================
   ANCHOR TAGS TO BEARING MESHES
   ============================================================ */
function anchorTagsToMeshes(){
  if(!model) return;
  const invW=new THREE.Matrix4().copy(model.matrixWorld).invert();

  /* Model-local bounding box */
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
  /* Y levels: above = upper-shaft area, below = lower-shaft area */
  const aboveY=lbCtr.y+lbSz.y*0.32;
  const belowY=lbCtr.y-lbSz.y*0.08;

  BEARINGS.forEach(b=>{
    let found=null;
    model.traverse(c=>{
      if(!c.isMesh||found) return;
      const n=nname(c.name);
      if(b.mk.some(k=>n.includes(nname(k)))) found=c;
    });

    if(found){
      const box=new THREE.Box3().setFromObject(found);
      const wp=box.getCenter(new THREE.Vector3());
      /* above: place above top of mesh; below: place below bottom */
      wp.y=b.below?box.min.y-0.12:box.max.y+0.18;
      wp.applyMatrix4(invW);
      wpos[b.id].copy(wp);
      console.log(`✓ ${b.id} → "${found.name}"`,wpos[b.id]);
    }else{
      const x=localBox.min.x+lbSz.x*b.axFrac;
      const y=b.below?belowY:aboveY;
      wpos[b.id].set(x,y,lbCtr.z);
      console.warn(`⚠ ${b.id} using proportional fallback at axFrac=${b.axFrac} — check MESH names above`);
    }
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

        /* Log mesh names for b.mk tuning */
        console.group("=== GLB MESH NAMES — update b.mk to match ===");
        model.traverse(c=>{ if(c.isMesh) console.log("MESH:",c.name); });
        console.groupEnd();

        normalizeModel(model);
        scene.add(model);
        anchorTagsToMeshes();
        loadSavedPositions();
        colorMeshes();

        hint.style.display="none";
        document.getElementById("machine-panel").style.display="block";
        setStatus("Turbine loaded • live data connecting…",true);
        checkAR();
      }catch(err){
        console.error(err);
        setStatus("Model error: "+err.message,true);
      }
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
   COLOR MESHES BY VIBRATION LEVEL
   ============================================================ */
function colorMeshes(){
  if(!model) return;
  BEARINGS.forEach(b=>{
    const maxV=Math.max(getSensorFrom(data,b.vX)??0,getSensorFrom(data,b.vY)??0);
    const col=new THREE.Color(maxV>VA?0xff3d3d:maxV>VW?0xffb300:0x00e676);
    model.traverse(c=>{
      if(!c.isMesh) return;
      const n=nname(c.name);
      if(!b.mk.some(k=>n.includes(nname(k)))) return;
      const mats=Array.isArray(c.material)?c.material:[c.material];
      mats.forEach(mat=>{ if(!mat) return; if(mat.color) mat.color.copy(col); if(mat.emissive){mat.emissive.copy(col);mat.emissiveIntensity=0.18;} });
    });
  });
}

/* ============================================================
   AR / WEBXR
   ============================================================ */
let xrSession=null, modelPlaced=false;
const reticle=new THREE.Mesh(
  new THREE.RingGeometry(0.06,0.09,32),
  new THREE.MeshBasicMaterial({color:0x00c8ff,side:THREE.DoubleSide})
);
reticle.rotation.x=-Math.PI/2; reticle.visible=false; scene.add(reticle);

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
    const session=await navigator.xr.requestSession("immersive-ar",{requiredFeatures:["dom-overlay"],domOverlay:{root:document.body}});
    xrSession=session;
    renderer.xr.setReferenceSpaceType("local");
    await renderer.xr.setSession(session);
    arMode=true; modelPlaced=false;
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
      model.position.copy(pos); model.visible=true; modelPlaced=true;
      arTap.style.display="none";
    };
    arTap.onclick=place;
    session.addEventListener("select",place);
    session.addEventListener("end",()=>cleanupAR(false));
    document.getElementById("bAR").textContent="⏹ EXIT AR";
  }catch(err){ console.error(err); cleanupAR(false); alert("AR failed: "+(err.message||"unknown")); }
}

function cleanupAR(end=true){
  arMode=false; modelPlaced=false;
  if(end&&xrSession){try{xrSession.end();}catch(_){}}
  xrSession=null;
  scene.background=new THREE.Color(0x0a0d12);
  scene.fog=new THREE.FogExp2(0x0a0d12,0.03);
  grid.visible=true;
  if(model){model.visible=true;model.position.set(0,0,0);}
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
renderer.setAnimationLoop(()=>{
  renderer.render(scene,camera);
  if(labelsOn) projectTags();
});

/* ============================================================
   CONTROLS
   ============================================================ */
document.getElementById("bReset").onclick=()=>{ theta=0; phi=Math.PI/5; radius=9; updateCam(); };

document.getElementById("bLabel").onclick=e=>{
  labelsOn=!labelsOn;
  document.getElementById("ll").style.visibility=labelsOn?"visible":"hidden";
  if(model) document.getElementById("machine-panel").style.display=labelsOn?"block":"none";
  e.currentTarget.classList.toggle("active",labelsOn);
};

document.getElementById("bWire").onclick=e=>{
  wire=!wire;
  if(model) model.traverse(c=>{
    if(!c.isMesh) return;
    (Array.isArray(c.material)?c.material:[c.material]).forEach(m=>{if(m) m.wireframe=wire;});
  });
  e.currentTarget.classList.toggle("active",wire);
};

/* ============================================================
   SAVE / LOAD TAG POSITIONS  (model-local XYZ, v3)
   ============================================================ */
const TAG_KEY="turbine_tag_v3";
const TAG_URL="./tag-positions.json";

function buildSaveObj(){
  const out={_version:3};
  BEARINGS.forEach(b=>{ if(wpos[b.id]) out[b.id]={x:wpos[b.id].x,y:wpos[b.id].y,z:wpos[b.id].z}; });
  return out;
}
function applyPositions(obj){
  if(!obj||typeof obj!=="object") return false;
  let ok=false;
  Object.keys(obj).forEach(id=>{
    if(id==="_version"||!wpos[id]||!obj[id]) return;
    const x=+obj[id].x, y=+obj[id].y, z=+(obj[id].z??0);
    if(Number.isFinite(x)&&Number.isFinite(y)){wpos[id].set(x,y,z);ok=true;}
  });
  return ok;
}
function savePosLocal(){ try{localStorage.setItem(TAG_KEY,JSON.stringify(buildSaveObj()));}catch(_){} }
function loadSavedPositions(){
  try{
    const loc=JSON.parse(localStorage.getItem(TAG_KEY)||"null");
    if(loc&&loc._version===3&&applyPositions(loc)) return;
  }catch(_){}
  fetch(TAG_URL+"?t="+Date.now(),{cache:"no-store"})
    .then(r=>{ if(!r.ok) throw 0; return r.json(); })
    .then(applyPositions).catch(()=>{});
}

document.getElementById("bSave").onclick=()=>{
  savePosLocal();
  const blob=new Blob([JSON.stringify(buildSaveObj(),null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=Object.assign(document.createElement("a"),{href:url,download:"tag-positions.json"});
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  setStatus("Positions exported — replace tag-positions.json in project folder",true);
  setTimeout(()=>setStatus("",false),2500);
};

/* ============================================================
   EDIT MODE — drag tags in 3D world space
   ============================================================ */
let dragState=null;
const _dPlane=new THREE.Plane(), _dRay=new THREE.Raycaster(), _dHit=new THREE.Vector3(), _dInv=new THREE.Matrix4();

document.getElementById("bEdit").onclick=e=>{
  editMode=!editMode;
  document.body.classList.toggle("editmode",editMode);
  e.currentTarget.classList.toggle("active",editMode);
  if(!editMode) savePosLocal();
};

document.getElementById("ll").addEventListener("mousedown",e=>{
  if(!editMode||!model) return;
  const tag=e.target.closest(".tag");
  if(!tag) return;
  const id=tag.id.replace("tg_","");
  if(!wpos[id]) return;
  const wa=wpos[id].clone().applyMatrix4(model.matrixWorld);
  dragState={id,planeY:wa.y};
  e.preventDefault(); e.stopPropagation();
});

window.addEventListener("mousemove",e=>{
  if(!dragState||!editMode||!model) return;
  const nx=(e.clientX/innerWidth)*2-1;
  const ny=-(e.clientY/innerHeight)*2+1;
  _dRay.setFromCamera({x:nx,y:ny},camera);
  _dPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0,1,0),new THREE.Vector3(0,dragState.planeY,0));
  if(_dRay.ray.intersectPlane(_dPlane,_dHit)){
    _dInv.copy(model.matrixWorld).invert();
    _dHit.applyMatrix4(_dInv);
    wpos[dragState.id].x=_dHit.x;
    wpos[dragState.id].z=_dHit.z;
  }
});

window.addEventListener("mouseup",()=>{ if(!dragState) return; savePosLocal(); dragState=null; });

/* ============================================================
   FREEZE
   ============================================================ */
function updateFreezeBar(){
  const pill=document.getElementById("hFreeze"), btn=document.getElementById("bFreeze");
  if(!pill) return;
  if(frozen){
    pill.innerHTML="❄ FROZEN <b style='color:#00c8ff'>"+new Date(frozenData._ts||Date.now()).toLocaleTimeString()+"</b>";
    btn&&btn.classList.add("active");
  }else{
    pill.innerHTML="🔴 <b class='ok'>LIVE</b>";
    btn&&btn.classList.remove("active");
  }
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

console.log("Turbine Digital Twin v5 ready.");
