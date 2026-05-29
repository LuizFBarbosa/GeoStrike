'use strict';
// ═══════════════════════════════════════════════════════════════
//  GeoStrike v2 — Client
//  FIXES: movimento sempre funciona, inimigos visíveis perto,
//         minimap grande e claro, sons de tensão, itens bônus
// ═══════════════════════════════════════════════════════════════

// ─── CORE STATE ────────────────────────────────────────────────
const G = {
  phase:1, score:0, kills:0, bonusCollected:0,
  hp:100, maxHp:100, ammo:30, maxAmmo:30, reloadDur:2200,
  enemies:[], missionItems:[], bonusItems:[], npc:null, extract:null, signs:[],
  collected:[], deadEnemies:[],
  theme:null, location:null, mapData:null,
  winItem:null, winCount:0,
  guessCorrect:false, phase_complete:false,
  bonusDmg:1, bonusSpd:1,
  powerUps:[],
  gpsActive:false,
};

// ─── THREE.JS ─────────────────────────────────────────────────
let scene, camera, renderer, controls;
let pointerLocked = false;
// ── BLIND MODE ────────────────────────────────────────────────
let blindModeEnabled = false;   // set from menu toggle
let blindModeActive  = false;   // true when blackout is running
let blindLastVoice   = 0;       // throttle TTS calls
let blindLastLightning = 0;     // throttle lightning flashes
let blindVoiceQueue  = [];      // queued speech utterances
let blindBeepNode    = null;    // proximity beep oscillator
const keys = {};
const vel = new THREE.Vector3();
let isJumping=false, jumpVy=0;
let bobT=0;
const ORIG_Y=1.7, CROUCH_Y=1.05;
let minimapCtx;
let dialogOpen=false;
let nearbyObj=null;
let lastStep=0, lastAI=0, lastTension=0;

// ─── AUDIO ENGINE ─────────────────────────────────────────────
let AC = null;
const SFX={};
// MUST be called only after a user gesture (click/keydown)
function getTone(){
  if(!AC){
    try{ AC=new(window.AudioContext||window.webkitAudioContext)(); }
    catch(e){ return null; }
  }
  if(AC && AC.state==='suspended') AC.resume().catch(()=>{});
  return AC;
}

// Procedural Sound Library
const soundLib = {
  shoot(c){
    const o=c.createOscillator(),g=c.createGain(),f=c.createBiquadFilter();
    f.type='bandpass';f.frequency.value=900;f.Q.value=.4;
    o.connect(f).connect(g).connect(c.destination);
    o.type='sawtooth';o.frequency.setValueAtTime(200,c.currentTime);o.frequency.exponentialRampToValueAtTime(65,c.currentTime+.12);
    g.gain.setValueAtTime(.35,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.15);
    o.start();o.stop(c.currentTime+.15);
  },
  hit(c){
    const o=c.createOscillator(),g=c.createGain();
    o.connect(g).connect(c.destination);o.type='square';o.frequency.value=480;
    g.gain.setValueAtTime(.14,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.07);
    o.start();o.stop(c.currentTime+.07);
  },
  hurt(c){
    const o=c.createOscillator(),g=c.createGain();
    o.connect(g).connect(c.destination);o.type='sawtooth';
    o.frequency.setValueAtTime(220,c.currentTime);o.frequency.exponentialRampToValueAtTime(80,c.currentTime+.3);
    g.gain.setValueAtTime(.42,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.35);
    o.start();o.stop(c.currentTime+.35);
  },
  pickup(c){
    [0,.1,.22].forEach((t,i)=>{
      const o=c.createOscillator(),g=c.createGain();
      o.connect(g).connect(c.destination);o.type='sine';o.frequency.value=440+i*220;
      g.gain.setValueAtTime(.2,c.currentTime+t);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+t+.1);
      o.start(c.currentTime+t);o.stop(c.currentTime+t+.12);
    });
  },
  pickup_bonus(c){
    const o=c.createOscillator(),g=c.createGain();
    o.connect(g).connect(c.destination);o.type='sine';
    o.frequency.setValueAtTime(600,c.currentTime);o.frequency.exponentialRampToValueAtTime(900,c.currentTime+.15);
    g.gain.setValueAtTime(.18,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.18);
    o.start();o.stop(c.currentTime+.18);
  },
  reload(c){
    [0,.18,.36].forEach((t,i)=>{
      const o=c.createOscillator(),g=c.createGain();
      o.connect(g).connect(c.destination);o.type='sine';o.frequency.value=300+i*180;
      g.gain.setValueAtTime(.12,c.currentTime+t);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+t+.1);
      o.start(c.currentTime+t);o.stop(c.currentTime+t+.12);
    });
  },
  complete(c){
    [0,.12,.25,.42,.6].forEach((t,i)=>{
      const o=c.createOscillator(),g=c.createGain();
      o.connect(g).connect(c.destination);o.type='sine';o.frequency.value=[440,550,660,770,880][i];
      g.gain.setValueAtTime(.22,c.currentTime+t);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+t+.15);
      o.start(c.currentTime+t);o.stop(c.currentTime+t+.18);
    });
  },
  step(c){
    const buf=c.createBuffer(1,~~(c.sampleRate*.07),c.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2.2)*.25;
    const s=c.createBufferSource(),g=c.createGain();
    s.buffer=buf;s.connect(g).connect(c.destination);g.gain.value=.15;s.start();s.stop(c.currentTime+.08);
  },
  // ── TENSION/AMBIENT SOUNDS ──────────────────────────────────
  // Heartbeat — slow pulse, tempo rises with danger
  heartbeat(c, bpm=60){
    const interval=60/bpm;
    [0, interval*.45].forEach(t=>{
      const o=c.createOscillator(),g=c.createGain();
      o.connect(g).connect(c.destination);o.type='sine';o.frequency.value=60;
      g.gain.setValueAtTime(0,c.currentTime+t);
      g.gain.linearRampToValueAtTime(.38,c.currentTime+t+.04);
      g.gain.exponentialRampToValueAtTime(.001,c.currentTime+t+.22);
      o.start(c.currentTime+t);o.stop(c.currentTime+t+.25);
    });
  },
  // Distant moan (zombie)
  moan(c){
    const o=c.createOscillator(),g=c.createGain(),f=c.createBiquadFilter();
    f.type='lowpass';f.frequency.value=400;
    o.connect(f).connect(g).connect(c.destination);
    o.type='sawtooth';
    o.frequency.setValueAtTime(90+Math.random()*30,c.currentTime);
    o.frequency.setValueAtTime(70+Math.random()*20,c.currentTime+.4);
    o.frequency.setValueAtTime(80+Math.random()*25,c.currentTime+.8);
    g.gain.setValueAtTime(0,c.currentTime);
    g.gain.linearRampToValueAtTime(.12+Math.random()*.08,c.currentTime+.3);
    g.gain.exponentialRampToValueAtTime(.001,c.currentTime+1.2);
    o.start();o.stop(c.currentTime+1.3);
  },
  // Whisper / ghost
  whisper(c){
    const buf=c.createBuffer(1,~~(c.sampleRate*1.5),c.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(Math.sin(i/d.length*Math.PI),.5)*.06;
    const s=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter();
    f.type='bandpass';f.frequency.value=1200;f.Q.value=2;
    s.buffer=buf;s.connect(f).connect(g).connect(c.destination);
    g.gain.value=.4;s.start();s.stop(c.currentTime+1.6);
  },
  // Wind
  wind(c){
    const buf=c.createBuffer(1,~~(c.sampleRate*2),c.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(Math.sin(i/d.length*Math.PI),.3)*.12;
    const s=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter();
    f.type='lowpass';f.frequency.value=600;
    s.buffer=buf;s.connect(f).connect(g).connect(c.destination);
    g.gain.value=.25;s.start();s.stop(c.currentTime+2.1);
  },
  // Creak (horror)
  creak(c){
    const o=c.createOscillator(),g=c.createGain();
    o.connect(g).connect(c.destination);o.type='sawtooth';
    o.frequency.setValueAtTime(180,c.currentTime);o.frequency.linearRampToValueAtTime(120,c.currentTime+.6);
    g.gain.setValueAtTime(.08,c.currentTime);g.gain.setValueAtTime(.12,c.currentTime+.1);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.7);
    o.start();o.stop(c.currentTime+.72);
  },
  // Enemy nearby alert
  alert_near(c){
    const o=c.createOscillator(),g=c.createGain();
    o.connect(g).connect(c.destination);o.type='square';
    o.frequency.setValueAtTime(320,c.currentTime);o.frequency.setValueAtTime(280,c.currentTime+.08);
    g.gain.setValueAtTime(.08,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.18);
    o.start();o.stop(c.currentTime+.2);
  },
  // Distant explosion (war)
  distant_boom(c){
    const buf=c.createBuffer(1,~~(c.sampleRate*.6),c.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,1.5);
    const s=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter();
    f.type='lowpass';f.frequency.value=300;
    s.buffer=buf;s.connect(f).connect(g).connect(c.destination);
    g.gain.setValueAtTime(.15,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.6);
    s.start();s.stop(c.currentTime+.65);
  },
  // Dramatic sting (found item)
  sting(c){
    [0,.1,.2].forEach((t,i)=>{
      const o=c.createOscillator(),g=c.createGain();
      o.connect(g).connect(c.destination);o.type='triangle';o.frequency.value=[200,160,240][i];
      g.gain.setValueAtTime(.15,c.currentTime+t);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+t+.15);
      o.start(c.currentTime+t);o.stop(c.currentTime+t+.18);
    });
  },
};

function play(name, ...args){
  try{
    const ctx=getTone();
    if(!ctx) return;
    soundLib[name]?.(ctx, ...args);
  }catch(e){}
}

// ─── TENSION SYSTEM ────────────────────────────────────────────
let tensionLevel = 0; // 0=calm, 1=alert, 2=danger, 3=critical
let tensionHeartT = 0;
const TENSION_THEMES = {
  apocalypse: ['moan','wind','creak'],
  thriller:   ['wind','creak'],
  horror:     ['whisper','creak','wind'],
  war:        ['distant_boom','wind'],
  mystery:    ['whisper','wind','creak'],
};

function updateTension(now, nearestEnemyDist){
  if(nearestEnemyDist < 5)       tensionLevel=3;
  else if(nearestEnemyDist < 12) tensionLevel=2;
  else if(nearestEnemyDist < 22) tensionLevel=1;
  else                            tensionLevel=Math.max(0,tensionLevel-.01);

  // Heartbeat at danger+
  if(tensionLevel>=2){
    const bpm = tensionLevel===3?110:75;
    const interval = 60000/bpm;
    if(now-tensionHeartT > interval){
      tensionHeartT=now;
      play('heartbeat', bpm);
    }
    // HP warning flash at critical
    if(tensionLevel===3&&G.hp<40&&now%1000<50){
      document.getElementById('dmg-overlay').style.opacity='.12';
      setTimeout(()=>document.getElementById('dmg-overlay').style.opacity='0',80);
    }
  }

  // Ambient sounds at random intervals — only if AudioContext is available
  if(AC && AC.state==='running' && now-lastTension > 4000+Math.random()*6000){
    lastTension=now;
    const themeId=G.theme?.id||'apocalypse';
    const sounds=TENSION_THEMES[themeId]||['wind'];
    const s=sounds[Math.floor(Math.random()*sounds.length)];
    play(s);
    if(tensionLevel>=2) setTimeout(()=>play('alert_near'),200+Math.random()*400);
  }

  // HUD tension color
  const vt=document.getElementById('vitals');
  if(vt){
    vt.style.borderColor=tensionLevel===3?'rgba(255,30,30,.6)':tensionLevel===2?'rgba(255,100,0,.4)':'rgba(255,255,255,.1)';
    vt.style.boxShadow=tensionLevel===3?'0 0 20px rgba(255,0,0,.3)':tensionLevel===2?'0 0 12px rgba(255,100,0,.2)':'none';
  }
}

// ─── PARTICLES ────────────────────────────────────────────────
const PP=[];
const gP=()=>{const m=PP.length?PP.pop():new THREE.Mesh(new THREE.SphereGeometry(.07,4,4),new THREE.MeshBasicMaterial({transparent:true}));m.userData.vel=m.userData.vel||new THREE.Vector3();return m;};
const rP=p=>PP.push(p);
function burst(pos,color,n,sp,grav=.014){
  const g=new THREE.Group();scene.add(g);
  for(let i=0;i<n;i++){const p=gP();p.material.color.setHex(color);p.material.opacity=1;p.userData.life=1;p.position.copy(pos);p.userData.vel.set((Math.random()-.5)*sp,Math.random()*sp*.85,(Math.random()-.5)*sp);g.add(p);}
  let f=0;const t=()=>{let a=false;g.children.forEach(p=>{if(p.userData.life<=0)return;p.position.add(p.userData.vel);p.userData.vel.y-=grav;p.userData.life-=.044;p.material.opacity=Math.max(0,p.userData.life);if(p.userData.life>0)a=true;});if(a&&++f<70)requestAnimationFrame(t);else{g.children.forEach(rP);g.clear();scene.remove(g);}};
  requestAnimationFrame(t);
}

// ─── SCENE INIT ───────────────────────────────────────────────
const GC={},MC={};
const geo=(k,fn)=>GC[k]||(GC[k]=fn());
const mat=(k,fn)=>MC[k]||(MC[k]=fn());

function initScene(){
  scene=new THREE.Scene();
  scene.fog=new THREE.FogExp2(0x0d0800,.022);
  scene.background=new THREE.Color(0x0d0800);

  camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.05,250);
  camera.position.set(0,ORIG_Y,0);

  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setSize(innerWidth,innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.domElement.classList.add('renderer-canvas');
  document.getElementById('gc').appendChild(renderer.domElement);

  // PointerLockControls — attach to renderer.domElement for proper WASD+mouse
  controls=new THREE.PointerLockControls(camera,renderer.domElement);
  scene.add(controls.getObject());

  controls.addEventListener('lock',  ()=>{ pointerLocked=true;  document.getElementById('lock-hint').style.display='none'; });
  controls.addEventListener('unlock',()=>{ pointerLocked=false; if(!dialogOpen&&!G.phase_complete) document.getElementById('lock-hint').style.display='flex'; });

  // Click canvas to lock
  renderer.domElement.addEventListener('click',()=>{ if(!dialogOpen&&!G.phase_complete) controls.lock(); });

  buildLights();
  buildGround();
  setupMinimap();
  setupInput();
  gameLoop();
}

// ─── LIGHTS ──────────────────────────────────────────────────
const LT={};
function buildLights(){
  LT.ambient=new THREE.AmbientLight(0xff8833,1.1);scene.add(LT.ambient);
  LT.sun=new THREE.DirectionalLight(0xffaa44,1.2);LT.sun.position.set(50,100,50);LT.sun.castShadow=true;
  LT.sun.shadow.camera.near=.5;LT.sun.shadow.camera.far=250;
  LT.sun.shadow.camera.left=LT.sun.shadow.camera.bottom=-130;
  LT.sun.shadow.camera.right=LT.sun.shadow.camera.top=130;
  LT.sun.shadow.mapSize.set(1024,1024);LT.sun.shadow.bias=-.0005;
  scene.add(LT.sun);
  LT.hemi=new THREE.HemisphereLight(0x9999cc,0x443322,.6);scene.add(LT.hemi);
  LT.player=new THREE.PointLight(0xffffff,.4,15);LT.player.position.y=2;scene.add(LT.player);
}

