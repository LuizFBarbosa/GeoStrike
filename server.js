'use strict';
const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── THEMES ──────────────────────────────────────────────────
const THEMES = [
  {
    id:'apocalypse', name:'Pós-Apocalipse', emoji:'☣️',
    sky:'#3d2800', fog:'#2a1800', fogDensity:.012,
    ambient:'#ff8833', ambientInt:1.1, sun:'#ffaa44', sunInt:1.2,
    ground:'#4a3010', wallColor:'#5a3c1e',
    story:'Os zumbis tomaram as ruas. Colete combustível para o gerador e escape.',
    goal:'Colete 2 galões de combustível e chegue ao ponto de extração.',
    enemies:['zombie','zombie','zombie','zombie_tank','zombie_fast','zombie','zombie'],
    winItem:'fuel', winCount:2,
    npcAvatar:'🧔', npcName:'Miguel (mordido)',
    npcHint:'Ei… me restam minutos. Ouça: você precisa de {winCount} galões de {winItem} — são laranja-brilhante, impossível errar. Os ZUMBIS TANQUES aguentam muito — mire na cabeça, não no corpo. Os RÁPIDOS são mais fracos, mas se teletransportam perto de você. Ative o GPS se achar — ele te mostra o caminho. Quando pegar tudo, corre pro ponto de extração… e NÃO olha pra trás.',
    ambientSounds:['wind','distant_moan','heartbeat'],
  },
  {
    id:'thriller', name:'Thriller Urbano', emoji:'🕵️',
    sky:'#0a0a28', fog:'#0d0d22', fogDensity:.010,
    ambient:'#6688cc', ambientInt:1.0, sun:'#8899ee', sunInt:1.1,
    ground:'#0e0e25', wallColor:'#141428',
    story:'Agente, você está infiltrado. Os dados foram espalhados pela cidade. Recupere-os antes que te encontrem.',
    goal:'Colete 3 pen-drives de dados e escape.',
    enemies:['guard','guard','guard','sniper_npc','guard','drone'],
    winItem:'pendrive', winCount:3,
    npcAvatar:'👩', npcName:'Agente Sílvia',
    npcHint:'Agente — sem tempo. Você precisa dos {winCount} pen-drives — são azuis e pulsam no chão. Os GUARDAS patrulham em rotas fixas de ~8 segundos, espere o momento certo. O ATIRADOR fica estático mas tem alcance longo — elimine primeiro. Se ativar o GPS, ele traça rota até cada pendrive. Quando pegar tudo, a zona de extração acende verde — e drones de vigilância entram para te parar.',
    ambientSounds:['rain','radio_static','footsteps_distant'],
  },
  {
    id:'horror', name:'Survival Horror', emoji:'👻',
    sky:'#0a0015', fog:'#080012', fogDensity:.015,
    ambient:'#8833bb', ambientInt:.9, sun:'#aa55cc', sunInt:.8,
    ground:'#120018', wallColor:'#180020',
    story:'Algo veio do outro lado. As criaturas não morrem facilmente — use luz e prata.',
    goal:'Encontre 4 cristais de selagem e destrua o portal.',
    enemies:['ghost','shadow','ghost','demon','shadow','ghost'],
    winItem:'crystal', winCount:4,
    npcAvatar:'👴', npcName:'Ancião Tremendo',
    npcHint:'*voz rouca* Quatro cristais roxos… são sua única chance de selar o portal. Os FANTASMAS passam pelas paredes — mire no centro do brilho. O DEMÔNIO regenera vida, não pare de atirar. Os cristais pulsam violeta quando você está perto — confie nos olhos. O GPS do dispositivo te guia até cada um. Quando todos selados, CORRA para a extração — as criaturas ficam furiosas.',
    ambientSounds:['heartbeat','whisper','wind','creak'],
  },
  {
    id:'war', name:'Zona de Guerra', emoji:'💥',
    sky:'#2a2800', fog:'#1e1c00', fogDensity:.009,
    ambient:'#cccc66', ambientInt:1.2, sun:'#eeee99', sunInt:1.3,
    ground:'#2e2c10', wallColor:'#3a3620',
    story:'Conflito urbano. Resgate os civis e neutralize o Comandante.',
    goal:'Resgate 2 civis e elimine o Comandante inimigo.',
    enemies:['soldier','soldier','soldier','commander','soldier','soldier'],
    winItem:'rescue_beacon', winCount:2,
    npcAvatar:'🪖', npcName:'Cabo Torres',
    npcHint:'SOLDADO! As balizas de resgate são vermelhas e piscam — ative as {winCount} para chamar extração. Os SOLDADOS inimigos andam em pares, elimine pela retaguarda. O COMANDANTE usa escudo frontal — contorne e atire pelas costas. Atenção: quando ativar a última baliza, drones de reforço inimigo entram na área. Use o GPS se achar — ele marca cada baliza no mapa. Rápido!',
    ambientSounds:['wind','distant_explosion','radio_static'],
  },
  {
    id:'mystery', name:'Mistério Ancestral', emoji:'🔮',
    sky:'#150035', fog:'#100028', fogDensity:.013,
    ambient:'#9955dd', ambientInt:1.0, sun:'#bb88ff', sunInt:.9,
    ground:'#1a0838', wallColor:'#200a42',
    story:'Artefatos de poder foram espalhados. Entidades antigas protegem cada um.',
    goal:'Colete 5 artefatos e combine-os no altar central.',
    enemies:['golem','specter','golem','ancient_guardian','specter','golem'],
    winItem:'artifact', winCount:5,
    npcAvatar:'🧙', npcName:'Guardião Renegado',
    npcHint:'Viajante… cinco artefatos dourados estão dispersos por este lugar. Os GOLEMS regeneram se parar de atirar — cadência constante. O GUARDIÃO ANCESTRAL tem ponto fraco nas costas — circulação é essencial. Os artefatos brilham dourado e giram — impossível confundir. O dispositivo GPS, se encontrado, traça o caminho até cada um. Quando o quinto for coletado, fuja — a raiva das entidades é implacável.',
    ambientSounds:['wind','whisper','heartbeat'],
  },
];