function applyTheme(th){
  if(!th) return;
  scene.fog.color.setStyle(th.fog||'#2a1800');
  scene.fog.density=Math.min(th.fogDensity||.012, .018); // cap fog density for visibility
  scene.background.setStyle(th.sky||'#3d2800');
  LT.ambient.color.setStyle(th.ambient||'#ff8833');
  LT.ambient.intensity=Math.max(th.ambientInt||1.0, 0.9); // minimum brightness
  LT.sun.color.setStyle(th.sun||'#ffaa44');
  LT.sun.intensity=Math.max(th.sunInt||1.2, 0.8);
  LT.hemi.intensity=0.5; // always keep hemisphere light
  // Ground — very dark to maximize road contrast
  const GROUND_HEX={apocalypse:'#0e0a04',thriller:'#060610',horror:'#070008',war:'#0a0900',mystery:'#060012'};
  if(groundMesh) groundMesh.material.color.setStyle(GROUND_HEX[th.id]||'#080604');
  // Flashlight for horror
  if(th.id==='horror'){
    if(!LT.flashlight){LT.flashlight=new THREE.SpotLight(0xffffff,0,20,Math.PI/8,.3);camera.add(LT.flashlight);LT.flashlight.position.set(0,0,-1);LT.flashlight.target.position.set(0,0,-20);scene.add(LT.flashlight.target);}
    LT.flashlight.intensity=0;
    G.flashlightOn=false;
  }
}

let groundMesh;
function buildGround(){
  // Very dark ground so roads stand out clearly
  groundMesh=new THREE.Mesh(new THREE.PlaneGeometry(600,600),new THREE.MeshLambertMaterial({color:0x080604}));
  groundMesh.rotation.x=-Math.PI/2;groundMesh.receiveShadow=true;groundMesh.name='ground';scene.add(groundMesh);
}

// ─── MAP RENDERING ────────────────────────────────────────────
function clearMap(){
  const PREFIXES=['bld-','road-','water-','park-','item-','enemy-','npc-','sign-','extract-','tree-','rdot-'];
  PREFIXES.forEach(p=>{ scene.children.filter(c=>c.name?.startsWith(p)).forEach(o=>{o.traverse(c=>{if(c.isMesh){c.geometry?.dispose();if(Array.isArray(c.material))c.material.forEach(m=>m.dispose());else c.material?.dispose();}});scene.remove(o);}); });
}

const WALL_COLORS={
  apocalypse:[0x5a3c1e,0x4a3015,0x6a4422,0x503818],
  thriller:  [0x141428,0x0e0e22,0x1a1a32,0x12122a],
  horror:    [0x280038,0x1e0028,0x320045,0x220032],
  war:       [0x3a3620,0x2e2c18,0x464030,0x343020],
  mystery:   [0x200a42,0x180838,0x280c50,0x1c093e],
};

function renderMap(mapData, themeId){
  if(!mapData) return;
  const wc=WALL_COLORS[themeId]||WALL_COLORS.apocalypse;

  (mapData.roads||[]).forEach((r,i)=>renderRoad(r,i,themeId));
  (mapData.buildings||[]).forEach((b,i)=>{if(b.pts?.length>=3) renderBuilding(b,i,wc,themeId);});
  (mapData.waters||[]).forEach((w,i)=>renderWater(w,i));
  (mapData.parks||[]).forEach((p,i)=>renderPark(p,i,themeId));
}

// Ground colors — very dark to maximize road contrast
const GROUND_COLORS={
  apocalypse:0x0e0a04, thriller:0x060610, horror:0x070008,
  war:0x0a0900,        mystery:0x060012,
};
// Road surface colors — clearly lighter than ground
const ROAD_COLORS={
  apocalypse:'#4a4030', thriller:'#38384e', horror:'#301848',
  war:       '#464230', mystery:  '#2e1a58',
};
// Sidewalk/kerb colors — slightly lighter than road surface
const KERB_COLORS={
  apocalypse:'#5e5244', thriller:'#4a4a5e', horror:'#3e2258',
  war:       '#585442', mystery:  '#3a2268',
};

function renderRoad(road,idx,themeId){
  const pts=road.pts.filter(p=>p&&isFinite(p.x)&&isFinite(p.z));
  if(pts.length<2) return;
  const rc=ROAD_COLORS[themeId]||'#444';
  const kc=KERB_COLORS[themeId]||'#555';
  const roadW=Math.max(3.5, (road.w||2)*1.1);   // road surface
  const kerbW=roadW+1.6;                          // kerb / sidewalk (slightly wider)

  for(let i=0;i<pts.length-1;i++){
    const a=pts[i],b=pts[i+1];
    const dx=b.x-a.x,dz=b.z-a.z,len=Math.sqrt(dx*dx+dz*dz);
    if(len<0.2||len>80) continue;
    const cx=(a.x+b.x)/2, cz=(a.z+b.z)/2;
    const ang=-Math.atan2(dz,dx);

    // Kerb layer (bottom, slightly wider, lighter)
    const ks=new THREE.Mesh(
      new THREE.PlaneGeometry(len,kerbW),
      mat('km_'+themeId,()=>new THREE.MeshLambertMaterial({color:new THREE.Color(kc)}))
    );
    ks.rotation.x=-Math.PI/2; ks.position.set(cx,.015,cz); ks.rotation.y=ang;
    ks.receiveShadow=true; ks.name=`road-k-${idx}-${i}`; scene.add(ks);

    // Road surface (top, main color)
    const seg=new THREE.Mesh(
      new THREE.PlaneGeometry(len,roadW),
      mat('rm_'+themeId,()=>new THREE.MeshLambertMaterial({color:new THREE.Color(rc)}))
    );
    seg.rotation.x=-Math.PI/2; seg.position.set(cx,.025,cz); seg.rotation.y=ang;
    seg.receiveShadow=true; seg.name=`road-${idx}-${i}`; scene.add(seg);

    // Center line dashes on major roads (adds nav clarity)
    if((road.w||2)>=3 && i%3===0){
      const dl=new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(len*.4,3),.12),
        mat('cl_'+themeId,()=>new THREE.MeshBasicMaterial({color:new THREE.Color(kc).multiplyScalar(1.4)}))
      );
      dl.rotation.x=-Math.PI/2; dl.position.set(cx,.03,cz); dl.rotation.y=ang;
      dl.name=`road-cl-${idx}-${i}`; scene.add(dl);
    }
  }
  if(road.name&&road.pts.length){
    const m=road.pts[Math.floor(road.pts.length/2)];
    if(m&&Math.abs(m.x)<160&&Math.abs(m.z)<160) makeSign(m.x,m.z,road.name,'street');
  }
}

function renderBuilding(bld,idx,wc,themeId){
  const pts=bld.pts.filter(p=>p&&isFinite(p.x)&&isFinite(p.z));
  if(pts.length<3) return;
  const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length,cz=pts.reduce((s,p)=>s+p.z,0)/pts.length;
  if(Math.abs(cx)>180||Math.abs(cz)>180) return;
  const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x));
  const minZ=Math.min(...pts.map(p=>p.z)),maxZ=Math.max(...pts.map(p=>p.z));
  const bw=Math.min(maxX-minX,50),bd=Math.min(maxZ-minZ,50);
  if(bw<.5||bd<.5) return;
  const h=Math.min(bld.h||5,45);
  const color=wc[idx%wc.length];
  const mesh=new THREE.Mesh(
    new THREE.BoxGeometry(bw,h,bd),
    new THREE.MeshLambertMaterial({color})
  );
  mesh.position.set(cx,h/2,cz);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name=`bld-${idx}`;scene.add(mesh);
  // Roof cap
  const roof=new THREE.Mesh(new THREE.BoxGeometry(bw+.4,.3,bd+.4),mat('roofM',()=>new THREE.MeshLambertMaterial({color:0x222222})));
  roof.position.set(cx,h+.15,cz);roof.name=`bld-r-${idx}`;scene.add(roof);
  // Thriller/mystery: lit windows
  if((themeId==='thriller'||themeId==='mystery')&&h>5){
    for(let wy=2;wy<h-1;wy+=2.8){
      for(let wx=-bw*.35;wx<=bw*.35;wx+=2.5){
        if(Math.random()<.6){
          const win=new THREE.Mesh(geo('win',()=>new THREE.BoxGeometry(.7,.85,.05)),new THREE.MeshBasicMaterial({color:Math.random()<.35?0xffcc44:themeId==='mystery'?0x6600aa:0x001133}));
          win.position.set(cx+wx,wy,cz+bd/2+.03);win.name=`bld-w-${idx}-${wy}`;scene.add(win);
        }
      }
    }
  }
  // Horror: blood splatter effect (dark red patch)
  if(themeId==='horror'&&Math.random()<.35){
    const splat=new THREE.Mesh(new THREE.PlaneGeometry(bw*.3+Math.random()*bw*.2,bd*.3+Math.random()*bd*.2),mat('splatM',()=>new THREE.MeshBasicMaterial({color:0x330000})));
    splat.rotation.x=-Math.PI/2;splat.position.set(cx+(Math.random()-.5)*bw*.4,.05,cz+(Math.random()-.5)*bd*.4);
    splat.name=`bld-sp-${idx}`;scene.add(splat);
  }
  // Building name sign
  if(bld.name) makeSign(cx,cz+bd/2+.5,bld.name,'building');
}

function renderWater(w,idx){
  const pts=w.pts.filter(p=>p&&isFinite(p.x)&&isFinite(p.z));if(pts.length<3) return;
  const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length,cz=pts.reduce((s,p)=>s+p.z,0)/pts.length;
  const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x));
  const minZ=Math.min(...pts.map(p=>p.z)),maxZ=Math.max(...pts.map(p=>p.z));
  const wt=Math.min(maxX-minX,100),ht=Math.min(maxZ-minZ,100);if(wt<.5||ht<.5) return;
  const wm=new THREE.Mesh(new THREE.PlaneGeometry(wt,ht),mat('waterM',()=>new THREE.MeshLambertMaterial({color:0x001122,transparent:true,opacity:.75})));
  wm.rotation.x=-Math.PI/2;wm.position.set(cx,.18,cz);wm.name=`water-${idx}`;scene.add(wm);
}

function renderPark(park,idx,themeId){
  const pts=park.pts.filter(p=>p&&isFinite(p.x)&&isFinite(p.z));if(pts.length<3) return;
  const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length,cz=pts.reduce((s,p)=>s+p.z,0)/pts.length;
  if(Math.abs(cx)>180||Math.abs(cz)>180) return;
  const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x));
  const minZ=Math.min(...pts.map(p=>p.z)),maxZ=Math.max(...pts.map(p=>p.z));
  const pw=Math.min(maxX-minX,80),pd=Math.min(maxZ-minZ,80);if(pw<1||pd<1) return;
  const gc={apocalypse:0x0a0f04,thriller:0x04050f,horror:0x050008,war:0x080800,mystery:0x040010}[themeId]||0x060606;
  const gm=new THREE.Mesh(new THREE.PlaneGeometry(pw,pd),new THREE.MeshLambertMaterial({color:gc}));
  gm.rotation.x=-Math.PI/2;gm.position.set(cx,.04,cz);gm.receiveShadow=true;gm.name=`park-${idx}`;scene.add(gm);
  // Park border — thin lighter ring to show boundary
  const border=new THREE.Mesh(new THREE.PlaneGeometry(pw+1.5,pd+1.5),new THREE.MeshBasicMaterial({color:new THREE.Color(gc).multiplyScalar(2.2)}));
  border.rotation.x=-Math.PI/2;border.position.set(cx,.02,cz);border.name=`park-b-${idx}`;scene.add(border);
  const tc=Math.max(2,Math.floor(Math.min(pw,pd)/12));
  for(let i=0;i<tc;i++){
    const tx=cx+(Math.random()-.5)*pw*.8,tz=cz+(Math.random()-.5)*pd*.8;
    makeTree(tx,tz,`tree-p${idx}i${i}`,themeId);
  }
}

function makeTree(x,z,name,themeId){
  const g=new THREE.Group();g.name=name;
  const tc={apocalypse:0x3a2010,thriller:0x0a1a0a,horror:0x0a0f0a,war:0x1e1a0a,mystery:0x1a0830}[themeId]||0x3a2010;
  const lc={apocalypse:0x1a3a0a,thriller:0x0a2210,horror:0x040e04,war:0x1e2800,mystery:0x100530}[themeId]||0x1a3a0a;
  const trunk=new THREE.Mesh(geo('tk',()=>new THREE.CylinderGeometry(.22,.3,.7,7)),mat('tkM_'+themeId,()=>new THREE.MeshLambertMaterial({color:tc})));
  trunk.position.y=.35;trunk.castShadow=true;g.add(trunk);
  const h=3+Math.random()*4;
  [1.3,.9,.6].forEach((sc,i)=>{
    const lv=new THREE.Mesh(geo('lf',()=>new THREE.SphereGeometry(1,6,5)),new THREE.MeshLambertMaterial({color:new THREE.Color(lc).multiplyScalar(.8+i*.12)}));
    lv.scale.setScalar(1.1+Math.random()*.7);lv.position.y=h*.45+i*.7;lv.castShadow=true;g.add(lv);
  });
  g.position.set(x,0,z);scene.add(g);
}

function makeSign(x,z,text,type){
  if(!text||text.length>50||!isFinite(x)||!isFinite(z)) return;
  const post=new THREE.Mesh(geo('sPost',()=>new THREE.CylinderGeometry(.04,.04,.7,6)),mat('sPostM',()=>new THREE.MeshLambertMaterial({color:0x444444})));
  post.position.set(x,.35,z);post.name='sign-post-'+Math.random();scene.add(post);
  const w=Math.min(text.length*.15+.3,2.8);
  const brdColor=type==='street'?0x003300:type==='building'?0x220022:0x001122;
  const brd=new THREE.Mesh(new THREE.BoxGeometry(w,.35,.04),new THREE.MeshLambertMaterial({color:brdColor}));
  brd.position.set(x,.82,z);brd.name='sign-brd-'+Math.random();brd.userData={signText:text};scene.add(brd);
}

// ─── GAME OBJECTS ─────────────────────────────────────────────
const ITEM_CFG={
  // Mission items
  fuel:         {icon:'⛽',color:0xff6600,shape:'octahedron', label:'Combustível'},
  pendrive:     {icon:'💾',color:0x0088ff,shape:'box',        label:'Pen-drive'},
  crystal:      {icon:'💎',color:0xaa44ff,shape:'octahedron', label:'Cristal'},
  rescue_beacon:{icon:'🚨',color:0xff2222,shape:'cone',       label:'Baliza de Resgate'},
  artifact:     {icon:'🏺',color:0xffaa00,shape:'icosahedron',label:'Artefato'},
  // Bonus items
  medkit:       {icon:'❤️',color:0xff2244,shape:'box',         label:'Kit Médico',    pts:20},
  ammo_box:     {icon:'📦',color:0xffcc00,shape:'box',         label:'Munição',       pts:15},
  coin:         {icon:'💰',color:0xffd700,shape:'cylinder',    label:'Moeda',         pts:10},
  document:     {icon:'📄',color:0xdddddd,shape:'box',         label:'Documento',     pts:25},
  weapon_part:  {icon:'🔧',color:0x888888,shape:'box',         label:'Peça de Arma',  pts:30},
  map_piece:    {icon:'🗺️',color:0x00ddff,shape:'box',         label:'Fragmento',     pts:40},
  gps_device:   {icon:'📡',color:0x00ff99,shape:'octahedron',  label:'GPS',           pts:50},
};

const ENEMY_CFG={
  zombie:          {color:0x44bb44,h:2.2,spd:.038,sight:20,dmg:12,icon:'🧟',label:'Zumbi',       atk:1500},
  zombie_tank:     {color:0xcc3333,h:2.8,spd:.022,sight:16,dmg:28,icon:'🧟',label:'Zumbi Tanque',atk:2000},
  zombie_fast:     {color:0xdddd00,h:1.9,spd:.075,sight:25,dmg:8, icon:'🧟',label:'Zumbi Veloz', atk:900},
  guard:           {color:0x334455,h:2.0,spd:.045,sight:28,dmg:18,icon:'💂',label:'Guarda',       atk:1200},
  sniper_npc:      {color:0x223344,h:2.0,spd:.02, sight:40,dmg:35,icon:'🎯',label:'Atirador',     atk:2500},
  drone:           {color:0x335566,h:1.2,spd:.06, sight:32,dmg:12,icon:'🚁',label:'Drone',        atk:1000},
  ghost:           {color:0xaaaacc,h:2.2,spd:.032,sight:22,dmg:20,icon:'👻',label:'Fantasma',     atk:1800},
  shadow:          {color:0x333344,h:2.0,spd:.048,sight:18,dmg:16,icon:'🌑',label:'Sombra',       atk:1400},
  demon:           {color:0x880000,h:2.6,spd:.035,sight:25,dmg:32,icon:'😈',label:'Demônio',      atk:2000},
  golem:           {color:0x887766,h:2.8,spd:.022,sight:20,dmg:25,icon:'🗿',label:'Golem',        atk:2200},
  specter:         {color:0x6655aa,h:2.0,spd:.04, sight:22,dmg:18,icon:'💀',label:'Espectro',     atk:1600},
  soldier:         {color:0x556644,h:2.0,spd:.048,sight:30,dmg:20,icon:'💂',label:'Soldado',      atk:1200},
  commander:       {color:0xaa4400,h:2.2,spd:.03, sight:35,dmg:38,icon:'🎖️',label:'Comandante',  atk:2500},
  ancient_guardian:{color:0x886633,h:2.8,spd:.018,sight:25,dmg:30,icon:'⚔️',label:'Guardião',    atk:2800},
};

function buildItemMesh(item){
  const old=scene.getObjectByName('item-'+item.id);if(old) scene.remove(old);
  const cfg=ITEM_CFG[item.type]||{color:0xffffff,shape:'sphere',label:item.type};
  const g=new THREE.Group();g.name='item-'+item.id;g.userData={item,otype:'item'};
  let geo3;
  switch(cfg.shape){
    case 'octahedron': geo3=new THREE.OctahedronGeometry(.38);break;
    case 'cone':       geo3=new THREE.ConeGeometry(.28,.6,8);break;
    case 'icosahedron':geo3=new THREE.IcosahedronGeometry(.35);break;
    case 'cylinder':   geo3=new THREE.CylinderGeometry(.25,.25,.15,12);break;
    default:           geo3=new THREE.BoxGeometry(.45,.45,.45);
  }
  const mesh=new THREE.Mesh(geo3,new THREE.MeshLambertMaterial({color:cfg.color,emissive:new THREE.Color(cfg.color),emissiveIntensity:.35}));
  g.add(mesh);
  // Glow ring
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.55,.05,8,20),new THREE.MeshBasicMaterial({color:cfg.color}));
  ring.rotation.x=Math.PI/2;g.add(ring);
  // Vertical beam of light (visible from far) — GPS gets taller beam
  const beamH = item.type==='gps_device' ? 8 : 4;
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,beamH,6),new THREE.MeshBasicMaterial({color:cfg.color,transparent:true,opacity: item.type==='gps_device'?.45:.22}));
  beam.position.y=beamH/2;g.add(beam);
  const pl=new THREE.PointLight(cfg.color,.9,7);g.add(pl);
  g.position.set(item.x,.7,item.z);
  scene.add(g);
}

function buildEnemyMesh(en){
  const old=scene.getObjectByName('enemy-'+en.id);if(old) scene.remove(old);
  const cfg=ENEMY_CFG[en.type]||ENEMY_CFG.zombie;
  const g=new THREE.Group();g.name='enemy-'+en.id;
  g.userData={enemy:en,cfg,patrolIdx:0,attackT:0,floatPh:Math.random()*Math.PI*2};
  const ml=c=>new THREE.MeshLambertMaterial({color:c});

  const body=new THREE.Mesh(geo('enB',()=>new THREE.BoxGeometry(.5,1.25,.36)),ml(cfg.color));
  body.position.y=.62;body.castShadow=true;g.add(body);
  const isZombie=en.type.startsWith('zombie');
  const head=new THREE.Mesh(geo('enH',()=>new THREE.BoxGeometry(.38,.38,.38)),ml(isZombie?0x3a5a22:en.type==='demon'?0x660000:en.type==='ghost'||en.type==='specter'?0xaaaacc:0xffccaa));
  head.position.y=1.5;g.add(head);
  const ec=en.type==='ghost'||en.type==='specter'?0x8888ff:isZombie||en.type==='demon'||en.type==='shadow'?0xff2200:0x222222;
  [-0.1,0.1].forEach(xo=>{
    const eye=new THREE.Mesh(geo('enE',()=>new THREE.BoxGeometry(.09,.07,.05)),mat('eyeM',()=>new THREE.MeshBasicMaterial({color:ec})));
    eye.position.set(xo,1.52,.19);g.add(eye);
  });
  // Arms (zombie-like forward reach)
  if(isZombie||en.type==='ghost'||en.type==='demon'){
    const arm=new THREE.Mesh(geo('enA',()=>new THREE.BoxGeometry(.16,.75,.18)),ml(cfg.color));
    arm.position.set(-.38,.7,.28);arm.rotation.x=.7;arm.name='la';g.add(arm);
    const arm2=new THREE.Mesh(geo('enA',()=>new THREE.BoxGeometry(.16,.75,.18)),ml(cfg.color));
    arm2.position.set(.38,.7,.28);arm2.rotation.x=.7;arm2.name='ra';g.add(arm2);
  }
  if(['ghost','shadow','specter','ancient_guardian'].includes(en.type)){
    const gl=new THREE.PointLight(ec,.5,4);gl.position.set(0,1.5,.2);g.add(gl);
  }
  // Drone: floating box body
  if(en.type==='drone'){body.geometry=geo('droneGeo',()=>new THREE.BoxGeometry(.8,.28,.8));body.position.y=1.6;}
  // Commander: helmet
  if(en.type==='commander'){const helm=new THREE.Mesh(geo('cmdH',()=>new THREE.BoxGeometry(.42,.25,.42)),ml(0x884400));helm.position.y=1.68;g.add(helm);}
  // HP bar
  const hbg=new THREE.Mesh(geo('hbg',()=>new THREE.BoxGeometry(1,.12,.05)),mat('hbgM',()=>new THREE.MeshBasicMaterial({color:0x111111})));
  hbg.position.set(0,cfg.h+.4,0);g.add(hbg);
  const hb=new THREE.Mesh(geo('hbf',()=>new THREE.BoxGeometry(1,.12,.06)),new THREE.MeshBasicMaterial({color:0x00ff44}));
  hb.position.set(0,cfg.h+.4,.03);hb.name='hpbar';g.add(hb);
  // Glow on tank/commander
  if(en.type==='zombie_tank'||en.type==='commander'||en.type==='ancient_guardian'){
    const gl=new THREE.PointLight(cfg.color,.4,5);gl.position.y=1;g.add(gl);
  }
  g.position.set(en.x,0,en.z);
  scene.add(g);
}

function buildNPCMesh(npc){
  const old=scene.getObjectByName('npc-0');if(old) scene.remove(old);
  const g=new THREE.Group();g.name='npc-0';g.userData={npc,otype:'npc'};
  const ml=c=>new THREE.MeshLambertMaterial({color:c});
  const body=new THREE.Mesh(geo('npcB',()=>new THREE.BoxGeometry(.5,1.2,.32)),ml(0x2244aa));body.position.y=.6;body.castShadow=true;g.add(body);
  const head=new THREE.Mesh(geo('npcH',()=>new THREE.BoxGeometry(.38,.38,.38)),ml(0xffccaa));head.position.y=1.42;g.add(head);
  [-0.1,0.1].forEach(xo=>{const e=new THREE.Mesh(geo('enE',()=>new THREE.BoxGeometry(.09,.07,.05)),mat('npcEM',()=>new THREE.MeshBasicMaterial({color:0x4488ff})));e.position.set(xo,1.44,.19);g.add(e);});
  // "!" beacon above head
  const glow=new THREE.PointLight(0x00aaff,.9,6);glow.position.y=2.8;g.add(glow);
  const beacon=new THREE.Mesh(new THREE.SphereGeometry(.18,8,6),new THREE.MeshBasicMaterial({color:0x00aaff}));
  beacon.position.y=2.6;beacon.name='npcBeacon';g.add(beacon);
  g.position.set(npc.x,0,npc.z);scene.add(g);
}

function buildExtract(extract){
  const old=scene.getObjectByName('extract-zone');if(old) scene.remove(old);
  const g=new THREE.Group();g.name='extract-zone';g.userData={otype:'extract'};
  const pad=new THREE.Mesh(geo('exPad',()=>new THREE.CylinderGeometry(3,3,.12,16)),mat('exPadM',()=>new THREE.MeshLambertMaterial({color:0x333333})));g.add(pad);
  for(let i=0;i<8;i++){const ar=new THREE.Mesh(new THREE.BoxGeometry(.18,.06,.9),mat('exArrM',()=>new THREE.MeshBasicMaterial({color:0x555555})));ar.rotation.y=i*Math.PI/4;ar.position.set(Math.cos(i*Math.PI/4)*2.1,.07,Math.sin(i*Math.PI/4)*2.1);g.add(ar);}
  const lt=new THREE.PointLight(0x333333,.5,10);lt.name='exLight';g.add(lt);
  g.position.set(extract.x,.06,extract.z);scene.add(g);
}

function activateExtract(){
  G.extract.active=true;
  const obj=scene.getObjectByName('extract-zone');if(!obj) return;
  obj.traverse(c=>{if(c.isMesh&&c.material) c.material.color.setHex(0x00ff44);});
  const lt=obj.getObjectByName('exLight');if(lt){lt.color.setHex(0x00ff44);lt.intensity=2;}
  addEvent('🚨 PONTO DE EXTRAÇÃO ATIVO — chegue ao marcador verde!','#00ff88');
  play('sting');
  showBigNotif('🚨 EXTRAÇÃO ATIVADA!','#00ff88');
  // Spawn drone reinforcement wave
  spawnDroneWave(3);
  // Activate blind mode if player enabled it
  if(blindModeEnabled) activateBlindMode();
  // Refresh road dots to mark path to extract zone
  setTimeout(buildRoadDots, 300);
}

function spawnDroneWave(count){
  const pp=controls.getObject().position;
  for(let i=0;i<count;i++){
    const angle=(i/count)*Math.PI*2+Math.random();
    const dist=35+Math.random()*25;
    const id=`drone_r_${Date.now()}_${i}`;
    const en={id,type:'drone',x:pp.x+Math.cos(angle)*dist,z:pp.z+Math.sin(angle)*dist,
      hp:60,maxHp:60,alive:true,
      patrol:[{x:pp.x+Math.cos(angle+.5)*15,z:pp.z+Math.sin(angle+.5)*15},{x:pp.x+Math.cos(angle-.5)*15,z:pp.z+Math.sin(angle-.5)*15}],
      patrolIdx:0};
    G.enemies.push(en);
    buildEnemyMesh(en);
  }
  addEvent(`🚁 ${count} DRONES DE REFORÇO DETECTADOS!`,'#ff4444');
  showBigNotif(`🚁 REFORÇO INIMIGO!`,'#ff4444');
}

// ─── SPAWN ALL ────────────────────────────────────────────────
// Road walkability markers — subtle glowing dots every N meters on road segments
// Only placed on roads within radius of mission items so player knows where to walk
function buildRoadDots(){
  // Remove old dots
  scene.children.filter(c=>c.name?.startsWith('rdot-')).forEach(o=>scene.remove(o));

  const roads=(G.mapData?.roads)||[];
  const themeId=G.theme?.id||'apocalypse';
  const dotColor={
    apocalypse:0x6a5030, thriller:0x3a3a6a, horror:0x4a1a5a,
    war:0x5a5a30,        mystery:0x3a1a6a,
  }[themeId]||0x444444;

  // Only mark roads within 80m of any mission item or extract
  const targets=[...G.missionItems.map(i=>({x:i.x,z:i.z}))];
  if(G.extract) targets.push({x:G.extract.x,z:G.extract.z});

  const DOT_INTERVAL=6;  // place a dot every 6 meters along road
  const ROAD_RADIUS=80;  // only mark roads within this radius of a target
  let dotIdx=0;

  roads.forEach(r=>{
    const pts=(r.pts||[]).filter(p=>p&&isFinite(p.x)&&isFinite(p.z));
    if(pts.length<2) return;

    for(let i=0;i<pts.length-1;i++){
      const a=pts[i],b=pts[i+1];
      const dx=b.x-a.x, dz=b.z-a.z;
      const len=Math.sqrt(dx*dx+dz*dz);
      if(len<1||len>80) continue;

      // Check if this segment is near any target
      const mx=(a.x+b.x)/2, mz=(a.z+b.z)/2;
      const nearTarget=targets.some(t=>Math.hypot(t.x-mx,t.z-mz)<ROAD_RADIUS);
      if(!nearTarget) continue;

      // Place dots along the segment
      const steps=Math.max(1,Math.floor(len/DOT_INTERVAL));
      for(let s=0;s<steps;s++){
        const t=s/steps;
        const dx2=b.x-a.x, dz2=b.z-a.z;
        const px=a.x+dx2*t, pz=a.z+dz2*t;

        const dot=new THREE.Mesh(
          new THREE.CircleGeometry(0.18,6),
          new THREE.MeshBasicMaterial({color:dotColor, transparent:true, opacity:0.55})
        );
        dot.rotation.x=-Math.PI/2;
        dot.position.set(px,0.035,pz);
        dot.name=`rdot-${dotIdx++}`;
        scene.add(dot);

        if(dotIdx>1200) return; // cap total dots for performance
      }
    }
  });
}