// ─── LOCATIONS (25 cidades) ────────────────────────────────────
const LOCATIONS = [
  {lat: -18.88723, lon: -48.25277, hint: 'Maior Cidade do Interior', country: 'Brasil', city: 'Uberlândia' },
  {lat:-23.5505,lon:-46.6333,hint:'Maior cidade da América do Sul',country:'Brasil',city:'São Paulo'},
  {lat:-22.9068,lon:-43.1729,hint:'Cidade Maravilhosa, famosa pelo Carnaval',country:'Brasil',city:'Rio de Janeiro'},
  {lat:-12.9714,lon:-38.5014,hint:'Cidade histórica do Pelourinho',country:'Brasil',city:'Salvador'},
  {lat:48.8566, lon:2.3522,  hint:'Capital da moda e da gastronomia europeia',country:'França',city:'Paris'},
  {lat:51.5074, lon:-.1278,  hint:'Capital do Reino Unido',country:'UK',city:'Londres'},
  {lat:41.9028, lon:12.4964, hint:'Cidade Eterna, berço do Império Romano',country:'Itália',city:'Roma'},
  {lat:40.4168, lon:-3.7038, hint:'Capital ibérica no centro da Espanha',country:'Espanha',city:'Madrid'},
  {lat:52.52,   lon:13.405,  hint:'Capital reunificada da Europa Central',country:'Alemanha',city:'Berlim'},
  {lat:55.7558, lon:37.6173, hint:'Capital da maior nação do mundo',country:'Rússia',city:'Moscou'},
  {lat:35.6762, lon:139.6503,hint:'Capital do Sol Nascente',country:'Japão',city:'Tóquio'},
  {lat:37.5665, lon:126.978, hint:'Capital da Coreia do Sul, cidade tecnológica',country:'Coreia do Sul',city:'Seul'},
  {lat:31.2304, lon:121.4737,hint:'Maior cidade da China, centro financeiro',country:'China',city:'Xangai'},
  {lat:1.3521,  lon:103.8198,hint:'Ilha-nação do Sudeste Asiático',country:'Singapura',city:'Singapura'},
  {lat:28.6139, lon:77.209,  hint:'Capital da maior democracia do mundo',country:'Índia',city:'Nova Delhi'},
  {lat:40.7128, lon:-74.006, hint:'A Cidade que Nunca Dorme',country:'EUA',city:'Nova York'},
  {lat:34.0522, lon:-118.2437,hint:'Cidade das estrelas, do cinema e da praia',country:'EUA',city:'Los Angeles'},
  {lat:41.8781, lon:-87.6298,hint:'Cidade do Vento, à beira do lago Michigan',country:'EUA',city:'Chicago'},
  {lat:19.4326, lon:-99.1332,hint:'Uma das maiores metrópoles do mundo',country:'México',city:'Cidade do México'},
  {lat:-34.6037,lon:-58.3816,hint:'Capital da Argentina, cidade europeia na América',country:'Argentina',city:'Buenos Aires'},
  {lat:30.0444, lon:31.2357, hint:'Cidade milenar do Nilo e das Pirâmides',country:'Egito',city:'Cairo'},
  {lat:25.2048, lon:55.2708, hint:'Cidade dos arranha-céus no deserto do Golfo',country:'EAU',city:'Dubai'},
  {lat:-33.9249,lon:18.4241, hint:'Na ponta sul do continente africano',country:'África do Sul',city:'Cidade do Cabo'},
  {lat:-33.8688,lon:151.2093,hint:'Cidade da Ópera e da Harbour Bridge',country:'Austrália',city:'Sydney'},
  {lat:48.2082, lon:16.3738, hint:'Capital austríaca famosa pela valsa e Mozart',country:'Áustria',city:'Viena'},
  {lat:22.3193, lon:114.1694,hint:'Ex-colônia britânica, skyline icônico',country:'China',city:'Hong Kong'},
];