function spawnAll(objects){
  if(!objects) return;
  const{playerSpawn,missionItems,bonusItems,enemies,npc,extract,signs}=objects;
  G.missionItems=missionItems||[];
  G.bonusItems=bonusItems||[];
  G.enemies=enemies||[];
  G.npc=npc||null;G.extract=extract||null;G.signs=signs||[];
  G.collected=[];G.deadEnemies=[];

  if(playerSpawn) controls.getObject().position.set(playerSpawn.x,ORIG_Y,playerSpawn.z);
  G.missionItems.forEach(i=>buildItemMesh(i));
  G.bonusItems.forEach(i=>buildItemMesh(i));
  G.enemies.forEach(e=>buildEnemyMesh(e));
  if(G.npc) buildNPCMesh(G.npc);

  // Road walkability markers — small glowing dots along road segments near mission items
  // Help player understand the navigable network at a glance
  buildRoadDots();
  if(G.extract) buildExtract(G.extract);
  signs.forEach((s,i)=>{if(s.text&&isFinite(s.x)&&isFinite(s.z)&&Math.abs(s.x)<160&&Math.abs(s.z)<160) makeSign(s.x,s.z,s.text,'osm');});

  updateHUD();updateInvUI();updateObjUI();
}

// ─── AI ───────────────────────────────────────────────────────
function runAI(now){
  if(now-lastAI<80) return; lastAI=now;
  const pp=controls.getObject().position;
  let nearestDist=999;

  G.enemies.forEach(en=>{
    if(!en.alive) return;
    const obj=scene.getObjectByName('enemy-'+en.id);if(!obj) return;
    const cfg=obj.userData.cfg;
    const dx=pp.x-obj.position.x,dz=pp.z-obj.position.z;
    const dist=Math.sqrt(dx*dx+dz*dz);
    if(dist<nearestDist) nearestDist=dist;

    if(dist<cfg.sight){
      // Chase
      obj.rotation.y=Math.atan2(dx,dz);
      if(dist>2&&en.type!=='sniper_npc'){
        const spd=cfg.spd*(1+G.phase*.04);
        const nx=obj.position.x+(dx/dist)*spd,nz=obj.position.z+(dz/dist)*spd;
        if(isFinite(nx)&&isFinite(nz)){obj.position.x=nx;obj.position.z=nz;en.x=nx;en.z=nz;}
      }
      // Attack
      if(dist<2.2&&now-obj.userData.attackT>cfg.atk){
        obj.userData.attackT=now;
        takeDamage(cfg.dmg);
        // Recoil flash on enemy
        obj.traverse(c=>{if(c.isMesh&&c.material?.color){const oc=c.material.color.getHex();c.material.color.setHex(0xffffff);setTimeout(()=>c.material.color.setHex(oc),80);}});
      }
    } else {
      // Patrol
      const patrol=en.patrol||[{x:en.x,z:en.z}];
      const pt=patrol[obj.userData.patrolIdx%patrol.length];
      const pdx=pt.x-obj.position.x,pdz=pt.z-obj.position.z,pd=Math.sqrt(pdx*pdx+pdz*pdz);
      if(pd<1.5) obj.userData.patrolIdx++;
      else{
        const spd=cfg.spd*.5;
        const nx=obj.position.x+(pdx/pd)*spd,nz=obj.position.z+(pdz/pd)*spd;
        if(isFinite(nx)&&isFinite(nz)){obj.position.x=nx;obj.position.z=nz;en.x=nx;en.z=nz;}
        obj.rotation.y=Math.atan2(pdx,pdz);
      }
    }
    // Drone float
    if(en.type==='drone') obj.position.y=1.5+Math.sin(now*.002+obj.userData.floatPh)*.3;
    // HP bar
    const hb=obj.getObjectByName('hpbar');
    if(hb){const p=Math.max(0,en.hp/en.maxHp);hb.scale.x=p;hb.position.x=-.5*(1-p);hb.material.color.setHex(p>.6?0x00ff44:p>.3?0xffcc00:0xff2200);}
  });

  updateTension(now, nearestDist);
}

// ─── INTERACTION ──────────────────────────────────────────────
const INTERACT_R=3.5;
function checkInteract(){
  const pp=controls.getObject().position;
  nearbyObj=null; let minD=INTERACT_R;

  // Extract always takes priority when active — check first, highest radius
  if(G.extract?.active){
    const o=scene.getObjectByName('extract-zone');if(o){
      const dx=pp.x-o.position.x,dz=pp.z-o.position.z,d=Math.sqrt(dx*dx+dz*dz);
      if(d<6){ nearbyObj={type:'extract',ref:G.extract,obj:o}; }
    }
  }

  // Only check items/NPC if not already at extract
  if(!nearbyObj){
    [...G.missionItems.filter(i=>!i.collected),...G.bonusItems.filter(i=>!i.collected)].forEach(item=>{
      const o=scene.getObjectByName('item-'+item.id);if(!o) return;
      const dx=pp.x-o.position.x,dz=pp.z-o.position.z,d=Math.sqrt(dx*dx+dz*dz);
      if(d<minD){minD=d;nearbyObj={type:'item',ref:item,obj:o};}
    });
    if(G.npc&&!G.npc.talked){
      const o=scene.getObjectByName('npc-0');if(o){
        const dx=pp.x-o.position.x,dz=pp.z-o.position.z,d=Math.sqrt(dx*dx+dz*dz);
        if(d<minD){minD=d;nearbyObj={type:'npc',ref:G.npc,obj:o};}
      }
    }
  }

  const pr=document.getElementById('interact-prompt');
  if(nearbyObj){
    pr.classList.remove('hidden');
    const lbl={
      item:`Pegar ${ITEM_CFG[nearbyObj.ref.type]?.icon||'📦'} ${ITEM_CFG[nearbyObj.ref.type]?.label||nearbyObj.ref.type}`,
      npc:'Falar com sobrevivente [E]',
      extract:'EXTRAIR — completar missão! [E]',
    };
    document.getElementById('interact-text').textContent=lbl[nearbyObj.type]||'Interagir';
  } else pr.classList.add('hidden');
}

function doInteract(){
  if(!nearbyObj) return;
  const{type,ref,obj}=nearbyObj;
  if(type==='item'){
    ref.collected=true;
    G.collected.push({type:ref.type,isMission:ref.isMission});
    scene.remove(obj);
    const cfg=ITEM_CFG[ref.type]||{};
    if(ref.isMission){
      play('pickup');
      addEvent(`${cfg.icon||'📦'} Coletou: ${cfg.label||ref.type}`,'#00ff88');
      burst(obj.position.clone(),cfg.color||0xffffff,14,.22);
      play('sting');
      updateInvUI();updateObjUI();checkWin();
    } else {
      play('pickup_bonus');
      const pts=ref.points||10;G.score+=pts;G.bonusCollected++;
      addEvent(`${cfg.icon||'💰'} +${pts}pts — ${cfg.label||ref.type}`,'#ffd700');
      burst(obj.position.clone(),cfg.color||0xffd700,8,.18);
      // Medkit heals
      if(ref.type==='medkit'){G.hp=Math.min(G.maxHp,G.hp+35);updateHUD();flashOverlay('heal-overlay');}
      // Ammo refills
      if(ref.type==='ammo_box'){G.ammo=G.maxAmmo;updateHUD();}
      // GPS activates route guidance
      if(ref.type==='gps_device'){
        G.gpsActive=true;
        showBigNotif('📡 GPS ATIVADO — Rota para objetivos no mapa!','#00ff99');
      }
      updateScoreUI();
    }
  }
  else if(type==='npc'&&!ref.talked){
    ref.talked=true;showNPCDialog(G.theme);
  }
  else if(type==='extract'&&G.extract?.active){
    completePhase();
  }
}

// ─── COMBAT ───────────────────────────────────────────────────
let lastShotT=0, shotCD=175, isReloading=false, reloadT=0;

function fire(){
  if(isReloading||G.ammo<=0||dialogOpen||G.phase_complete) return;
  const now=Date.now();if(now-lastShotT<shotCD) return;lastShotT=now;
  const origin=new THREE.Vector3(),dir=new THREE.Vector3();
  camera.getWorldPosition(origin);camera.getWorldDirection(dir);
  let hit=false;
  G.enemies.filter(e=>e.alive).forEach(en=>{
    if(hit) return;
    const obj=scene.getObjectByName('enemy-'+en.id);if(!obj) return;
    const dx=obj.position.x-origin.x,dz=obj.position.z-origin.z,dist=Math.sqrt(dx*dx+dz*dz);
    if(dist>85) return;
    const toEnemy=new THREE.Vector3(dx,0,dz).normalize();
    const dot=dir.dot(toEnemy);
    if(dot>.96&&dist<65){
      hit=true;
      const dmg=(18+Math.random()*12)*G.bonusDmg;
      en.hp-=dmg;
      play('hit');showHitMark();
      burst(obj.position.clone().add(new THREE.Vector3(0,1.2,0)),0xff4400,10,.22);
      obj.traverse(c=>{if(c.isMesh&&c.material?.emissive){c.material.emissive.setHex(0xff0000);setTimeout(()=>c.material.emissive?.setHex(0),140);}});
      if(en.hp<=0){
        en.alive=false;G.deadEnemies.push(en.id);G.kills++;
        const cfg=ENEMY_CFG[en.type]||{};
        scene.remove(obj);
        burst(obj.position.clone(),cfg.color||0xff2200,22,.38);
        addEvent(`${cfg.icon||'💀'} ${cfg.label||en.type} eliminado — +50pts`,en.type==='commander'?'#ff8800':'#ffcc00');
        G.score+=50;updateScoreUI();
        checkWin();
      }
    }
  });
  // Tracer
  const end=origin.clone().addScaledVector(dir,80);
  const ln=new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin,end]),new THREE.LineBasicMaterial({color:0xff9900,transparent:true,opacity:.75}));
  scene.add(ln);setTimeout(()=>scene.remove(ln),75);
  burst(origin.clone().addScaledVector(dir,.7),0xff8800,5,.13);
  const w=camera.getObjectByName('fps-weapon');
  if(w){w.position.z-=.12;w.rotation.x+=.04;setTimeout(()=>{w.position.z+=.12;w.rotation.x-=.04;},80);}
  play('shoot');G.ammo--;
  document.getElementById('xhair').classList.add('fire');setTimeout(()=>document.getElementById('xhair').classList.remove('fire'),90);
  updateHUD();if(G.ammo===0) startReload();
}

function takeDamage(dmg){
  if(G.phase_complete) return;
  G.hp=Math.max(0,G.hp-dmg);updateHUD();flashOverlay('dmg-overlay');play('hurt');shakeScreen();
  if(G.hp<=0) gameOver();
}

function startReload(){
  if(isReloading||G.ammo>=G.maxAmmo) return;
  isReloading=true;reloadT=Date.now();play('reload');
  document.getElementById('reload-bar-bg').classList.remove('hidden');
  const bar=document.getElementById('reload-bar');
  const upd=()=>{const p=Math.min(100,(Date.now()-reloadT)/G.reloadDur*100);bar.style.width=p+'%';if(p<100)requestAnimationFrame(upd);else{G.ammo=G.maxAmmo;isReloading=false;document.getElementById('reload-bar-bg').classList.add('hidden');bar.style.width='0';updateHUD();}};
  requestAnimationFrame(upd);
}

// ─── WIN CHECK ────────────────────────────────────────────────
function checkWin(){
  const wt=G.winItem,wc=G.winCount;
  const done=G.collected.filter(c=>c.type===wt&&c.isMission).length;
  // Also check commander kill for war
  if(G.theme?.id==='war'){
    const cmdDead=G.deadEnemies.some(id=>G.enemies.find(e=>e.id===id)?.type==='commander');
    if(cmdDead&&done>=Math.max(0,wc-1)&&!G.extract?.active) activateExtract();
  } else if(done>=wc&&!G.extract?.active){
    activateExtract();
  }
}

function completePhase(){
  if(G.phase_complete) return;
  G.phase_complete=true;play('complete');
  deactivateBlindMode();
  if(controls.isLocked) controls.unlock();
  showComplete();
}

function gameOver(){
  G.phase_complete=true; // prevent further damage/update logic
  deactivateBlindMode();
  window.speechSynthesis?.cancel();
  if(controls.isLocked) controls.unlock();
  // Small delay so deactivateBlindMode fade has time to begin, then force overlay off
  setTimeout(()=>{
    document.getElementById('blind-overlay').classList.remove('active');
    document.getElementById('blind-overlay').style.transition='none';
    document.getElementById('blind-overlay').style.opacity='0';
    setTimeout(()=>{ document.getElementById('blind-overlay').style.transition=''; }, 100);
  }, 100);
  document.getElementById('go-phase').textContent=`Fase ${G.phase} — ${G.theme?.name||''}`;
  document.getElementById('go-stats').innerHTML=
    `<div class="stat-row"><span>Score</span><span>${G.score}</span></div>`+
    `<div class="stat-row"><span>Kills</span><span>${G.kills}</span></div>`+
    `<div class="stat-row"><span>Bônus coletados</span><span>${G.bonusCollected}</span></div>`;
  document.getElementById('gameover-screen').classList.remove('hidden');
  document.getElementById('btn-retry').onclick=()=>{
    document.getElementById('gameover-screen').classList.add('hidden');
    G.phase_complete=false;
    startPhase(G.phase);
  };
  document.getElementById('btn-menu').onclick=()=>location.reload();
}

// ─── GUESS ────────────────────────────────────────────────────
function saveRecord(phase, score, city, country){
  try{
    const records=JSON.parse(localStorage.getItem('geostrike_records')||'[]');
    records.push({phase, score, city:city||'?', country:country||'?', date:new Date().toLocaleDateString('pt-BR')});
    records.sort((a,b)=>b.score-a.score);
    records.splice(10);
    localStorage.setItem('geostrike_records',JSON.stringify(records));
  }catch(e){}
}

function getRecordsHTML(){
  try{
    const records=JSON.parse(localStorage.getItem('geostrike_records')||'[]');
    if(!records.length) return '<div class="stat-row"><span style="color:#888">Nenhum recorde ainda</span></div>';
    return records.slice(0,3).map((r,i)=>
      `<div class="stat-row"><span>${['🥇','🥈','🥉'][i]} Fase ${r.phase} — ${r.city}</span><span>${r.score} pts</span></div>`
    ).join('');
  }catch(e){ return ''; }
}

function showComplete(){
  const scoreGain=G.kills*50+G.collected.filter(c=>c.isMission).length*40+G.bonusCollected*15;
  G.score+=scoreGain;
  saveRecord(G.phase, G.score, G.location?.city, G.location?.country);
  document.getElementById('complete-emoji').textContent=G.theme?.emoji||'🏆';
  document.getElementById('complete-title').textContent=G.theme?.name+' Completo!';
  document.getElementById('complete-stats').innerHTML=
    `<div class="stat-row"><span>Kills</span><span>${G.kills}</span></div>`+
    `<div class="stat-row"><span>Itens missão</span><span>${G.collected.filter(c=>c.isMission).length}</span></div>`+
    `<div class="stat-row"><span>Bônus coletados</span><span>${G.bonusCollected}</span></div>`+
    `<div class="stat-row"><span>Score esta fase</span><span>+${scoreGain}</span></div>`+
    `<div class="stat-row"><span>Score total</span><span>${G.score}</span></div>`+
    `<div class="stat-row" style="margin-top:10px;border-top:1px solid rgba(255,255,255,.15);padding-top:8px;color:var(--green);font-weight:bold"><span>🏆 Top Recordes</span></div>`+
    getRecordsHTML();
  document.getElementById('complete-location').textContent=`📍 Você estava em ${G.location?.city}, ${G.location?.country}`;
  // Random power-up each phase completion
  const powers=[{l:'⚔️ Dano Duplo',f:()=>G.bonusDmg=2},{l:'❤️ +60 HP',f:()=>{G.maxHp+=60;G.hp=G.maxHp;}},{l:'💨 Velocidade +50%',f:()=>G.bonusSpd=1.5},{l:'🔫 Munição Dupla',f:()=>G.maxAmmo*=2}];
  const pw=powers[Math.floor(Math.random()*powers.length)];pw.f();
  document.getElementById('bonus-power-display').classList.remove('hidden');
  document.getElementById('bonus-power-display').textContent='🌟 PODER: '+pw.l;
  document.getElementById('phase-complete').classList.remove('hidden');
  document.getElementById('btn-next-phase').onclick=()=>{document.getElementById('phase-complete').classList.add('hidden');G.phase++;startPhase(G.phase);};
}