// ─── BONUS COLLECTIBLES (extras além da missão) ───────────────
const BONUS_ITEMS = [
  {type:'medkit',    icon:'❤️',  label:'Kit Médico',     points:20},
  {type:'ammo_box',  icon:'📦',  label:'Caixa de Munição',points:15},
  {type:'coin',      icon:'💰',  label:'Moeda',          points:10},
  {type:'document',  icon:'📄',  label:'Documento',      points:25},
  {type:'weapon_part',icon:'🔧', label:'Peça de Arma',   points:30},
  {type:'map_piece', icon:'🗺️',  label:'Fragmento de Mapa',points:40},
];

const osmCache = new Map();

async function fetchOSM(lat, lon, r=0.55) {
  const key=`${lat.toFixed(3)}_${lon.toFixed(3)}`;
  if(osmCache.has(key)) return osmCache.get(key);
  const R=r/111;
  const bbox=`${lat-R},${lon-R},${lat+R},${lon+R}`;
  const q=`[out:json][timeout:22];(way["highway"](${bbox});way["building"](${bbox});way["natural"="water"](${bbox});way["leisure"="park"](${bbox});node["name"](${bbox}););out body;>;out skel qt;`;
  try {
    const res=await fetch('https://overpass-api.de/api/interpreter',{
      method:'POST',
      headers:{
        'Content-Type':'application/x-www-form-urlencoded',
        'User-Agent':'GeoStrike/1.0 (educational game; contact@geostrike.local)',
        'Accept':'application/json',
      },
      body:'data='+encodeURIComponent(q),
      timeout:24000,
    });
    if(!res.ok) throw new Error('OSM '+res.status);
    const j=await res.json();
    if(!j || !j.elements) throw new Error('OSM empty response');
    osmCache.set(key,j); return j;
  } catch(e){ console.warn('OSM error:',e.message); return null; }
}