// ─── FPS WEAPON ───────────────────────────────────────────────
function buildWeapon(){
  const old=camera.getObjectByName('fps-weapon');if(old) camera.remove(old);
  const g=new THREE.Group();g.name='fps-weapon';
  const dm=c=>new THREE.MeshLambertMaterial({color:c});
  const body=new THREE.Mesh(new THREE.BoxGeometry(.13,.09,.56),dm(0x1a1a1a));g.add(body);
  const bar=new THREE.Mesh(new THREE.CylinderGeometry(.032,.032,.75,8),dm(0x2a2a2a));bar.rotation.z=Math.PI/2;bar.position.set(.38,.04,.02);g.add(bar);
  const grp=new THREE.Mesh(new THREE.BoxGeometry(.09,.17,.12),dm(0x111111));grp.position.set(-.12,-.14,0);g.add(grp);
  const mag=new THREE.Mesh(new THREE.BoxGeometry(.07,.2,.1),dm(0x1d1d1d));mag.position.set(-.04,-.17,0);g.add(mag);
  const rl=new THREE.Mesh(new THREE.BoxGeometry(.05,.02,.5),dm(0x2e2e2e));rl.position.y=.075;g.add(rl);
  const acc=new THREE.Mesh(new THREE.BoxGeometry(.135,.025,.3),new THREE.MeshLambertMaterial({color:0xff6600,emissive:new THREE.Color(0xff6600),emissiveIntensity:.2}));acc.position.set(0,.06,.04);g.add(acc);
  g.position.set(.3,-.26,-.46);g.rotation.y=.07;
  camera.add(g);
}

// ─── HUD ──────────────────────────────────────────────────────
function updateHUD(){
  const p=Math.max(0,G.hp)/G.maxHp;
  document.getElementById('hp-bar').style.width=(p*100)+'%';
  document.getElementById('hp-bar').style.background=p>.5?'linear-gradient(90deg,#ff2233,#ff5533)':p>.25?'linear-gradient(90deg,#ff8800,#ff6600)':'linear-gradient(90deg,#990000,#ff0000)';
  document.getElementById('hp-num').textContent=Math.ceil(G.hp);
  document.getElementById('ammo-cur').textContent=G.ammo;
  document.getElementById('ammo-cur').style.color=G.ammo<=G.maxAmmo*.2?'#ff2233':G.ammo<=G.maxAmmo*.5?'#ff8800':'#ffd700';
}

function updateInvUI(){
  const inv=document.getElementById('inv-slots');inv.innerHTML='';
  G.missionItems.forEach(item=>{
    const sl=document.createElement('div');sl.className='inv-slot';
    if(item.collected){sl.classList.add('filled');sl.textContent=ITEM_CFG[item.type]?.icon||'📦';sl.title=ITEM_CFG[item.type]?.label||item.type;}
    inv.appendChild(sl);
  });
}

function updateObjUI(){
  const wt=G.winItem,wc=G.winCount;
  const done=G.collected.filter(c=>c.type===wt&&c.isMission).length;
  document.getElementById('progress-label').textContent=`${done}/${wc}`;
  const pct=(done/Math.max(1,wc))*100;
  document.getElementById('progress-fill').style.cssText=`background:linear-gradient(90deg,#00ff88 ${pct}%,rgba(255,255,255,.1) 0%)`;
}

function updateScoreUI(){ document.getElementById('score-display')&&(document.getElementById('score-display').textContent=G.score); }

function addEvent(text,color){
  const feed=document.getElementById('event-feed');
  const el=document.createElement('div');el.className='ev-entry';el.textContent=text;if(color) el.style.borderLeftColor=color;
  feed.appendChild(el);setTimeout(()=>el.remove(),3300);
  while(feed.children.length>7) feed.removeChild(feed.firstChild);
}

function showBigNotif(text,color){
  const el=document.createElement('div');el.className='big-notif';el.textContent=text;el.style.color=color||'#fff';
  document.getElementById('gc').appendChild(el);setTimeout(()=>el.remove(),3100);
}

function closeNPCDialog(){
  document.getElementById('npc-dialog').classList.add('hidden');
  dialogOpen=false;
  setTimeout(()=>{ if(!G.phase_complete) controls.lock(); },300);
}

function showNPCDialog(theme){
  dialogOpen=true;if(controls.isLocked) controls.unlock();
  document.getElementById('npc-avatar').textContent=theme?.npcAvatar||'👤';
  document.getElementById('npc-name').textContent=theme?.npcName||'Sobrevivente';
  const rawHint=(theme?.npcHint||'...');
  const ITEM_NAMES={fuel:'galões de combustível',pendrive:'pen-drives',crystal:'cristais',rescue_beacon:'balizas de resgate',artifact:'artefatos'};
  const hint=rawHint
    .replace(/\{winCount\}/g, G.winCount||'?')
    .replace(/\{winItem\}/g, ITEM_NAMES[G.winItem]||G.winItem||'itens');
  document.getElementById('npc-text').textContent=hint;
  document.getElementById('npc-dialog').classList.remove('hidden');
  // Replace the button to remove any previously stacked onclick handlers
  const oldBtn=document.getElementById('npc-close');
  const newBtn=oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(newBtn,oldBtn);
  newBtn.onclick=closeNPCDialog;
}

// ─── MINIMAP ─────────────────────────────────────────────────
function setupMinimap(){
  const c=document.getElementById('minimap-canvas');
  c.width=360; c.height=380; // tall enough for legend
  minimapCtx=c.getContext('2d');
}

// ─── ROAD PATH (greedy road-following for GPS) ────────────────
// Returns array of {x,z} waypoints tracing along roads from start to goal.
// Uses a simplified greedy best-first search on road node graph.
let _cachedRoadNodes=null, _cachedRoadEdges=null, _lastRoadDataLen=0;

function buildRoadNodes(){
  const roads=(G.mapData?.roads)||[];
  if(roads.length===_lastRoadDataLen && _cachedRoadNodes) return;
  _lastRoadDataLen=roads.length;
  const nodes=[]; // {x,z,edges:[nodeIdx]}
  const edgeMap=new Map(); // "x,z" -> nodeIdx
  const snap=0.8;
  function key(x,z){ return `${Math.round(x/snap)},${Math.round(z/snap)}`; }
  function getOrAdd(x,z){
    const k=key(x,z);
    if(edgeMap.has(k)) return edgeMap.get(k);
    const idx=nodes.length;
    nodes.push({x,z,edges:[]});
    edgeMap.set(k,idx);
    return idx;
  }
  roads.forEach(r=>{
    const pts=(r.pts||[]).filter(p=>p&&isFinite(p.x)&&isFinite(p.z));
    for(let i=0;i<pts.length-1;i++){
      const a=getOrAdd(pts[i].x,pts[i].z);
      const b=getOrAdd(pts[i+1].x,pts[i+1].z);
      if(!nodes[a].edges.includes(b)) nodes[a].edges.push(b);
      if(!nodes[b].edges.includes(a)) nodes[b].edges.push(a);
    }
  });
  _cachedRoadNodes=nodes;
}

function buildRoadPath(sx,sz,tx,tz){
  buildRoadNodes();
  const nodes=_cachedRoadNodes;
  if(!nodes||nodes.length<2) return [];

  // Find nearest node to start and target
  let si=0,ti=0,sdist=1e9,tdist=1e9;
  nodes.forEach((n,i)=>{
    const ds=Math.hypot(n.x-sx,n.z-sz);
    const dt=Math.hypot(n.x-tx,n.z-tz);
    if(ds<sdist){sdist=ds;si=i;}
    if(dt<tdist){tdist=dt;ti=i;}
  });

  // Greedy best-first with visited set (fast, good enough for minimap)
  const visited=new Set();
  const open=[{idx:si,path:[si],h:Math.hypot(nodes[si].x-tx,nodes[si].z-tz)}];
  const MAX_STEPS=400;
  let steps=0;

  while(open.length>0&&steps++<MAX_STEPS){
    open.sort((a,b)=>a.h-b.h);
    const cur=open.shift();
    if(cur.idx===ti){
      // Decimate path: keep every 3rd node to avoid jitter
      const full=cur.path.map(i=>({x:nodes[i].x,z:nodes[i].z}));
      const decimated=[full[0]];
      for(let i=3;i<full.length;i+=3) decimated.push(full[i]);
      decimated.push(full[full.length-1]);
      return decimated;
    }
    if(visited.has(cur.idx)) continue;
    visited.add(cur.idx);
    nodes[cur.idx].edges.forEach(ni=>{
      if(!visited.has(ni)){
        open.push({idx:ni,path:[...cur.path,ni],h:Math.hypot(nodes[ni].x-tx,nodes[ni].z-tz)});
      }
    });
  }
  return []; // fallback to straight line
}

function drawMinimap(){
  if(!minimapCtx) return;
  const c = document.getElementById('minimap-canvas');
  const W = c.width;       // 360
  const MAP_H = 300;       // map drawing area height
  const LEG_H = c.height - MAP_H; // legend area (80px)

  minimapCtx.clearRect(0, 0, W, c.height);

  // ── PLAYER position and direction ──
  const pp = controls.getObject().position;
  const ry = controls.getObject().rotation.y;

  // VIEW: how many world units from edge to edge horizontally
  // In blind mode: expand view enough to always include the extraction point
  let VIEW_W = 120;
  if(blindModeActive && G.extract){
    const extDist = Math.hypot(G.extract.x - pp.x, G.extract.z - pp.z);
    if(extDist > 50) VIEW_W = Math.min(300, extDist * 2.4);
  }
  const VIEW_H = VIEW_W * MAP_H / W;
  const scaleX = W / VIEW_W;
  const scaleZ = MAP_H / VIEW_H;

  // World → canvas (player-centered)
  const w2c = (wx, wz) => ({
    x: (wx - pp.x) * scaleX + W / 2,
    y: (wz - pp.z) * scaleZ + MAP_H / 2,
  });
  const inMap = (m) => m.x > -20 && m.x < W+20 && m.y > -20 && m.y < MAP_H+20;

  // ─── MAP BACKGROUND ───────────────────────────────────────
  minimapCtx.fillStyle = '#0e1a0e';
  minimapCtx.fillRect(0, 0, W, MAP_H);

  // ─── GRID (every 20m) ─────────────────────────────────────
  const gridW = 20 * scaleX;
  minimapCtx.strokeStyle = 'rgba(255,255,255,.07)';
  minimapCtx.lineWidth = 1;
  const offGX = ((W/2) % gridW + gridW) % gridW;
  const offGZ = ((MAP_H/2) % (20*scaleZ) + 20*scaleZ) % (20*scaleZ);
  for(let x=offGX; x<W; x+=gridW){
    minimapCtx.beginPath(); minimapCtx.moveTo(x,0); minimapCtx.lineTo(x,MAP_H); minimapCtx.stroke();
  }
  for(let z=offGZ; z<MAP_H; z+=20*scaleZ){
    minimapCtx.beginPath(); minimapCtx.moveTo(0,z); minimapCtx.lineTo(W,z); minimapCtx.stroke();
  }

  // ─── ROADS ────────────────────────────────────────────────
  minimapCtx.lineCap = 'round'; minimapCtx.lineJoin = 'round';
  (G.mapData?.roads||[]).forEach(r => {
    const pts = (r.pts||[]).filter(p=>p&&isFinite(p.x)&&isFinite(p.z));
    if(pts.length < 2) return;
    const isMajor = r.type==='motorway'||r.type==='trunk'||r.type==='primary';
    const isMed   = r.type==='secondary'||r.type==='tertiary';
    minimapCtx.strokeStyle = isMajor ? '#c8a030' : isMed ? '#a07820' : '#706040';
    minimapCtx.lineWidth   = isMajor ? 4 : isMed ? 2.5 : 1.5;
    minimapCtx.beginPath();
    const m0 = w2c(pts[0].x, pts[0].z);
    minimapCtx.moveTo(m0.x, m0.y);
    pts.slice(1).forEach(p => {
      const m = w2c(p.x, p.z);
      minimapCtx.lineTo(m.x, m.y);
    });
    minimapCtx.stroke();
  });

  // ─── BUILDINGS ────────────────────────────────────────────
  (G.mapData?.buildings||[]).forEach(b => {
    if(!b.pts?.length) return;
    const cx = b.pts.reduce((s,p)=>s+p.x,0)/b.pts.length;
    const cz = b.pts.reduce((s,p)=>s+p.z,0)/b.pts.length;
    const minX=Math.min(...b.pts.map(p=>p.x)), maxX=Math.max(...b.pts.map(p=>p.x));
    const minZ=Math.min(...b.pts.map(p=>p.z)), maxZ=Math.max(...b.pts.map(p=>p.z));
    const m = w2c(minX, minZ);
    const bw = (maxX-minX)*scaleX, bd = (maxZ-minZ)*scaleZ;
    if(bw < 1 || bd < 1) return;
    minimapCtx.fillStyle   = 'rgba(90,100,150,.5)';
    minimapCtx.strokeStyle = 'rgba(130,140,200,.4)';
    minimapCtx.lineWidth = 0.5;
    minimapCtx.fillRect(m.x, m.y, bw, bd);
    minimapCtx.strokeRect(m.x, m.y, bw, bd);
  });

  // ─── CLIPPING for out-of-view arrows ──────────────────────
  // (Arrows drawn after main content)
  const arrowTargets = [];

  // ─── BONUS ITEMS ──────────────────────────────────────────
  G.bonusItems.filter(i=>!i.collected).forEach(item => {
    const m = w2c(item.x, item.z);
    if(!inMap(m)) return;
    minimapCtx.fillStyle = 'rgba(255,215,0,.75)';
    minimapCtx.beginPath(); minimapCtx.arc(m.x,m.y,4,0,Math.PI*2); minimapCtx.fill();
  });

  // ─── ENEMIES ──────────────────────────────────────────────
  G.enemies.filter(e=>e.alive).forEach(en => {
    const cfg = ENEMY_CFG[en.type] || ENEMY_CFG.zombie;
    const m   = w2c(en.x, en.z);
    const dist= Math.hypot(en.x-pp.x, en.z-pp.z);
    if(!inMap(m)) return;

    const alerted = dist < cfg.sight;
    const r = alerted ? 7 : 5;
    const col = '#' + cfg.color.toString(16).padStart(6,'0');

    // Alert pulse ring
    if(alerted){
      const pulse = 0.4 + 0.5*Math.sin(Date.now()*0.008);
      minimapCtx.strokeStyle = `rgba(255,60,60,${pulse})`;
      minimapCtx.lineWidth = 2;
      minimapCtx.beginPath(); minimapCtx.arc(m.x,m.y,r+5,0,Math.PI*2); minimapCtx.stroke();
    }

    minimapCtx.fillStyle = col;
    minimapCtx.strokeStyle = 'rgba(0,0,0,.5)';
    minimapCtx.lineWidth = 1;
    minimapCtx.beginPath(); minimapCtx.arc(m.x,m.y,r,0,Math.PI*2);
    minimapCtx.fill(); minimapCtx.stroke();

    // Emoji icon
    minimapCtx.font = `${r*1.8}px serif`;
    minimapCtx.fillText(cfg.icon||'?', m.x - r*0.8, m.y + r*0.6);

    // Distance label for close enemies
    if(dist < 30){
      minimapCtx.font = 'bold 8px sans-serif';
      minimapCtx.fillStyle = '#ffaaaa';
      minimapCtx.fillText(Math.round(dist)+'m', m.x+r+2, m.y+3);
    }
  });

  // ─── MISSION ITEMS ────────────────────────────────────────
  G.missionItems.filter(i=>!i.collected).forEach(item => {
    const cfg2 = ITEM_CFG[item.type] || {};
    const m    = w2c(item.x, item.z);
    const col  = '#' + (cfg2.color||0xffffff).toString(16).padStart(6,'0');
    const dist = Math.hypot(item.x-pp.x, item.z-pp.z);
    const pulse = 0.5 + 0.5*Math.sin(Date.now()*0.004);

    if(inMap(m)){
      // Outer glow
      const grad = minimapCtx.createRadialGradient(m.x,m.y,4, m.x,m.y,16+pulse*6);
      grad.addColorStop(0, col);
      grad.addColorStop(1, 'transparent');
      minimapCtx.globalAlpha = 0.35 + 0.25*pulse;
      minimapCtx.fillStyle = grad;
      minimapCtx.beginPath(); minimapCtx.arc(m.x,m.y,16+pulse*6,0,Math.PI*2); minimapCtx.fill();
      minimapCtx.globalAlpha = 1;

      // Solid dot
      minimapCtx.fillStyle = col;
      minimapCtx.strokeStyle = '#fff';
      minimapCtx.lineWidth = 1.5;
      minimapCtx.beginPath(); minimapCtx.arc(m.x,m.y,9,0,Math.PI*2);
      minimapCtx.fill(); minimapCtx.stroke();

      // Icon
      minimapCtx.font = '12px serif';
      minimapCtx.fillText(cfg2.icon||'?', m.x-7, m.y+5);

      // Distance
      minimapCtx.font = 'bold 9px sans-serif';
      minimapCtx.fillStyle = '#ffffff';
      minimapCtx.strokeStyle = 'rgba(0,0,0,.7)';
      minimapCtx.lineWidth = 2;
      const distTxt = Math.round(dist)+'m';
      minimapCtx.strokeText(distTxt, m.x+11, m.y+4);
      minimapCtx.fillText(distTxt, m.x+11, m.y+4);
    } else {
      // Off-screen arrow
      arrowTargets.push({ x:item.x, z:item.z, col, icon:cfg2.icon||'?' });
    }
  });

  // ─── GPS ROUTE (road-following path) ──────────────────────
  if(G.gpsActive){
    const pending=G.missionItems.filter(i=>!i.collected);
    let target=null;
    if(pending.length>0){
      target=pending.reduce((a,b)=>
        Math.hypot(a.x-pp.x,a.z-pp.z)<Math.hypot(b.x-pp.x,b.z-pp.z)?a:b);
    } else if(G.extract?.active){
      target=G.extract;
    }
    if(target){
      const roadPath=buildRoadPath(pp.x,pp.z,target.x,target.z);
      const tm=w2c(target.x,target.z);
      minimapCtx.save();
      minimapCtx.strokeStyle='rgba(0,255,153,0.9)';
      minimapCtx.lineWidth=3;
      minimapCtx.setLineDash([12,5]);
      minimapCtx.lineDashOffset=-(Date.now()*0.05%17);
      minimapCtx.lineJoin='round';
      minimapCtx.lineCap='round';
      minimapCtx.beginPath();
      const pm=w2c(pp.x,pp.z);
      minimapCtx.moveTo(pm.x,pm.y);
      if(roadPath.length>1){
        roadPath.forEach(pt=>{ const m=w2c(pt.x,pt.z); minimapCtx.lineTo(m.x,m.y); });
      } else {
        if(inMap(tm)) minimapCtx.lineTo(tm.x,tm.y);
        else{ const dx=tm.x-pm.x,dz=tm.y-pm.y,len=Math.hypot(dx,dz)||1; minimapCtx.lineTo(pm.x+dx/len*180,pm.y+dz/len*180); }
      }
      minimapCtx.stroke();
      minimapCtx.setLineDash([]);
      // Destination marker or off-screen arrow
      if(inMap(tm)){
        const pulse=0.85+0.2*Math.sin(Date.now()*0.006);
        minimapCtx.fillStyle=`rgba(0,255,153,${pulse})`;
        minimapCtx.strokeStyle='#000'; minimapCtx.lineWidth=1.5;
        minimapCtx.beginPath(); minimapCtx.arc(tm.x,tm.y,8*pulse,0,Math.PI*2);
        minimapCtx.fill(); minimapCtx.stroke();
        minimapCtx.font='bold 12px sans-serif';
        minimapCtx.fillStyle='#000'; minimapCtx.textAlign='center';
        minimapCtx.fillText('X',tm.x,tm.y+4); minimapCtx.textAlign='left';
      } else {
        const dx=tm.x-pm.x,dz=tm.y-pm.y,ang=Math.atan2(dz,dx);
        const ex=Math.max(12,Math.min(W-12,W/2+Math.cos(ang)*135));
        const ey=Math.max(12,Math.min(MAP_H-12,MAP_H/2+Math.sin(ang)*135));
        minimapCtx.save();
        minimapCtx.translate(ex,ey); minimapCtx.rotate(ang);
        minimapCtx.fillStyle='rgba(0,255,153,.95)';
        minimapCtx.beginPath(); minimapCtx.moveTo(10,0); minimapCtx.lineTo(-6,-5); minimapCtx.lineTo(-6,5);
        minimapCtx.closePath(); minimapCtx.fill(); minimapCtx.restore();
        const distM=Math.round(Math.hypot(target.x-pp.x,target.z-pp.z));
        minimapCtx.fillStyle='rgba(0,255,153,.95)';
        minimapCtx.font='bold 10px sans-serif';
        minimapCtx.fillText(distM+'m',Math.min(W-30,ex+14),ey+4);
      }
      minimapCtx.restore();
    }
  }
  // ─── NPC ──────────────────────────────────────────────────
  if(G.npc && !G.npc.talked){
    const m    = w2c(G.npc.x, G.npc.z);
    const dist = Math.hypot(G.npc.x-pp.x, G.npc.z-pp.z);
    if(inMap(m)){
      minimapCtx.fillStyle = '#5599ff';
      minimapCtx.strokeStyle = '#aaccff';
      minimapCtx.lineWidth = 1.5;
      minimapCtx.beginPath(); minimapCtx.arc(m.x,m.y,8,0,Math.PI*2);
      minimapCtx.fill(); minimapCtx.stroke();
      minimapCtx.font = 'bold 10px sans-serif';
      minimapCtx.fillStyle = '#fff';
      minimapCtx.fillText('!', m.x-3.5, m.y+4);
      minimapCtx.font = '8px sans-serif';
      minimapCtx.fillStyle = '#99ccff';
      minimapCtx.fillText(Math.round(dist)+'m', m.x+10, m.y+4);
    } else {
      arrowTargets.push({ x:G.npc.x, z:G.npc.z, col:'#5599ff', icon:'!' });
    }
  }

  // ─── EXTRACT ZONE ─────────────────────────────────────────
  if(G.extract){
    const m      = w2c(G.extract.x, G.extract.z);
    const active = G.extract.active;
    const dist   = Math.hypot(G.extract.x-pp.x, G.extract.z-pp.z);
    const pulse  = 0.5 + 0.5*Math.sin(Date.now()*0.005);

    if(inMap(m)){
      if(active){
        minimapCtx.globalAlpha = 0.3 + 0.3*pulse;
        minimapCtx.strokeStyle = '#00ff66';
        minimapCtx.lineWidth = 3;
        minimapCtx.beginPath(); minimapCtx.arc(m.x,m.y,16+pulse*8,0,Math.PI*2); minimapCtx.stroke();
        minimapCtx.globalAlpha = 1;
        minimapCtx.fillStyle = '#00ff66';
      } else {
        minimapCtx.fillStyle = '#446644';
      }
      minimapCtx.strokeStyle = active ? '#ffffff' : '#668866';
      minimapCtx.lineWidth = 1.5;
      minimapCtx.beginPath(); minimapCtx.arc(m.x,m.y,10,0,Math.PI*2);
      minimapCtx.fill(); minimapCtx.stroke();

      minimapCtx.font = 'bold 8px sans-serif';
      minimapCtx.fillStyle = '#fff';
      minimapCtx.fillText('EX', m.x-7, m.y+3);

      minimapCtx.font = '8px sans-serif';
      minimapCtx.fillStyle = active ? '#aaffcc' : '#889988';
      minimapCtx.fillText(Math.round(dist)+'m', m.x+12, m.y+3);
    } else if(active){
      arrowTargets.push({ x:G.extract.x, z:G.extract.z, col:'#00ff66', icon:'EX' });
    }
  }

  // ─── OFF-SCREEN ARROWS ────────────────────────────────────
  arrowTargets.forEach(tgt => {
    const ang = Math.atan2(tgt.z - pp.z, tgt.x - pp.x);
    // Clamp to map edge
    const margin = 16;
    const ax = Math.max(margin, Math.min(W-margin, W/2 + Math.cos(ang) * (W/2 - margin)));
    const ay = Math.max(margin, Math.min(MAP_H-margin, MAP_H/2 + Math.sin(ang) * (MAP_H/2 - margin)));
    minimapCtx.save();
    minimapCtx.translate(ax, ay);
    minimapCtx.rotate(ang + Math.PI/2);
    minimapCtx.fillStyle = tgt.col;
    minimapCtx.strokeStyle = 'rgba(0,0,0,.6)';
    minimapCtx.lineWidth = 1.5;
    minimapCtx.beginPath();
    minimapCtx.moveTo(0,-12); minimapCtx.lineTo(-7,5); minimapCtx.lineTo(7,5);
    minimapCtx.closePath();
    minimapCtx.fill(); minimapCtx.stroke();
    minimapCtx.restore();
    // Icon at arrow tip
    minimapCtx.font = '10px serif';
    minimapCtx.fillStyle = '#fff';
    minimapCtx.fillText(tgt.icon||'?', ax-5, ay+4);
  });

  // ─── PLAYER (always center) ───────────────────────────────
  const cx = W/2, cy = MAP_H/2;
  // Shadow
  minimapCtx.fillStyle = 'rgba(0,0,0,.4)';
  minimapCtx.beginPath(); minimapCtx.arc(cx+1,cy+1,8,0,Math.PI*2); minimapCtx.fill();
  // Body
  minimapCtx.fillStyle = '#ffffff';
  minimapCtx.strokeStyle = '#cccccc';
  minimapCtx.lineWidth = 1.5;
  minimapCtx.beginPath(); minimapCtx.arc(cx,cy,8,0,Math.PI*2);
  minimapCtx.fill(); minimapCtx.stroke();
  // Direction triangle (red) — negate ry because canvas Y-axis is inverted vs Three.js
  minimapCtx.save();
  minimapCtx.translate(cx, cy); minimapCtx.rotate(-ry);
  minimapCtx.fillStyle = '#ff3333';
  minimapCtx.beginPath();
  minimapCtx.moveTo(0,-16); minimapCtx.lineTo(-5,-7); minimapCtx.lineTo(5,-7);
  minimapCtx.closePath(); minimapCtx.fill();
  minimapCtx.restore();

  // ─── COMPASS ──────────────────────────────────────────────
  minimapCtx.font = 'bold 11px sans-serif';
  minimapCtx.textAlign = 'center';
  minimapCtx.fillStyle = '#ff6666'; minimapCtx.fillText('N', W/2, 11);
  minimapCtx.fillStyle = 'rgba(200,200,200,.5)';
  minimapCtx.fillText('S', W/2, MAP_H-2);
  minimapCtx.textAlign = 'left';
  minimapCtx.fillText('O', 3, MAP_H/2+4);
  minimapCtx.textAlign = 'right';
  minimapCtx.fillText('L', W-3, MAP_H/2+4);
  minimapCtx.textAlign = 'left';

  // Scale bar — bottom-left of map
  const barM = 30 * scaleX; // 30 world meters
  minimapCtx.strokeStyle = 'rgba(255,255,255,.6)';
  minimapCtx.lineWidth = 2;
  minimapCtx.beginPath(); minimapCtx.moveTo(8,MAP_H-10); minimapCtx.lineTo(8+barM,MAP_H-10); minimapCtx.stroke();
  // End ticks
  minimapCtx.beginPath(); minimapCtx.moveTo(8,MAP_H-13); minimapCtx.lineTo(8,MAP_H-7); minimapCtx.stroke();
  minimapCtx.beginPath(); minimapCtx.moveTo(8+barM,MAP_H-13); minimapCtx.lineTo(8+barM,MAP_H-7); minimapCtx.stroke();
  minimapCtx.font = '8px sans-serif'; minimapCtx.fillStyle = 'rgba(255,255,255,.6)';
  minimapCtx.fillText('30m', 10+barM, MAP_H-5);

  // Map border
  minimapCtx.strokeStyle = 'rgba(255,255,255,.15)';
  minimapCtx.lineWidth = 1;
  minimapCtx.strokeRect(0, 0, W, MAP_H);

  // ─── LEGEND AREA ──────────────────────────────────────────
  minimapCtx.fillStyle = '#06100a';
  minimapCtx.fillRect(0, MAP_H, W, LEG_H);

  // Separator line
  minimapCtx.strokeStyle = 'rgba(255,255,255,.12)';
  minimapCtx.lineWidth = 1;
  minimapCtx.beginPath(); minimapCtx.moveTo(0,MAP_H); minimapCtx.lineTo(W,MAP_H); minimapCtx.stroke();

  // Title
  minimapCtx.font = 'bold 9px sans-serif';
  minimapCtx.fillStyle = 'rgba(255,255,255,.5)';
  minimapCtx.fillText('LEGENDA', 6, MAP_H+12);

  // Legend items
  const legItems = [];
  // Mission items (only types present)
  const seenMission = new Set();
  G.missionItems.filter(i=>!i.collected).forEach(item => {
    if(seenMission.has(item.type)) return; seenMission.add(item.type);
    const cfg2 = ITEM_CFG[item.type]||{};
    legItems.push({ col:'#'+((cfg2.color||0xffffff).toString(16).padStart(6,'0')), icon:cfg2.icon||'?', label:cfg2.label||item.type, shape:'circle' });
  });
  // Enemies (unique types)
  const seenEn = new Set();
  G.enemies.filter(e=>e.alive).forEach(en => {
    if(seenEn.has(en.type)) return; seenEn.add(en.type);
    const cfg = ENEMY_CFG[en.type]||ENEMY_CFG.zombie;
    legItems.push({ col:'#'+cfg.color.toString(16).padStart(6,'0'), icon:cfg.icon||'?', label:cfg.label||en.type, shape:'circle' });
  });
  // Fixed items
  legItems.push({ col:'#ffd700', icon:'💰', label:'Bônus', shape:'circle' });
  legItems.push({ col:'#5599ff', icon:'!', label:'NPC', shape:'circle' });
  if(G.extract) legItems.push({ col:G.extract.active?'#00ff66':'#446644', icon:'EX', label:'Extração', shape:'circle' });
  if(G.gpsActive) legItems.push({ col:'#00ff99', icon:'📡', label:'GPS ativo', shape:'circle' });

  // Draw 2-column legend
  const colW = W/2;
  legItems.slice(0,8).forEach((item, i) => {
    const col2 = i % 2;
    const row  = Math.floor(i / 2);
    const lx   = col2 * colW + 6;
    const ly   = MAP_H + 22 + row * 16;
    if(ly > MAP_H + LEG_H - 4) return;

    // Dot
    minimapCtx.fillStyle = item.col;
    minimapCtx.beginPath(); minimapCtx.arc(lx+5, ly-4, 4, 0, Math.PI*2); minimapCtx.fill();
    // Icon
    minimapCtx.font = '9px serif';
    minimapCtx.fillStyle = '#ddd';
    minimapCtx.fillText(item.icon, lx+11, ly);
    // Label
    minimapCtx.font = '8px sans-serif';
    minimapCtx.fillStyle = 'rgba(200,200,200,.7)';
    const label = item.label.slice(0,14);
    minimapCtx.fillText(label, lx+22, ly);
  });
}