function osmToMap(osm, cLat, cLon) {
  if(!osm?.elements) return buildFallback();
  const S=85000; // scale
  const nodes={};
  osm.elements.filter(e=>e.type==='node').forEach(n=>{
    nodes[n.id]={x:(n.lon-cLon)*S, z:-(n.lat-cLat)*S, tags:n.tags||{}};
  });
  const buildings=[],roads=[],waters=[],parks=[],labels=[];
  osm.elements.filter(e=>e.type==='way').forEach(w=>{
    const pts=(w.nodes||[]).map(id=>nodes[id]).filter(p=>p&&isFinite(p.x)&&isFinite(p.z)&&Math.abs(p.x)<200&&Math.abs(p.z)<200);
    if(pts.length<2) return;
    const t=w.tags||{};
    if(t.highway){
      const widths={motorway:5,trunk:4,primary:3.5,secondary:3,tertiary:2.5,residential:2,service:1.2,footway:.8,path:.6};
      roads.push({pts,w:widths[t.highway]||1.5,type:t.highway,name:t.name||''});
    } else if(t.building){
      const lv=parseInt(t['building:levels'])||Math.floor(Math.random()*5+1);
      buildings.push({pts,h:Math.min(parseInt(t.height)||lv*3.5,50),name:t.name||''});
    } else if(t.natural==='water'||t.waterway){
      waters.push({pts});
    } else if(t.leisure==='park'||t.natural==='wood'){
      parks.push({pts});
    }
  });
  osm.elements.filter(e=>e.type==='node'&&e.tags?.name).forEach(n=>{
    const nd=nodes[n.id]; if(!nd) return;
    labels.push({x:nd.x,z:nd.z,name:n.tags.name,type:n.tags.amenity||n.tags.shop||'place'});
  });
  return {buildings,roads,waters,parks,labels};
}

function buildFallback(){
  const buildings=[],roads=[];
  for(let bx=-4;bx<=4;bx++) for(let bz=-4;bz<=4;bz++){
    if(Math.abs(bx)<1) continue;
    const x=bx*22,z=bz*22,s=8+Math.random()*10;
    buildings.push({pts:[{x:x-s/2,z:z-s/2},{x:x+s/2,z:z-s/2},{x:x+s/2,z:z+s/2},{x:x-s/2,z:z+s/2}],h:4+Math.random()*15,name:''});
  }
  for(let i=-4;i<=4;i++){
    roads.push({pts:[{x:i*22,z:-100},{x:i*22,z:100}],w:2,type:'residential',name:''});
    roads.push({pts:[{x:-100,z:i*22},{x:100,z:i*22}],w:2,type:'residential',name:''});
  }
  return {buildings,roads,waters:[],parks:[],labels:[]};
}

function seededRng(s){ let v=s%2147483647; return()=>{v=(v*16807)%2147483647;return(v-1)/2147483646;}; }