// ─── VISUAL FX ───────────────────────────────────────────────
function flashOverlay(id){const o=document.getElementById(id);o.classList.add('on');setTimeout(()=>o.classList.remove('on'),170);}
let shT;function shakeScreen(){const gc=document.getElementById('gc');gc.style.animation='';void gc.offsetWidth;gc.style.animation='shake .38s ease';clearTimeout(shT);shT=setTimeout(()=>gc.style.animation='',400);}
function showHitMark(){const h=document.getElementById('hitmark');h.classList.remove('hidden');setTimeout(()=>h.classList.add('hidden'),200);}

// ─── INPUT ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
// ─── BLIND MODE SYSTEM ────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

// Voice profiles per theme — different accent/style cues via pitch/rate
const BLIND_VOICE_PROFILE = {
  apocalypse: { rate:.85, pitch:.7,  lang:'pt-BR' }, // gravelly, slow
  thriller:   { rate:1.1, pitch:1.0, lang:'pt-BR' }, // clipped, agent
  horror:     { rate:.75, pitch:.55, lang:'pt-BR' }, // deep, terrified
  war:        { rate:1.15,pitch:.9,  lang:'pt-BR' }, // military, fast
  mystery:    { rate:.9,  pitch:1.3, lang:'pt-BR' }, // ethereal, high
};

function blindSpeak(text, priority=false){
  if(!blindModeActive) return;
  if(!priority && Date.now()-blindLastVoice < 3800) return;
  blindLastVoice = Date.now();
  if(!window.speechSynthesis) return;
  try{
    // Cancel lower-priority ongoing speech
    if(priority) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const themeId = G.theme?.id || 'apocalypse';
    const p = BLIND_VOICE_PROFILE[themeId] || BLIND_VOICE_PROFILE.apocalypse;
    u.lang  = p.lang;
    u.rate  = p.rate;
    u.pitch = p.pitch;
    // Try to pick a pt-BR voice if available
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(v=>v.lang.startsWith('pt'));
    if(ptVoice) u.voice = ptVoice;
    window.speechSynthesis.speak(u);
  }catch(e){}
}

// Direction label relative to player facing
function getRelativeDir(toX, toZ){
  const pp  = controls.getObject().position;
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd); fwd.y=0; fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0,1,0));
  const dx = toX - pp.x, dz = toZ - pp.z;
  const dot_fwd   = fwd.x*dx   + fwd.z*dz;
  const dot_right = right.x*dx + right.z*dz;
  const angle = Math.atan2(dot_right, dot_fwd) * 180/Math.PI;

  if(angle > -22.5 && angle <=  22.5) return {label:'à frente',    arrow:'⬆️'};
  if(angle >  22.5 && angle <=  67.5) return {label:'à frente-direita', arrow:'↗️'};
  if(angle >  67.5 && angle <= 112.5) return {label:'à direita',   arrow:'➡️'};
  if(angle > 112.5 && angle <= 157.5) return {label:'atrás-direita',arrow:'↘️'};
  if(angle > 157.5 || angle <=-157.5) return {label:'atrás',       arrow:'⬇️'};
  if(angle >=-157.5&& angle <=-112.5) return {label:'atrás-esquerda',arrow:'↙️'};
  if(angle >=-112.5&& angle <=-67.5)  return {label:'à esquerda',  arrow:'⬅️'};
  return {label:'à frente-esquerda', arrow:'↖️'};
}