function placeObjects(map, theme, seed){
  const rng=seededRng(seed);
  const buildings=(map&&map.buildings)||[];
  const roads=(map&&map.roads)||[];

  // ── Pre-compute road network nodes ──────────────────────────
  const roadNodes=[];
  const nodeSet=new Set();
  const NODE_SNAP=0.5;
  function nodeKey(x,z){ return `${Math.round(x/NODE_SNAP)}_${Math.round(z/NODE_SNAP)}`; }

  roads.forEach(r=>{
    const pts=(r.pts||[]).filter(p=>p&&isFinite(p.x)&&isFinite(p.z));
    for(let i=0;i<pts.length;i++){
      const k=nodeKey(pts[i].x,pts[i].z);
      if(!nodeSet.has(k)){ nodeSet.add(k); roadNodes.push({x:pts[i].x,z:pts[i].z}); }
    }
    for(let i=0;i<pts.length-1;i++){
      const mx=(pts[i].x+pts[i+1].x)/2, mz=(pts[i].z+pts[i+1].z)/2;
      const k=nodeKey(mx,mz);
      if(!nodeSet.has(k)){ nodeSet.add(k); roadNodes.push({x:mx,z:mz}); }
    }
  });

  // ── Building AABBs ──────────────────────────────────────────
  const bldAABBs=buildings.map(b=>{
    const pts=(b.pts||[]).filter(p=>p&&isFinite(p.x)&&isFinite(p.z));
    if(pts.length<2) return null;
    const minX=Math.min(...pts.map(p=>p.x)), maxX=Math.max(...pts.map(p=>p.x));
    const minZ=Math.min(...pts.map(p=>p.z)), maxZ=Math.max(...pts.map(p=>p.z));
    return {minX:minX-0.8, maxX:maxX+0.8, minZ:minZ-0.8, maxZ:maxZ+0.8};
  }).filter(Boolean);

  function insideBuilding(x,z){
    return bldAABBs.some(b=>x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ);
  }

  // Snap position to nearest road node not inside a building
  // preferDist: prefer nodes at least this far from world origin (spread items)
  // excludePos: avoid placing within excludeRadius of this position (e.g. extract zone)
  function snapToRoad(nearX, nearZ, preferDist=0, maxDist=999, excludePos=null, excludeRadius=10){
    if(roadNodes.length===0){
      for(let t=0;t<30;t++){
        const x=nearX+(rng()-.5)*20, z=nearZ+(rng()-.5)*20;
        if(!insideBuilding(x,z)) return {x,z};
      }
      return {x:nearX,z:nearZ};
    }
    let best=null, bestScore=1e9;
    roadNodes.forEach(n=>{
      if(insideBuilding(n.x,n.z)) return;
      const d=Math.hypot(n.x-nearX,n.z-nearZ);
      if(d>maxDist) return;
      // Keep clear of extract zone
      if(excludePos&&Math.hypot(n.x-excludePos.x,n.z-excludePos.z)<excludeRadius) return;
      const fromOrigin=Math.hypot(n.x,n.z);
      if(preferDist>0&&fromOrigin<preferDist*0.55) return;
      const score=d+(preferDist>0?Math.max(0,preferDist-fromOrigin)*0.25:0);
      if(score<bestScore){ bestScore=score; best=n; }
    });
    if(!best){ // relax prefer + exclude constraints
      roadNodes.forEach(n=>{
        if(insideBuilding(n.x,n.z)) return;
        const d=Math.hypot(n.x-nearX,n.z-nearZ);
        if(d<bestScore){ bestScore=d; best=n; }
      });
    }
    if(best) return {x:best.x+(rng()-.5)*1.2, z:best.z+(rng()-.5)*1.2};
    return {x:nearX,z:nearZ};
  }
  // ── All spawns use snapToRoad — every object lands on a real road node ──

  // Extract: calculated FIRST so all items can avoid its zone
  const extAngle=rng()*Math.PI*2;
  const extPos=snapToRoad(Math.cos(extAngle)*55, Math.sin(extAngle)*55, 40, 200);
  const extract={x:extPos.x,z:extPos.z,active:false};
  const EXTRACT_CLEAR=12; // items must stay at least 12m from extract

  // Player spawns near world edge, on a road, away from extract
  const playerSpawn=snapToRoad(-40+rng()*10, -40+rng()*10, 0, 999, extPos, EXTRACT_CLEAR);

  // Mission items: spread around map, each away from extract zone
  const winItemType = theme.winItem || 'fuel';
  const winItemCount = theme.winCount || 2;
  const missionItems=[];
  for(let i=0;i<winItemCount;i++){
    const angle=(i/winItemCount)*Math.PI*2+rng()*0.4;
    const dist=30+rng()*35;
    const raw={x:Math.cos(angle)*dist, z:Math.sin(angle)*dist};
    const pos=snapToRoad(raw.x, raw.z, dist*0.5, 200, extPos, EXTRACT_CLEAR);
    missionItems.push({id:`mi_${i}`,type:winItemType,x:pos.x,z:pos.z,collected:false,isMission:true});
  }

  // Bonus items: scattered, all on roads, away from extract
  const bonusItems=[];
  const bonusCount=8+Math.floor(rng()*6);
  for(let i=0;i<bonusCount;i++){
    const b=BONUS_ITEMS[Math.floor(rng()*BONUS_ITEMS.length)];
    const angle=rng()*Math.PI*2, dist=12+rng()*50;
    const raw={x:Math.cos(angle)*dist, z:Math.sin(angle)*dist};
    const pos=snapToRoad(raw.x, raw.z, 0, 180, extPos, EXTRACT_CLEAR);
    bonusItems.push({id:`bi_${i}`,type:b.type,icon:b.icon,label:b.label,points:b.points,
      x:pos.x,z:pos.z,collected:false,isMission:false});
  }

  // GPS device — close to player, on a road, away from extract
  const gpsAngle=rng()*Math.PI*2;
  const gpsPos=snapToRoad(Math.cos(gpsAngle)*15, Math.sin(gpsAngle)*15, 0, 40, extPos, EXTRACT_CLEAR);
  bonusItems.push({id:'bi_gps',type:'gps_device',icon:'📡',label:'Dispositivo GPS',points:50,
    x:gpsPos.x,z:gpsPos.z,collected:false,isMission:false,isGPS:true});

  // Enemies: spread around map
  const enemyAngles=theme.enemies.map((_,i)=>(i/theme.enemies.length)*Math.PI*2+rng()*0.5);
  const enemies=theme.enemies.map((type,i)=>{
    const angle=enemyAngles[i], dist=20+rng()*50;
    const sp=snapToRoad(Math.cos(angle)*dist, Math.sin(angle)*dist, dist*0.4, 180);
    const hp=getHP(type);
    const patrol=generatePatrol(sp,rng);
    return {id:`en_${i}`,type,x:sp.x,z:sp.z,hp,maxHp:hp,alive:true,patrol,patrolIdx:0};
  });

  // NPC: near player start, on road
  const npcPos=snapToRoad(6+(rng()-.5)*8, 6+(rng()-.5)*8, 0, 30, extPos, EXTRACT_CLEAR);
  const npc={id:'npc_0',type:'friendly',x:npcPos.x,z:npcPos.z,talked:false};

  // Signs from OSM labels
  const signs=(map.labels||[]).slice(0,10).map((l,i)=>({id:`sg_${i}`,x:l.x,z:l.z,text:l.name})).filter(s=>Math.abs(s.x)<150&&Math.abs(s.z)<150);

  return {playerSpawn,missionItems,bonusItems,enemies,npc,extract,signs};
}