function activateBlindMode(){
  if(!blindModeEnabled || blindModeActive) return;
  blindModeActive = true;
  document.body.classList.add('blind-active');

  // Fade scene lights to near-zero
  const fadeLight = (lt, target, dur) => {
    if(!lt) return;
    const start = lt.intensity, t0=Date.now();
    const step = ()=>{
      const p=Math.min(1,(Date.now()-t0)/dur);
      lt.intensity=start+(target-start)*p;
      if(p<1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  fadeLight(LT.ambient, 0, 2200);
  fadeLight(LT.sun,     0, 2200);
  fadeLight(LT.hemi,    0, 2200);
  fadeLight(LT.player,  0, 2200);

  // Ramp up fog to near-opaque
  const origDensity = scene.fog.density;
  const t0=Date.now();
  const fogFade=()=>{
    const p=Math.min(1,(Date.now()-t0)/2200);
    scene.fog.density = origDensity+(0.18-origDensity)*p;
    if(p<1) requestAnimationFrame(fogFade);
  };
  requestAnimationFrame(fogFade);

  // Black overlay in
  const overlay = document.getElementById('blind-overlay');
  overlay.style.transition='opacity 2s ease';
  requestAnimationFrame(()=>overlay.classList.add('active'));

  // Show compass HUD
  document.getElementById('blind-compass-hud').classList.add('active');

  // Opening voice line by theme
  const openings = {
    apocalypse: 'Tudo escureceu. Os mortos estão por toda parte. Siga minha voz até a extração.',
    thriller:   'Luzes cortadas. Modo silencioso ativado. Siga as instruções de navegação.',
    horror:     'A escuridão tomou conta. Eles estão me ouvindo... siga minha voz.',
    war:        'Apagão de combate! Navegue pelo som. Extração a nordeste, soldado!',
    mystery:    'A névoa engoliu tudo. As entidades crescem. Siga... se conseguir.',
  };
  setTimeout(()=>{
    blindSpeak(openings[G.theme?.id]||openings.apocalypse, true);
    startLightningLoop();
    startBlindNavLoop();
    startBlindBeep();
  }, 2400);
}

function deactivateBlindMode(){
  if(!blindModeActive) return;
  blindModeActive = false;
  document.body.classList.remove('blind-active');
  window.speechSynthesis?.cancel();
  if(blindBeepNode){ try{blindBeepNode.stop();}catch(e){} blindBeepNode=null; }

  document.getElementById('blind-overlay').classList.remove('active');
  document.getElementById('blind-compass-hud').classList.remove('active');
  document.getElementById('blind-compass-hud').innerHTML='';

  // Restore lights
  if(LT.ambient) LT.ambient.intensity=parseFloat(G.theme?.ambientInt)||1.0;
  if(LT.sun)     LT.sun.intensity=parseFloat(G.theme?.sunInt)||1.2;
  if(LT.hemi)    LT.hemi.intensity=0.5;
  if(LT.player)  LT.player.intensity=0.4;
  scene.fog.density=parseFloat(G.theme?.fogDensity)||0.012;
}

// ── Lightning flashes ─────────────────────────────────────────
function startLightningLoop(){
  const lightning=document.getElementById('lightning-overlay');
  const doFlash=()=>{
    if(!blindModeActive) return;
    // 2–4 rapid flickers
    let count=1+Math.floor(Math.random()*3);
    const flicker=()=>{
      if(count--<=0){
        // schedule next flash in 8-20s
        setTimeout(doFlash, 8000+Math.random()*12000);
        return;
      }
      lightning.style.opacity='0.85';
      setTimeout(()=>{
        lightning.style.transition='opacity 80ms ease';
        lightning.style.opacity='0';
        setTimeout(flicker, 120+Math.random()*200);
      }, 60+Math.random()*80);
    };
    flicker();
  };
  setTimeout(doFlash, 3000+Math.random()*5000);
}

// ── Navigation voice loop ──────────────────────────────────────
function startBlindNavLoop(){
  const loop=()=>{
    if(!blindModeActive) return;
    updateBlindCompass();
    setTimeout(loop, 4500);
  };
  setTimeout(loop, 4500);
}

function updateBlindCompass(){
  if(!blindModeActive||!G.extract) return;
  const pp=controls.getObject().position;
  const tx=G.extract.x, tz=G.extract.z;
  const dist=Math.hypot(tx-pp.x, tz-pp.z);
  const dir=getRelativeDir(tx,tz);

  // Update compass HUD arrow
  const hud=document.getElementById('blind-compass-hud');
  // Check nearest enemy
  let nearestEnemy=null, nearestEDist=999;
  G.enemies.forEach(en=>{
    if(!en.alive) return;
    const d=Math.hypot(en.x-pp.x,en.z-pp.z);
    if(d<nearestEDist){nearestEDist=d;nearestEnemy=en;}
  });

  let arrowHTML=`<div class="blind-dir-arrow">${dir.arrow}</div>`;
  arrowHTML+=`<div class="blind-dist-text">EXTRAÇÃO ${dir.label.toUpperCase()} — ${Math.round(dist)}m</div>`;
  if(nearestEnemy&&nearestEDist<18){
    const eDir=getRelativeDir(nearestEnemy.x,nearestEnemy.z);
    const ENEMY_NAMES={zombie:'zumbi',zombie_tank:'zumbi tanque',zombie_fast:'zumbi rápido',
      guard:'guarda',sniper_npc:'atirador',drone:'drone',soldier:'soldado',commander:'comandante',
      ghost:'fantasma',shadow:'sombra',demon:'demônio',golem:'golem',specter:'espectro',ancient_guardian:'guardião'};
    const eName=ENEMY_NAMES[nearestEnemy.type]||'inimigo';
    arrowHTML+=`<div class="blind-alert-text">⚠️ ${eName.toUpperCase()} ${eDir.label.toUpperCase()} — ${Math.round(nearestEDist)}m</div>`;
  }
  hud.innerHTML=arrowHTML;

  // Voice navigation
  const distStr=dist<8?'você chegou':'a '+Math.round(dist)+' metros';
  let speechText='';

  if(dist<6){
    speechText='Extração alcançada! Você chegou!';
    blindSpeak(speechText,true);
    return;
  }

  if(nearestEnemy&&nearestEDist<10){
    const eDir=getRelativeDir(nearestEnemy.x,nearestEnemy.z);
    const ENEMY_NAMES2={zombie:'zumbi',zombie_tank:'zumbi tanque',zombie_fast:'zumbi rápido',
      guard:'guarda',drone:'drone',soldier:'soldado',ghost:'fantasma',demon:'demônio'};
    speechText=`Cuidado! ${ENEMY_NAMES2[nearestEnemy.type]||'inimigo'} ${eDir.label}, ${Math.round(nearestEDist)} metros!`;
    blindSpeak(speechText,true);
  } else {
    // Navigation phrases by distance
    const phrases={
      apocalypse:[`Siga ${dir.label}, extração ${distStr}.`,`Continue ${dir.label}. Eles estão ouvindo.`,`${dir.label}... ${distStr}. Não pare.`],
      thriller:  [`Extração ${dir.label}. ${distStr}. Mantenha movimento.`,`Navegando ${dir.label}. ${distStr}.`,`${dir.label}. Distância: ${distStr}.`],
      horror:    [`...${dir.label}... ${distStr}... eles estão por toda parte...`,`Sussurros ${dir.label}. Siga o som. ${distStr}.`,`${dir.label}... ${distStr}... rápido...`],
      war:       [`Extração ${dir.label}! ${distStr}! Continue avançando!`,`${dir.label}! ${distStr}! Não recue!`,`Rumo à extração, ${dir.label}. ${distStr}.`],
      mystery:   [`As estrelas apontam ${dir.label}. ${distStr}.`,`Siga a névoa ${dir.label}. ${distStr}.`,`${dir.label}... o portal espera... ${distStr}.`],
    };
    const theme=G.theme?.id||'apocalypse';
    const pool=phrases[theme]||phrases.apocalypse;
    speechText=pool[Math.floor(Math.random()*pool.length)];
    blindSpeak(speechText);
  }
}

// ── Proximity beep toward extraction ──────────────────────────
function startBlindBeep(){
  const ctx=getTone(); if(!ctx) return;
  const osc=ctx.createOscillator();
  const gain=ctx.createGain();
  osc.type='sine'; osc.frequency.value=880;
  gain.gain.value=0;
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start();
  blindBeepNode=osc;

  const pulse=()=>{
    if(!blindModeActive){gain.gain.value=0;return;}
    const pp=controls.getObject().position;
    const dist=Math.hypot(G.extract.x-pp.x,G.extract.z-pp.z);
    // Bip faster and louder as closer — max speed at 10m, silent at >60m
    const proximity=Math.max(0,1-dist/60);
    const interval=Math.max(300,1800*(1-proximity));
    gain.gain.setValueAtTime(.08*proximity,ctx.currentTime);
    setTimeout(()=>{
      gain.gain.setValueAtTime(0,ctx.currentTime);
      setTimeout(pulse, interval);
    },90);
  };
  pulse();
}

// ─── END BLIND MODE SYSTEM ─────────────────────────────────────

function setupInput(){
  // Unlock AudioContext on first user gesture (Chrome autoplay policy)
  const unlockAudio = () => {
    if(!AC){
      try{ AC=new(window.AudioContext||window.webkitAudioContext)(); }catch(e){}
    }
    if(AC && AC.state==='suspended') AC.resume().catch(()=>{});
  };
  document.addEventListener('keydown', unlockAudio, {once:true});
  document.addEventListener('click',   unlockAudio, {once:true});
  document.addEventListener('touchstart', unlockAudio, {once:true});

  document.addEventListener('keydown',e=>{
    if(dialogOpen){if(e.key==='Escape') closeNPCDialog();return;}
    keys[e.code]=true;
    switch(e.code){
      case 'KeyE': doInteract();break;
      case 'KeyR': startReload();break;
      case 'KeyF':
        if(G.theme?.id==='horror'&&LT.flashlight){G.flashlightOn=!G.flashlightOn;LT.flashlight.intensity=G.flashlightOn?1.8:0;}
        break;
      case 'Space': e.preventDefault();if(!isJumping){isJumping=true;jumpVy=7;}break;
      case 'Escape': if(!dialogOpen) controls.unlock();break;
    }
  });
  document.addEventListener('keyup',e=>{keys[e.code]=false;});
  document.addEventListener('mousedown',e=>{if(e.button===0&&!dialogOpen&&!G.phase_complete) fire();});
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
}

// ─── GAME LOOP ────────────────────────────────────────────────
// ── MOVEMENT STATE (persistent across frames) ──
const _moveState = { vx:0, vz:0 };

function gameLoop(){
  requestAnimationFrame(gameLoop);
  const now = performance.now();
  gameLoop._prev = gameLoop._prev || now;
  const dt = Math.min((now - gameLoop._prev) / 1000, 0.05);
  gameLoop._prev = now;

  // ── INPUT FLAGS ──
  const mW  = !!(keys.KeyW     || keys.ArrowUp);
  const mS  = !!(keys.KeyS     || keys.ArrowDown);
  const mA  = !!(keys.KeyA     || keys.ArrowLeft);
  const mD  = !!(keys.KeyD     || keys.ArrowRight);
  const isMoving = mW || mS || mA || mD;
  const sprint   = !!(keys.ShiftLeft   || keys.ShiftRight);
  const crouch   = !!(keys.ControlLeft || keys.ControlRight);

  // ── SPEED (units/second) ──
  const SPEED = (sprint ? 12 : crouch ? 4 : 7) * (G.bonusSpd || 1);

  // ── BUILD MOVE VECTOR from camera direction (always works) ──
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  camDir.y = 0;
  if(camDir.length() > 0.001) camDir.normalize();
  const camRight = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0,1,0)).normalize();

  let mx = 0, mz = 0;
  if(mW) { mx += camDir.x;  mz += camDir.z; }
  if(mS) { mx -= camDir.x;  mz -= camDir.z; }
  if(mD) { mx += camRight.x; mz += camRight.z; }
  if(mA) { mx -= camRight.x; mz -= camRight.z; }

  // Normalize diagonal
  const mlen = Math.sqrt(mx*mx + mz*mz);
  if(mlen > 0.001) { mx /= mlen; mz /= mlen; }

  // Smooth acceleration / deceleration
  const accel = 18, decel = 14;
  if(mlen > 0.001) {
    _moveState.vx += (mx * SPEED - _moveState.vx) * accel * dt;
    _moveState.vz += (mz * SPEED - _moveState.vz) * accel * dt;
  } else {
    _moveState.vx *= Math.max(0, 1 - decel * dt);
    _moveState.vz *= Math.max(0, 1 - decel * dt);
  }

  // Footsteps + bob
  if(isMoving) {
    bobT += dt * (sprint ? 14 : crouch ? 4 : 9);
    if(now - lastStep > (sprint ? 260 : 420)) { play('step'); lastStep = now; }
  }

  // ── JUMP ──
  if(isJumping) {
    jumpVy -= 22 * dt;
    const ny = controls.getObject().position.y + jumpVy * dt;
    if(ny <= ORIG_Y) { controls.getObject().position.y = ORIG_Y; isJumping = false; jumpVy = 0; }
    else             { controls.getObject().position.y = ny; }
  } else {
    const targetY = crouch ? CROUCH_Y : ORIG_Y;
    const bobOff  = isMoving ? Math.sin(bobT) * 0.022 : 0;
    controls.getObject().position.y += (targetY + bobOff - controls.getObject().position.y) * 10 * dt;
  }

  // ── APPLY POSITION with building collision ──
  const obj = controls.getObject();
  const nx  = obj.position.x + _moveState.vx * dt;
  const nz  = obj.position.z + _moveState.vz * dt;
  const BOUND = 160;

  let blockedX = Math.abs(nx) > BOUND;
  let blockedZ = Math.abs(nz) > BOUND;

  // Simple per-axis AABB vs buildings only
  if(!blockedX || !blockedZ) {
    scene.children.forEach(c => {
      if(!c.name || !c.name.startsWith('bld-')) return;
      if(c.name.includes('-r-') || c.name.includes('-w-') || c.name.includes('-sp-') || c.name.includes('sign')) return;
      const gp = c.geometry && c.geometry.parameters;
      if(!gp) return;
      const hw = (gp.width  || 4) / 2 + 0.6;
      const hd = (gp.depth  || 4) / 2 + 0.6;
      const ex = Math.abs(nx - c.position.x) < hw;
      const ez = Math.abs(nz - c.position.z) < hd;
      const cx = Math.abs(obj.position.x - c.position.x) < hw;
      const cz = Math.abs(obj.position.z - c.position.z) < hd;
      if(ex && ez) { if(!cx) blockedX = true; if(!cz) blockedZ = true; }
    });
  }

  if(!blockedX) obj.position.x = nx;
  if(!blockedZ) obj.position.z = nz;
  if(blockedX) _moveState.vx = 0;
  if(blockedZ) _moveState.vz = 0;

  // Blind mode: warn player when they hit a wall
  if(blindModeActive && (blockedX || blockedZ)){
    const now2 = Date.now();
    if(!window._lastBlindWallWarn || now2 - window._lastBlindWallWarn > 3500){
      window._lastBlindWallWarn = now2;
      const wallPhrases = {
        apocalypse:['Parede! Mude de direção!','Você colidiu com algo! Contorne!','Obstáculo! Vire!'],
        thriller:  ['Obstáculo detectado. Desvie.','Parede à frente. Mude de rota.','Bloqueado. Contorne.'],
        horror:    ['Algo te bloqueia... vire...','Parede! Não pare aqui!','Obstáculo... contorne rápido...'],
        war:       ['Parede! Mude de rota, soldado!','Obstáculo! Contorne pela esquerda!','Bloqueado! Desvie agora!'],
        mystery:   ['Uma barreira... contorne...','Obstáculo místico. Vire.','Algo bloqueia seu caminho...'],
      };
      const pool = wallPhrases[G.theme?.id] || wallPhrases.apocalypse;
      blindSpeak(pool[Math.floor(Math.random()*pool.length)], true);
    }
  }

  if(LT.player) LT.player.position.set(obj.position.x, 2, obj.position.z);

  // Emit move to server (if multiplayer was added)
  // Compass
  const yr=(obj.rotation.y%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
  const dirs=['N','NE','E','SE','S','SO','O','NO'];
  const compEl=document.getElementById('compass');if(compEl) compEl.textContent=dirs[Math.round(yr/(Math.PI*.25))%8]||'N';
  const coordEl=document.getElementById('coords-display');if(coordEl) coordEl.textContent=`${obj.position.x.toFixed(0)},${obj.position.z.toFixed(0)}`;

  runAI(now);
  checkInteract();
  drawMinimap();

  // Animate items (float + spin)
  const t=now*.001;
  [...G.missionItems,...G.bonusItems].filter(i=>!i.collected).forEach(item=>{
    const o=scene.getObjectByName('item-'+item.id);if(!o) return;
    o.rotation.y+=.025;
    o.position.y=.72+Math.sin(t*2+item.x*.1)*.18;
  });

  // NPC beacon pulse
  if(G.npc&&!G.npc.talked){
    const o=scene.getObjectByName('npc-0');
    const bc=o?.getObjectByName('npcBeacon');
    if(bc){bc.scale.setScalar(1+Math.sin(t*3)*.18);bc.material.opacity=.7+.3*Math.sin(t*3);}
  }

  renderer.render(scene,camera);
}

// ─── PHASE LOADING ────────────────────────────────────────────
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// ─── PHASE LOG ────────────────────────────────────────────────
function sendPhaseLog(data){
  try{
    const loc=data.location;
    const obj=data.objects;
    // Convert game-world XZ to approximate lat/lon
    // The map uses 1 world unit ≈ 1 meter. Origin = loc.lat/lon
    const metersPerDeg=111320;
    function worldToLatLon(wx,wz){
      const dLat=wz/metersPerDeg;
      const dLon=wx/(metersPerDeg*Math.cos(loc.lat*Math.PI/180));
      return {lat:+(loc.lat-dLat).toFixed(6), lon:+(loc.lon+dLon).toFixed(6)};
    }
    const playerLL=worldToLatLon(obj.playerSpawn?.x||0, obj.playerSpawn?.z||0);
    const missionItems=(obj.missionItems||[]).map(it=>({
      id:it.id, type:it.type,
      world:{x:+it.x.toFixed(1),z:+it.z.toFixed(1)},
      latlon:worldToLatLon(it.x,it.z),
      gmapsUrl:`https://www.google.com/maps?q=${worldToLatLon(it.x,it.z).lat},${worldToLatLon(it.x,it.z).lon}`
    }));
    const bonusItems=(obj.bonusItems||[]).map(it=>({
      id:it.id, type:it.type,
      world:{x:+it.x.toFixed(1),z:+it.z.toFixed(1)},
      latlon:worldToLatLon(it.x,it.z)
    }));
    const extractLL=obj.extract?worldToLatLon(obj.extract.x,obj.extract.z):null;
    const logEntry={
      phase:data.phase,
      theme:data.theme?.name,
      city:loc.city, country:loc.country,
      centerLatLon:{lat:loc.lat,lon:loc.lon},
      centerGmaps:`https://www.google.com/maps?q=${loc.lat},${loc.lon}`,
      playerSpawn:{world:obj.playerSpawn,latlon:playerLL,
        gmapsUrl:`https://www.google.com/maps?q=${playerLL.lat},${playerLL.lon}`},
      missionItems, bonusItems,
      extract:extractLL?{world:{x:+obj.extract.x.toFixed(1),z:+obj.extract.z.toFixed(1)},
        latlon:extractLL, gmapsUrl:`https://www.google.com/maps?q=${extractLL.lat},${extractLL.lon}`}:null,
      npc:obj.npc?{world:{x:+obj.npc.x.toFixed(1),z:+obj.npc.z.toFixed(1)},
        latlon:worldToLatLon(obj.npc.x,obj.npc.z)}:null,
      seed:data.seed
    };
    fetch('/api/phase-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry)})
      .then(r=>r.json())
      .then(r=>console.log(`📋 Phase log saved (${r.total} entries)`))
      .catch(e=>console.warn('Phase log failed:',e));
  }catch(e){ console.warn('sendPhaseLog error:',e); }
}

async function startPhase(phase){
  G.phase=phase;G.kills=0;G.bonusCollected=0;G.hp=G.maxHp;G.collected=[];G.deadEnemies=[];G.phase_complete=false;G.guessCorrect=false;G.gpsActive=false;
  // Reset dialog and blind mode state between phases
  dialogOpen=false;
  deactivateBlindMode();
  document.getElementById('npc-dialog').classList.add('hidden');
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('briefing-screen').classList.add('hidden');
  document.getElementById('loading-screen').classList.remove('hidden');
  document.getElementById('loading-bar').style.width='0%';

  const steps=['ls1','ls2','ls3','ls4','ls5'];
  let si=0;
  const ns=(pct,txt)=>{
    document.getElementById('loading-bar').style.width=pct+'%';
    document.getElementById('loading-sub').textContent=txt;
    if(si>0){const prev=document.getElementById(steps[si-1]);if(prev){prev.className='ls done';prev.textContent='✅ '+prev.textContent.replace(/^[⏳✅⬜] /,'');}}
    if(si<steps.length){const el=document.getElementById(steps[si]);if(el){el.className='ls active';el.textContent='⏳ '+txt;}si++;}
  };

  ns(8,'Selecionando local no mundo...');await sleep(250);
  ns(20,'Consultando OpenStreetMap...');

  let data;
  // Retry up to 3 times with increasing delays
  for(let attempt=1; attempt<=3; attempt++){
    try{
      ns(attempt===1?20:30, attempt===1?'Consultando OpenStreetMap...':'Tentativa '+attempt+'...');
      const r=await fetch(`/api/new-phase?phase=${phase}`);
      if(!r.ok) throw new Error('HTTP '+r.status);
      const json=await r.json();
      if(json.error) throw new Error(json.error);
      // Validate required fields
      if(!json.theme || !json.location || !json.objects) throw new Error('Resposta incompleta');
      data=json; break;
    }catch(e){
      console.error('Phase load attempt '+attempt+':',e.message);
      if(attempt<3){ ns(20,'Tentando novamente...'); await sleep(1500); }
      else{ ns(100,'Erro crítico: '+e.message); await sleep(2000); return; }
    }
  }
  if(!data) return;

  ns(45,'Gerando geometria 3D...');
  document.getElementById('loading-title').textContent='Carregando: '+data.location.city+', '+data.location.country;
  G.theme=data.theme; G.location=data.location; G.mapData=data.map||{buildings:[],roads:[],waters:[],parks:[],labels:[]};
  G.winItem=data.theme.winItem; G.winCount=data.theme.winCount;
  await sleep(150);

  clearMap();
  applyTheme(data.theme);
  renderMap(G.mapData, data.theme.id);
  buildWeapon();
  ns(70,'Posicionando inimigos...');await sleep(300);

  spawnAll(data.objects);
  ns(90,'Preparando missão...');await sleep(300);
  ns(100,'Pronto!');await sleep(400);

  // ── PHASE LOG ── save spawn positions with real lat/lon for debugging
  sendPhaseLog(data);

  document.getElementById('loading-screen').classList.add('hidden');
  showBriefing(data);
}

function showBriefing(data){
  const t=data.theme,loc=data.location;
  document.getElementById('brief-theme-badge').textContent=`${t.emoji} FASE ${G.phase} — ${t.name.toUpperCase()}`;
  document.getElementById('brief-title').textContent=t.name;
  document.getElementById('brief-story').textContent=t.story;
  document.getElementById('brief-goal').textContent=t.goal;
  document.getElementById('brief-clue').textContent=loc.hint;
  const prev=document.getElementById('brief-enemies-preview');prev.innerHTML='';
  const seen=new Set();
  t.enemies.forEach(e=>{if(seen.has(e)) return;seen.add(e);const cfg=ENEMY_CFG[e];if(!cfg) return;const b=document.createElement('div');b.className='enemy-badge';b.textContent=`${cfg.icon} ${cfg.label}`;prev.appendChild(b);});
  document.getElementById('briefing-screen').classList.remove('hidden');
  // Sync per-phase toggle with current setting
  const pt=document.getElementById('blind-mode-phase-toggle');
  if(pt) pt.checked=blindModeEnabled;
  document.getElementById('btn-deploy').onclick=()=>{
    // Read per-phase blind mode toggle (overrides the main menu setting)
    const phaseToggle = document.getElementById('blind-mode-phase-toggle');
    if(phaseToggle) blindModeEnabled = phaseToggle.checked;
    document.getElementById('briefing-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('phase-badge').textContent=`${t.emoji} FASE ${G.phase}: ${t.name}`;
    document.getElementById('objective-text').textContent=t.goal;
    updateHUD();updateInvUI();updateObjUI();
    document.getElementById('lock-hint').style.display='flex';
    setTimeout(()=>controls.lock(),350);
    // Trigger opening ambient sound
    setTimeout(()=>{
      const sounds=TENSION_THEMES[t.id]||['wind'];
      play(sounds[0]);
      setTimeout(()=>play('sting'),800);
    },500);
  };
}

// ─── BOOT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  initScene();
  document.getElementById('btn-start').addEventListener('click',()=>{
    blindModeEnabled = document.getElementById('blind-mode-toggle').checked;
    document.getElementById('menu-screen').classList.add('hidden');
    startPhase(1);
  });
});