function generatePatrol(c,rng){
  if(!c) return [{x:0,z:0},{x:12,z:0},{x:12,z:12},{x:0,z:12}];
  const r=10+rng()*15;
  return Array.from({length:4},(_,i)=>({x:c.x+Math.cos(i*Math.PI*.5)*r+(rng()-.5)*5,z:c.z+Math.sin(i*Math.PI*.5)*r+(rng()-.5)*5}));
}

function getHP(t){
  return {zombie:80,zombie_tank:280,zombie_fast:50,guard:100,sniper_npc:80,drone:60,
          ghost:70,shadow:60,demon:200,golem:220,specter:75,soldier:100,commander:300,ancient_guardian:250}[t]||90;
}

// ─── API ────────────────────────────────────────────────────
app.get('/api/new-phase', async(req,res)=>{
  try{
    const phase=parseInt(req.query.phase)||1;
    const theme=THEMES[(phase-1)%THEMES.length];
    const loc=LOCATIONS[Math.floor(Math.random()*LOCATIONS.length)];
    const seed=Date.now()%999983;
    console.log(`📍 Phase ${phase}: ${loc.city} | Theme: ${theme.name}`);

    let osm=null;
    try{ osm=await Promise.race([fetchOSM(loc.lat,loc.lon),new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),23000))]); }
    catch(e){ console.warn('OSM fallback'); }

    const map=osmToMap(osm,loc.lat,loc.lon);
    const objects=placeObjects(map,theme,seed);

    res.json({phase,theme,location:{lat:loc.lat,lon:loc.lon,hint:loc.hint,country:loc.country,city:loc.city},map,objects,seed});
  }catch(e){ console.error(e); res.status(500).json({error:e.message}); }
});

app.post('/api/phase-log',(req,res)=>{
  try{
    const log=req.body;
    const fs=require('fs');
    const path=require('path');
    const logPath=path.join(__dirname,'phase_log.json');
    let logs=[];
    try{ logs=JSON.parse(fs.readFileSync(logPath,'utf8')); }catch(e){}
    logs.unshift({...log, savedAt: new Date().toISOString()});
    logs=logs.slice(0,50); // keep last 50
    fs.writeFileSync(logPath,JSON.stringify(logs,null,2));
    res.json({ok:true,total:logs.length});
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/phase-log',(req,res)=>{
  try{
    const fs=require('fs');
    const path=require('path');
    const logPath=path.join(__dirname,'phase_log.json');
    const logs=JSON.parse(fs.readFileSync(logPath,'utf8'));
    res.json(logs);
  }catch(e){ res.json([]); }
});

app.get('/api/new-phase', async(req,res)=>{
  try{
    const phase=parseInt(req.query.phase)||1;
    const theme=THEMES[(phase-1)%THEMES.length];
    const loc=LOCATIONS[Math.floor(Math.random()*LOCATIONS.length)];
    const seed=Date.now()%999983;
    console.log(`📍 Phase ${phase}: ${loc.city} | Theme: ${theme.name}`);

    let osm=null;
    try{ osm=await Promise.race([fetchOSM(loc.lat,loc.lon),new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),23000))]); }
    catch(e){ console.warn('OSM fallback'); }

    const map=osmToMap(osm,loc.lat,loc.lon);
    const objects=placeObjects(map,theme,seed);

    res.json({phase,theme,location:{lat:loc.lat,lon:loc.lon,hint:loc.hint,country:loc.country,city:loc.city},map,objects,seed});
  }catch(e){ console.error(e); res.status(500).json({error:e.message}); }
});

app.post('/api/phase-log',(req,res)=>{
  try{
    const log=req.body;
    const fs=require('fs');
    const path=require('path');
    const logPath=path.join(__dirname,'phase_log.json');
    let logs=[];
    try{ logs=JSON.parse(fs.readFileSync(logPath,'utf8')); }catch(e){}
    logs.unshift({...log, savedAt: new Date().toISOString()});
    logs=logs.slice(0,50); // keep last 50
    fs.writeFileSync(logPath,JSON.stringify(logs,null,2));
    res.json({ok:true,total:logs.length});
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/phase-log',(req,res)=>{
  try{
    const fs=require('fs');
    const path=require('path');
    const logPath=path.join(__dirname,'phase_log.json');
    const logs=JSON.parse(fs.readFileSync(logPath,'utf8'));
    res.json(logs);
  }catch(e){ res.json([]); }
});

const PORT=process.env.PORT||5000;
app.listen(PORT,()=>{ console.log(`\n🌍 GeoStrike\n🌐 http://localhost:${PORT}\n🗺️  ${LOCATIONS.length} locais | ${THEMES.length} temas\n`); });
