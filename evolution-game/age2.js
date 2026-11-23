// HUD markup for Age 2, inserted into #hud when the age starts
const HUD2 = `
  <div id="readout">
    <div class="panel brand">PRIMORDIAL<small>Age 2 · Shallow Sea</small></div>
    <div class="panel stat" id="sTimeBox"><span class="label">Time</span><b id="sTime">0</b></div>
    <div class="panel stat"><span class="label">Yours</span><b id="sPop">0</b></div>
    <div class="panel stat"><span class="label">Gen</span><b id="sGen">0</b></div>
    <button class="panel stat" id="dnaBtn" type="button" aria-label="Open body editor"><span class="label">DNA</span><b id="sDna">0</b></button>
    <div class="panel sharebox"><span class="label">Share of the sea</span><div class="share" id="share"></div><div class="row"><span>Yours</span><b id="sShare">0%</b></div></div>
    <div class="panel stat" id="sZoneBox"><span class="label">Zone</span><b id="sZone" class="zone">—</b></div>
  </div>

  <div id="banner" class="panel" hidden><b id="bTitle"></b><span id="bText"></span><div class="t"><i id="bBar"></i></div></div>

  <section id="goals" class="panel" aria-label="Goals">
    <span class="label">Goals to finish Age 2</span>
    <h2 id="goalTitle">Leave the sea</h2>
    <div id="goalList"></div>
    <button class="link" id="openAges" type="button">See all ages →</button>
  </section>

  <aside id="inspector" class="panel side" hidden aria-label="Specimen">
    <header>
      <div><h3 id="iName">—</h3><div class="sub" id="iSub"></div></div>
      <button class="close" id="iClose" type="button" aria-label="Close specimen panel">×</button>
    </header>
    <div class="traits" id="iTraits"></div>
    <div>
      <span class="label">Brain · live</span>
      <canvas id="brain" width="560" height="380"></canvas>
    </div>
    <div class="actions">
      <button class="btn go" id="aControl" type="button">Take control</button>
      <button class="btn" id="aFavour" type="button">Favour · 1 DNA</button>
      <button class="btn danger" id="aCull" type="button">Cull</button>
    </div>
  </aside>

  <aside id="evolve" class="panel side" hidden aria-label="Body editor">
    <header>
      <div><h3>Body editor</h3><div class="sub" id="eSub">DNA</div></div>
      <button class="close" id="eClose" type="button" aria-label="Close body editor">×</button>
    </header>
    <canvas id="preview" width="580" height="300" aria-label="Your creature"></canvas>
    <span class="label">Mouth · switching costs 12 DNA</span>
    <div class="mouths" id="mouths"></div>
    <span class="label">Body parts</span>
    <div id="upgList" style="display:flex;flex-direction:column;gap:6px"></div>
    <div class="rivals"><span class="label">Rival designs</span><div id="rivalList" class="rivals"></div></div>
    <p class="note">Changes apply to every creature of your species straight away. Their brains still have to learn how to use new parts.</p>
  </aside>

  <nav id="toolbar" class="panel" aria-label="Tools">
    <button class="btn" data-tool="swim" aria-pressed="true" type="button">Swim</button>
    <button class="btn" data-tool="inspect" aria-pressed="false" type="button">Inspect</button>
    <button class="btn danger" data-tool="cull" aria-pressed="false" type="button">Cull</button>
    <span class="sep"></span>
    <button class="btn" id="dashBtn" type="button" disabled>Dash</button>
    <span class="sep"></span>
    <button class="btn" id="pauseBtn" aria-pressed="false" type="button" aria-label="Pause">❚❚</button>
    <button class="btn" id="speedBtn" type="button" aria-label="Game speed">1×</button>
    <span class="sep"></span>
    <button class="btn" id="viewBtn" type="button" aria-label="Toggle map view">Map</button>
  </nav>
`;

// Age 2: Shallow Sea. Segmented creatures built from body parts, in a large bounded sea with depth zones.
PR.ages[2] = { start(saved, carryIn) {
'use strict';
const { $, rnd, gauss, clamp, angTo, toast, showModal } = PR;
$('hud').innerHTML = HUD2;
const cv = $('world'), ctx = cv.getContext('2d');
let stopped = false;
const carry = (saved && saved.carry) || carryIn || null;

// ---------- world ----------
const W = 3200, H = 2200, SHORE = 240, SHALLOW = 900, REEF = 1550, G = 120;
const zoneOf = y => y < SHORE ? 'Shore' : y < SHALLOW ? 'Shallows' : y < REEF ? 'Reef' : 'Deep';
const PLANT_MAX = 1500, MEAT_MAX = 300;

// ---------- brain (inputs 0-10 match Age 1, so evolved brains carry over) ----------
const NI = 13, NH = 8, NO = 3, IH = NI * NH, HB = IH, HO = IH + NH, OB = HO + NH * NO, WN = OB + NO;
const IN_LABELS = ['Food dir', 'Food near', 'Animal dir', 'Animal near', 'Animal size', 'Kin', 'Danger', 'Energy', 'Bias', 'Rhythm', 'Memory', 'Health', 'Depth'];
const OUT_LABELS = ['Turn', 'Swim', 'Bite'];
function fromAge1(w1) {
  const w = new Float32Array(WN), ni = 11;
  for (let h = 0; h < NH; h++) {
    for (let i = 0; i < ni; i++) w[h * NI + i] = w1[h * ni + i];
    w[h * NI + 11] = rnd(0.3); w[h * NI + 12] = rnd(0.3);
    w[HB + h] = w1[ni * NH + h];
  }
  for (let o = 0; o < NO; o++) { for (let h = 0; h < NH; h++) w[HO + o * NH + h] = w1[ni * NH + NH + o * NH + h]; w[OB + o] = w1[ni * NH + NH + NH * NO + o]; }
  return w;
}
function randomGenome(hue) {
  const w = new Float32Array(WN); for (let i = 0; i < WN; i++) w[i] = rnd(1.2);
  return { w, size: 7 + Math.random() * 3, speed: 0.9 + Math.random() * 0.3, sense: 110 + Math.random() * 60, hue: hue + rnd(10) };
}
function carriedGenome() {
  const src = carry.genomes[Math.floor(Math.random() * carry.genomes.length)];
  const g = { w: fromAge1(src.w), size: clamp(7 + (src.size - 6) * 0.4, 6.5, 11), speed: clamp(0.85 + (src.speed - 1) * 0.25, 0.8, 1.3), sense: clamp(src.sense * 1.1, 90, 220), hue: 165 + rnd(8) };
  return mutate(g, 165, 0.6);
}
function mutate(g, base, rate = 1) {
  const w = new Float32Array(g.w);
  for (let i = 0; i < WN; i++) if (Math.random() < 0.1 * rate) w[i] = clamp(w[i] + gauss() * 0.4, -4, 4);
  return { w, size: clamp(g.size + gauss() * 0.4 * rate, 5.5, 14), speed: clamp(g.speed + gauss() * 0.05 * rate, 0.6, 1.5),
    sense: clamp(g.sense + gauss() * 8 * rate, 60, 280), hue: base + clamp(g.hue - base + gauss() * 3, -16, 16) };
}
function think(c) {
  const w = c.g.w, inp = c.inp, hid = c.hid, out = c.out;
  for (let h = 0; h < NH; h++) { let s = w[HB + h]; for (let i = 0; i < NI; i++) s += w[h * NI + i] * inp[i]; hid[h] = Math.tanh(s); }
  for (let o = 0; o < NO; o++) { let s = w[OB + o]; for (let h = 0; h < NH; h++) s += w[HO + o * NH + h] * hid[h]; out[o] = Math.tanh(s); }
}

// ---------- body parts ----------
const PARTS = [
  { k: 'seg', name: 'Body segment', max: 6, cost: lv => 6 + lv * 5, desc: 'More health and energy storage. Longer bodies turn slower', best: 'surviving fights and long trips' },
  { k: 'fins', name: 'Fins', max: 3, cost: lv => 10 + lv * 8, desc: 'Swim faster and turn sharper', best: 'catching prey and escaping' },
  { k: 'eyes', name: 'Eyes', max: 3, cost: lv => 8 + lv * 6, desc: 'See further, even in the dark deep', best: 'finding food and spotting hunters' },
  { k: 'spikes', name: 'Spikes', max: 2, cost: lv => 14 + lv * 10, desc: 'Anything that bites you gets hurt', best: 'putting predators off' },
  { k: 'armour', name: 'Armour plates', max: 2, cost: lv => 14 + lv * 10, desc: 'Take 25% less damage per level. A little slower', best: 'winning long fights' },
  { k: 'tail', name: 'Tail fluke', max: 1, cost: () => 20, desc: 'Unlocks Dash, a burst of speed', best: 'escaping and ambushing' },
  { k: 'legs', name: 'Legs', max: 1, cost: () => 60, desc: 'Breathe and walk on the shore. Slower swimmer', best: 'leaving the sea, the final goal' },
];
const lvOf = (d, p) => p.k === 'seg' ? d.seg - 2 : d[p.k];
const maxOf = p => p.k === 'seg' ? 4 : p.max;
const MOUTHS = {
  grazer: { name: 'Grazer', plant: 1, meat: 0.25, bite: 0, desc: 'Eats plants. Cannot bite' },
  omni: { name: 'Beak', plant: 0.7, meat: 0.7, bite: 6, desc: 'Eats anything. Weak bite' },
  jaws: { name: 'Jaws', plant: 0.25, meat: 1, bite: 11, desc: 'Eats meat. Strong bite' },
};
const MOUTH_COST = 12;
const partCount = d => (d.seg - 2) + d.fins + d.eyes + d.spikes + d.armour + d.tail + d.legs + 1;
const DEF = [
  { name: 'Your species', hue: 165 },
  { name: 'Grazers', hue: 95, d: { seg: 5, fins: 0, eyes: 0, spikes: 0, armour: 1, tail: 0, legs: 0, mouth: 'grazer' } },
  { name: 'Snappers', hue: 8, d: { seg: 3, fins: 1, eyes: 1, spikes: 0, armour: 0, tail: 0, legs: 0, mouth: 'jaws' } },
  { name: 'Drifters', hue: 285, d: { seg: 3, fins: 0, eyes: 1, spikes: 1, armour: 0, tail: 0, legs: 0, mouth: 'omni' } },
];
function playerDesign() {
  const lv = carry ? carry.lv : {}, h = k => Math.min(2, Math.ceil((lv[k] || 0) / 2));
  return { seg: 3, fins: h('flag'), eyes: h('eye'), spikes: h('spike'), armour: h('shell'), tail: 0, legs: 0, mouth: (lv.spike || 0) >= 2 ? 'jaws' : 'omni' };
}
function stats(S) {
  const d = S.d;
  S.st = {
    speed: 1.5 * (1 + 0.12 * d.fins) * (1 - 0.04 * Math.max(0, d.seg - 3)) * (1 - 0.05 * d.armour) * (d.legs ? 0.9 : 1),
    turn: 0.11 * (1 + 0.15 * d.fins) * (1 - 0.05 * Math.max(0, d.seg - 3)),
    sense: 1 + 0.3 * d.eyes, hp: 20 + 10 * d.seg + 12 * d.armour, eMax: 50 + 20 * d.seg,
    cost: (0.008 + 0.0025 * d.seg + 0.0015 * (d.fins + d.eyes + d.spikes + d.armour + d.tail + d.legs)) * S.metab,
    repro: 0.8 - S.reproBonus, m: MOUTHS[d.mouth],
  };
}
function buyPart(S, p) {
  const lv = lvOf(S.d, p); if (lv >= maxOf(p)) return false;
  const cost = p.cost(lv); if (S.dna < cost) return false;
  S.dna -= cost; S.d[p.k]++; stats(S); return true;
}

// ---------- state ----------
let animals, food, nextId, tick, speedIdx = 0, paused = false, tool = 'swim', selected = null, avatar = null, effects, flags;
let species, ev, nextEv, evOrder, survived, won, lost, respawnAt, shoreT, apex;
const SPEEDS = [1, 3, 8], GRACE = 3600;
const baseTime = carry ? carry.time : 600;

function makeAnimal(g, x, y, gen, sp, e) {
  const S = species[sp], st = S.st;
  const c = {
    id: nextId++, g, sp, x, y, a: Math.random() * Math.PI * 2, e: e ?? st.eMax * 0.5, hp: st.hp, age: 0, gen, maxAge: 5000 + Math.random() * 2500,
    segs: [], hid: new Float32Array(NH), out: new Float32Array(NO), inp: new Float32Array(NI),
    eaten: 0, kills: 0, kids: 0, dead: false, phase: Math.random() * 10, thrust: 0, biteCd: 0, dashT: 0, dashCd: 0,
  };
  for (let i = 0; i < S.d.seg; i++) c.segs.push({ x: x - Math.cos(c.a) * i * g.size * 1.3, y: y - Math.sin(c.a) * i * g.size * 1.3 });
  return c;
}
function addFood(x, y, t, e) {
  if (t === 0 && plantCount >= PLANT_MAX) return;
  if (t === 1 && food.length - plantCount >= MEAT_MAX) return;
  food.push({ x: clamp(x, 5, W - 5), y: clamp(y, 5, H - 5), t, e: e || (t ? 20 : 12), dead: false, r: t ? 2.6 + Math.random() : 2 + Math.random() * 1.5, rot: Math.random() * 6.28 });
  if (t === 0) plantCount++;
}
let plantCount = 0;
function spawnPlant() {
  const r = Math.random();
  const y = r < 0.55 ? SHORE + Math.random() * (SHALLOW - SHORE) : r < 0.92 ? SHALLOW + Math.random() * (REEF - SHALLOW) : REEF + Math.random() * (H - REEF);
  addFood(Math.random() * W, y, 0);
}
function newSpecies() {
  const lv = carry ? carry.lv : {};
  species = DEF.map((def, i) => {
    const S = { ...def, i, d: i ? { ...def.d } : playerDesign(), dna: i ? 0 : 15, kills: 0, count: 0, maxGen: 0, extinct: false,
      metab: i ? 1 : 1 - 0.06 * (lv.metab || 0), reproBonus: i ? 0 : 0.03 * (lv.split || 0) };
    stats(S); return S;
  });
}
function seedSpecies(S, n, cx, cy) {
  for (let k = 0; k < n; k++) {
    const g = S.i === 0 && carry && carry.genomes && carry.genomes.length ? carriedGenome() : randomGenome(S.hue);
    animals.push(makeAnimal(g, clamp(cx + rnd(220), 30, W - 30), clamp(cy + rnd(160), SHORE + 30, H - 30), 0, S.i));
  }
}
function newGame() {
  animals = []; food = []; plantCount = 0; nextId = 1; tick = 0; effects = []; flags = {};
  selected = null; avatar = null; ev = null; nextEv = 2600; survived = 0; won = false; lost = false; respawnAt = 0; shoreT = 0;
  evOrder = ['redtide', 'hunter', 'cold', 'storm'].sort(() => Math.random() - 0.5); evOrder.splice(2, 0, 'plague');
  GOALS.forEach(g => g.done = false);
  newSpecies();
  for (let i = 0; i < PLANT_MAX * 0.7; i++) spawnPlant();
  // each species starts in its own part of the sea
  const homes = [[W * 0.3, 650], [W * 0.75, 620], [W * 0.25, 1250], [W * 0.7, 1300]];
  species.forEach((S, i) => seedSpecies(S, 24, homes[i][0], homes[i][1]));
  apex = makeApex();
  possess(animals.find(c => c.sp === 0));
  select(null); closeEditor();
}

// ---------- the deep hunter ----------
function makeApex() {
  const a = { x: W / 2, y: H - 200, a: 0, hp: 420, maxHp: 420, r: 20, biteCd: 0, phase: 0, dead: false, respawnAt: 0, segs: [] };
  for (let i = 0; i < 8; i++) a.segs.push({ x: a.x - i * 26, y: a.y });
  return a;
}
function stepApex() {
  const A = apex;
  if (A.dead) { if (tick >= A.respawnAt) { apex = makeApex(); toast('Another hunter has risen from the deep.'); } return; }
  const hunting = ev && ev.type === 'hunter', yMin = hunting ? SHORE + 120 : REEF - 80;
  A.phase += 0.08; A.biteCd--;
  let best = null, bd = hunting ? 520 : 380;
  for (const c of animals) { if (c.dead || c.y < yMin - 60) continue; const d = Math.hypot(c.x - A.x, c.y - A.y); if (d < bd) { bd = d; best = c; } }
  const ta = best ? Math.atan2(best.y - A.y, best.x - A.x) : A.a + Math.sin(tick * 0.01) * 0.3;
  A.a += clamp(angTo(A.a, Math.cos(ta), Math.sin(ta)), -0.05, 0.05);
  const v = (best ? 1.35 : 0.7) * (hunting ? 1.15 : 1);
  A.x += Math.cos(A.a) * v; A.y += Math.sin(A.a) * v;
  if (A.x < 40 || A.x > W - 40) { A.a = Math.PI - A.a; A.x = clamp(A.x, 40, W - 40); }
  if (A.y < yMin || A.y > H - 40) { A.a = -A.a; A.y = clamp(A.y, yMin, H - 40); }
  followSegs(A.segs, A.x, A.y, 26);
  if (A.biteCd <= 0) for (const c of animals) {
    if (c.dead) continue;
    if (Math.hypot(c.x - A.x, c.y - A.y) < A.r + c.g.size + 6) {
      const S = species[c.sp];
      c.hp -= 24 * (1 - 0.25 * S.d.armour); A.hp -= 7 * S.d.spikes; A.biteCd = 35;
      effects.push({ x: c.x, y: c.y, t: 0, kind: 'bite', hue: c.g.hue });
      if (c === avatar && !flags.apexBit) { flags.apexBit = true; toast('The deep hunter bit you. Swim for shallower water.'); }
      break;
    }
  }
  if (A.hp <= 0) killApex(null);
}
function killApex(by) {
  apex.dead = true; apex.respawnAt = tick + 3600;
  for (let i = 0; i < 12; i++) addFood(apex.x + rnd(60), apex.y + rnd(60), 1, 22);
  if (by) { const S = species[by.sp]; S.dna += by === avatar ? 40 : 25; S.kills += 3; by.kills += 3; }
  toast(by && by.sp === 0 ? 'You killed the deep hunter! +40 DNA and a feast.' : by ? `${species[by.sp].name} killed the deep hunter.` : 'The deep hunter has died.', true);
}

// ---------- spatial grid (bounded world) ----------
const gc = Math.ceil(W / G), gr = Math.ceil(H / G);
let gridF, gridA;
function buildGrid() {
  gridF = Array.from({ length: gc * gr }, () => []); gridA = Array.from({ length: gc * gr }, () => []);
  const at = o => clamp(Math.floor(o.y / G), 0, gr - 1) * gc + clamp(Math.floor(o.x / G), 0, gc - 1);
  for (const f of food) if (!f.dead) gridF[at(f)].push(f);
  for (const c of animals) if (!c.dead) gridA[at(c)].push(c);
}
function nearest(c, grid, R, ok) {
  const cr = Math.ceil(R / G), cx = Math.floor(c.x / G), cy = Math.floor(c.y / G);
  let best = null, bd = R * R, bdx = 0, bdy = 0;
  for (let j = Math.max(0, cy - cr); j <= Math.min(gr - 1, cy + cr); j++) for (let i = Math.max(0, cx - cr); i <= Math.min(gc - 1, cx + cr); i++) {
    for (const o of grid[j * gc + i]) {
      if (o.dead || o === c || (ok && !ok(o))) continue;
      const dx = o.x - c.x, dy = o.y - c.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = o; bdx = dx; bdy = dy; }
    }
  }
  return best ? { o: best, d: Math.sqrt(bd), dx: bdx, dy: bdy } : null;
}
function followSegs(segs, x, y, gap) {
  segs[0].x = x; segs[0].y = y;
  for (let i = 1; i < segs.length; i++) {
    const p = segs[i - 1], s = segs[i], dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1;
    if (d > gap) { s.x = p.x - dx / d * gap; s.y = p.y - dy / d * gap; }
  }
}

// ---------- hazards and events ----------
const EVENTS = {
  redtide: { title: 'Red tide', warn: 'Toxic algae are blooming. Watch for the red water.', text: 'Toxic water drains energy and kills the plants inside it.' },
  hunter: { title: 'The hunter rises', warn: 'Something is stirring in the deep.', text: 'The deep hunter has come up into shallower water.' },
  cold: { title: 'Cold current', warn: 'The water is getting colder.', text: 'Plants grow slowly and every creature burns more energy.' },
  storm: { title: 'Storm surge', warn: 'A storm is building above the sea.', text: 'Strong currents push everything in the shallows and reef.' },
  plague: { title: 'Plague', warn: 'A disease is coming. It hits the most crowded species hardest.', text: 'A disease is spreading through the most crowded species.' },
};
function hazard(c) {
  let d = 0;
  if (apex && !apex.dead) d = Math.max(d, clamp(1 - (Math.hypot(c.x - apex.x, c.y - apex.y) - apex.r) / 260, 0, 1));
  if (ev && ev.type === 'redtide') { const k = Math.hypot(c.x - ev.x, c.y - ev.y); if (k < ev.r) d = Math.max(d, 1 - k / ev.r); }
  if (c.y < SHORE && !species[c.sp].d.legs) d = Math.max(d, 0.6);
  return d;
}
function startEvent() {
  const type = evOrder[survived % evOrder.length];
  ev = { type, t0: tick, dur: 1900 };
  if (type === 'redtide') {
    const mine = animals.filter(c => !c.dead && c.sp === 0 && c.y > SHORE); const p = mine[Math.floor(Math.random() * mine.length)];
    ev.x = p ? p.x : W / 2; ev.y = p ? clamp(p.y, SHORE + 200, REEF) : SHALLOW; ev.r = 380;
  }
  if (type === 'storm') { const a = Math.random() * 6.28; ev.cx = Math.cos(a) * 0.8; ev.cy = Math.sin(a) * 0.4; }
  if (type === 'hunter' && apex.dead) apex = makeApex();
  if (type === 'plague') {
    const big = species.reduce((a, S) => S.count > a.count ? S : a); ev.target = big.i;
    toast(`Plague! ${big.i ? big.name + ' are' : 'Your species is'} the most crowded and getting sick.`, true);
  }
}
function endEvent() {
  for (const S of species) if (S.count > 0) S.dna += 10;
  if (species[0].count > 0) { survived++; toast(`You survived the ${EVENTS[ev.type].title.toLowerCase()}. +10 DNA.`); }
  ev = null; nextEv = tick + 3000;
  for (const S of species) if (S.i && S.extinct && species[0].count > 0) {
    S.extinct = false; S.dna = 0; S.strain = (S.strain || 1) + 1;
    seedSpecies(S, 12, Math.random() * W, SHALLOW + Math.random() * (REEF - SHALLOW));
    toast(`A new strain of ${S.name} has swum in from the open ocean.`);
  }
}

// ---------- simulation ----------
const keys = {};
let steer = null, dashReq = false, botPlayer = false;
function step() {
  tick++;
  const cold = ev && ev.type === 'cold';
  let rate = 1.8 * (cold ? 0.3 : 1);
  while (rate > 0) { if (Math.random() < rate) spawnPlant(); rate -= 1; }
  if (Math.random() < 0.12) addFood(Math.random() * W, REEF + 100 + Math.random() * (H - REEF - 120), 1, 12); // marine snow in the deep
  if (ev && ev.type === 'redtide' && tick % 30 === 0) for (const f of food) if (!f.dead && f.t === 0 && Math.hypot(f.x - ev.x, f.y - ev.y) < ev.r * 0.8 && Math.random() < 0.2) { f.dead = true; plantCount--; }
  buildGrid();
  const born = [];
  for (const c of animals) {
    if (c.dead) continue;
    const S = species[c.sp], st = S.st, g = c.g, m = st.m, inp = c.inp;
    while (c.segs.length < S.d.seg) { const t = c.segs[c.segs.length - 1]; c.segs.push({ x: t.x, y: t.y }); }
    while (c.segs.length > S.d.seg) c.segs.pop();
    const dark = c.y > REEF ? (S.d.eyes >= 2 ? 0.9 : 0.6) : 1;
    const sense = g.sense * st.sense * dark;
    const nf = nearest(c, gridF, sense, f => (f.t ? m.meat : m.plant) >= 0.5);
    const na = nearest(c, gridA, sense, null);
    const danger = hazard(c);
    inp[0] = nf ? angTo(c.a, nf.dx, nf.dy) / Math.PI : 0;
    inp[1] = nf ? 1 - nf.d / sense : 0;
    inp[2] = na ? angTo(c.a, na.dx, na.dy) / Math.PI : 0;
    inp[3] = na ? 1 - na.d / sense : 0;
    inp[4] = na ? Math.tanh((na.o.g.size * na.o.segs.length - g.size * c.segs.length) / (g.size * c.segs.length) * 2) : 0;
    inp[5] = na ? (na.o.sp === c.sp ? 1 : -1) : 0;
    inp[6] = danger;
    inp[7] = c.e / st.eMax;
    inp[8] = 1;
    inp[9] = Math.sin(c.age * 0.05);
    inp[10] = c.thrust;
    inp[11] = c.hp / st.hp;
    inp[12] = c.y / H;
    let wantBite;
    if (c === avatar) {
      let want = null, thrust = 0.15;
      const kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), ky = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      if (kx || ky) { want = Math.atan2(ky, kx); thrust = 1; }
      else if (steer) { const dx = steer.x - c.x, dy = steer.y - c.y, d = Math.hypot(dx, dy); if (d > g.size) { want = Math.atan2(dy, dx); thrust = clamp(d / 60, 0.35, 1); } }
      const tmax = st.turn * 1.8, turn = want === null ? 0 : clamp(angTo(c.a, Math.cos(want), Math.sin(want)), -tmax, tmax);
      think(c);
      c.a += turn; c.thrust = thrust; wantBite = true;
      c.out[0] = turn / tmax; c.out[1] = thrust * 2 - 1; c.out[2] = 1;
      if (dashReq && S.d.tail && c.dashCd <= 0) { c.dashT = 45; c.dashCd = 300; effects.push({ x: c.x, y: c.y, t: 0, kind: 'dash' }); }
      dashReq = false;
    } else {
      think(c);
      c.a += c.out[0] * st.turn;
      c.thrust = (c.out[1] + 1) / 2;
      wantBite = c.out[2] > 0.3;
      if (S.d.tail && c.dashCd <= 0 && danger > 0.4 && c.out[1] > 0.6) { c.dashT = 45; c.dashCd = 300; }
    }
    if (c.dashT > 0) c.dashT--; if (c.dashCd > 0) c.dashCd--; if (c.biteCd > 0) c.biteCd--;
    const v = c.thrust * g.speed * st.speed * (c.dashT > 0 ? 2.6 : 1);
    c.x += Math.cos(c.a) * v; c.y += Math.sin(c.a) * v;
    if (ev && ev.type === 'storm' && c.y < REEF) { c.x += ev.cx; c.y += ev.cy; }
    if (c.x < 15 || c.x > W - 15) { c.a = Math.PI - c.a; c.x = clamp(c.x, 15, W - 15); }
    if (c.y < 8 || c.y > H - 15) { c.a = -c.a; c.y = clamp(c.y, 8, H - 15); }
    followSegs(c.segs, c.x, c.y, g.size * 1.25);
    c.phase += 0.12 + v * 0.2;
    c.e -= st.cost * (cold ? 1.2 : 1) * (S.count < 15 ? 0.65 : 1) + c.thrust * c.thrust * 0.006 * st.speed * g.size / 9 + (c.dashT > 0 ? 0.05 : 0) + sense * 0.00002;
    if (ev && ev.type === 'redtide') { const k = Math.hypot(c.x - ev.x, c.y - ev.y); if (k < ev.r) c.e -= (1 - k / ev.r) * 0.25; }
    if (c.y < SHORE && !S.d.legs) { c.e -= 0.15; c.hp -= 0.08; }
    if (c.e > st.eMax * 0.5 && c.hp < st.hp) c.hp += 0.03;
    c.age++;
    if (nf && nf.d < g.size + 7 && !nf.o.dead) {
      const f = nf.o; f.dead = true; if (f.t === 0) plantCount--;
      c.e = Math.min(st.eMax, c.e + f.e * (f.t ? m.meat : m.plant)); c.eaten++;
      S.dna += c === avatar ? 1 : 0.05;
    }
    // biting
    if (m.bite && wantBite && c.biteCd <= 0 && c.e < st.eMax * 0.85) {
      if (na && na.o.sp !== c.sp && na.d < g.size + na.o.g.size * 1.3) {
        const t = na.o, T = species[t.sp];
        t.hp -= m.bite * (g.size / 9) * (1 - 0.25 * T.d.armour);
        c.hp -= 3 * T.d.spikes; c.biteCd = 20;
        effects.push({ x: t.x, y: t.y, t: 0, kind: 'bite', hue: t.g.hue });
        if (t === avatar && !flags.bitten) { flags.bitten = true; toast(`${S.name} are biting you. Fight back or swim away.`); }
        if (t.hp <= 0) {
          c.kills++; S.kills++; S.dna += c === avatar ? 6 : 0.6; c.e = Math.min(st.eMax, c.e + 12);
          if (t === avatar) toast(`Your creature was killed by ${S.name}.`);
          die(t);
          if (!flags.firstKill) { flags.firstKill = true; toast('The first kill in the sea. Its body is left as meat.', true); }
        }
      } else if (apex && !apex.dead && Math.hypot(apex.x - c.x, apex.y - c.y) < g.size + apex.r + 4) {
        apex.hp -= m.bite * (g.size / 9); c.biteCd = 25; effects.push({ x: apex.x, y: apex.y, t: 0, kind: 'bite', hue: 260 });
        if (apex.hp <= 0) killApex(c);
      }
    }
    if (c.e > st.eMax * st.repro && c.age > 400 && c.hp > st.hp * 0.6) {
      c.e /= 2; c.kids++;
      const tail = c.segs[c.segs.length - 1];
      const k = makeAnimal(mutate(g, S.hue), tail.x + rnd(6), tail.y + rnd(6), c.gen + 1, c.sp, c.e);
      k.a = c.a + Math.PI; born.push(k);
      if (k.gen > S.maxGen) { S.maxGen = k.gen; if (c.sp === 0 && S.maxGen % 5 === 0) toast(`Your species reached generation ${S.maxGen}.`); }
    }
    if (c.e <= 0 || c.hp <= 0 || c.age > c.maxAge) die(c);
  }
  if (born.length) animals.push(...born);
  if (apex) stepApex();
  if (ev && ev.type === 'plague' && tick % 20 === 0) for (const c of animals) if (!c.dead && c.sp === ev.target && c !== avatar && Math.random() < 0.025) die(c, true);
  if (tick % 30 === 0) { animals = animals.filter(c => !c.dead); food = food.filter(f => !f.dead); }
  if (avatar && !avatar.dead && species[0].d.legs && avatar.y < SHORE) {
    shoreT++;
    if (!flags.landed) { flags.landed = true; toast('Your creature is walking on land!', true); }
  }
  if (tick % 10 === 0) {
    for (const S of species) S.count = 0;
    for (const c of animals) if (!c.dead) species[c.sp].count++;
    for (const S of species) {
      if (tick < GRACE && S.count < 5) seedSpecies(S, 1, Math.random() * W, SHALLOW);
      else if (S.count === 0 && !S.extinct && tick >= GRACE) { S.extinct = true; if (S.i) toast(`${S.name} have gone extinct.`, true); }
    }
    if (species[0].extinct && !lost) { lost = true; setTimeout(gameOver, 600); }
  }
  if (tick % 300 === 0) for (const S of species) if ((S.i || botPlayer) && !S.extinct) {
    const opts = PARTS.filter(p => p.k !== 'legs' && lvOf(S.d, p) < maxOf(p)); if (opts.length) buyPart(S, opts[Math.floor(Math.random() * opts.length)]);
  }
  if (!ev && tick >= nextEv) startEvent();
  if (ev && tick > ev.t0 + ev.dur) endEvent();
  if ((!avatar || avatar.dead) && respawnAt && tick >= respawnAt) {
    const mine = animals.filter(c => !c.dead && c.sp === 0);
    if (mine.length) { possess(mine.sort((a, b) => b.hp + b.e - a.hp - a.e)[0]); toast('You took control of another of your creatures.'); }
    respawnAt = 0;
  }
}
function die(c, quiet) {
  if (c.dead) return;
  c.dead = true;
  for (const s of c.segs) addFood(s.x + rnd(4), s.y + rnd(4), 1, 14);
  if (!quiet) effects.push({ x: c.x, y: c.y, t: 0, kind: 'death', hue: c.g.hue });
  if (c === avatar) { avatar = null; respawnAt = tick + 90; }
  if (selected === c) setTimeout(() => { if (selected === c) select(null); }, 900);
}

// ---------- player actions ----------
function possess(c) { avatar = c || null; if (c) respawnAt = 0; }
function spend(n) { const S = species[0]; if (S.dna < n) { toast(`You need ${n} DNA. Eat and win fights to earn it.`); return false; } S.dna -= n; return true; }
function cull(c) {
  if (!c || c.dead) return;
  if (c.sp !== 0 && !spend(3)) return;
  effects.push({ x: c.x, y: c.y, t: 0, kind: 'cull', hue: c.g.hue }); die(c, true);
}
function favour(c) { if (!c || c.dead || !spend(1)) return; const st = species[0].st; c.e = Math.min(st.eMax, c.e + st.eMax * 0.3); c.hp = st.hp; effects.push({ x: c.x, y: c.y, t: 0, kind: 'favour' }); }

// ---------- goals ----------
const total = () => species.reduce((a, S) => a + S.count, 0) || 1;
const GOALS = [
  { t: 'Build a body with 8 parts', v: () => partCount(species[0].d), max: 8 },
  { t: 'Reach generation 15', v: () => species[0].maxGen, max: 15 },
  { t: 'Win 15 fights', v: () => species[0].kills, max: 15 },
  { t: 'Survive 3 disasters', v: () => survived, max: 3 },
  { t: 'Grow legs and walk on the shore', v: () => shoreT / 60, max: 5, fmt: v => v.toFixed(1) + 's' },
];
$('goalList').innerHTML = GOALS.map((g, i) => `<div class="goal" id="g${i}"><span>${g.t}</span><span></span><div class="bar"><i></i></div></div>`).join('');
function renderGoals() {
  let all = true;
  GOALS.forEach((g, i) => {
    const v = g.v(), el = $('g' + i);
    if (v >= g.max) g.done = true;
    el.classList.toggle('done', !!g.done);
    el.children[1].textContent = g.done ? 'done' : (g.fmt ? g.fmt(v) : Math.floor(v)) + ' / ' + (g.fmt ? g.fmt(g.max) : g.max);
    el.querySelector('i').style.width = (g.done ? 100 : clamp(v / g.max, 0, 1) * 100) + '%';
    if (!g.done) all = false;
  });
  if (all && !won && !lost) { won = true; victory(); }
}

// ---------- camera and background ----------
let dpr = 1, zClose = 1, zMap = 1, mapView = false, bg;
const cam = { x: W / 2, y: H / 2, z: 1 };
const kelp = [], rays = [];
for (let i = 0; i < 150; i++) { const y = SHALLOW - 100 + Math.random() * (REEF - SHALLOW + 150); kelp.push({ x: Math.random() * W, y, h: 50 + Math.random() * 110, ph: Math.random() * 6, w: 2 + Math.random() * 2.5, hue: 100 + Math.random() * 50 }); }
for (let i = 0; i < 9; i++) rays.push({ x: Math.random() * W, w: 60 + Math.random() * 140, ph: Math.random() * 6 });
function fit() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  zClose = clamp(Math.min(innerWidth, innerHeight) / 560, 0.75, 1.5);
  zMap = Math.min(innerWidth / W, innerHeight / H);
}
function buildBg() {
  const s = 4; bg = document.createElement('canvas'); bg.width = W / s; bg.height = H / s;
  const b = bg.getContext('2d'), bw = bg.width, bh = bg.height;
  const gr = b.createLinearGradient(0, 0, 0, bh);
  gr.addColorStop(0, '#8d7f5c'); gr.addColorStop(SHORE / H * 0.85, '#7d7655'); gr.addColorStop(SHORE / H, '#2f7d74');
  gr.addColorStop(SHALLOW / H, '#1a5a62'); gr.addColorStop(REEF / H, '#0d2d3d'); gr.addColorStop(1, '#02070c');
  b.fillStyle = gr; b.fillRect(0, 0, bw, bh);
  // sand ripples on the shore
  b.strokeStyle = 'rgba(230,210,160,0.18)'; b.lineWidth = 1;
  for (let y = 4; y < SHORE / s; y += 5) { b.beginPath(); for (let x = 0; x <= bw; x += 6) b.lineTo(x, y + Math.sin(x * 0.08 + y) * 1.5); b.stroke(); }
  // rocks and coral on the reef
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * bw, y = (SHALLOW + Math.random() * (REEF - SHALLOW + 200)) / s, r = 4 + Math.random() * 14;
    b.fillStyle = `rgba(${10 + Math.random() * 20},${30 + Math.random() * 25},${38 + Math.random() * 20},0.75)`;
    b.beginPath(); b.ellipse(x, y, r * 1.4, r, Math.random(), 0, 7); b.fill();
    if (y * s < REEF) for (let k = 0; k < 4; k++) { b.fillStyle = `hsla(${[350, 20, 300, 40][k]},45%,${45 + Math.random() * 15}%,0.35)`; b.beginPath(); b.arc(x + rnd(r), y - r * 0.5 + rnd(r * 0.5), 1.5 + Math.random() * 2.5, 0, 7); b.fill(); }
  }
  for (let i = 0; i < 1800; i++) { b.fillStyle = `rgba(200,230,220,${Math.random() * 0.05})`; b.beginPath(); b.arc(Math.random() * bw, Math.random() * bh, Math.random() * 1.6, 0, 7); b.fill(); }
}
fit(); buildBg();
addEventListener('resize', () => { if (!stopped) fit(); });
const scale = () => cam.z * dpr;
function updateCamera() {
  const tz = mapView ? zMap : zClose;
  cam.z += (tz - cam.z) * 0.1;
  const follow = !mapView && avatar && !avatar.dead;
  let tx = follow ? avatar.x : W / 2, ty = follow ? avatar.y : H / 2;
  const hw = cv.width / 2 / scale(), hh = cv.height / 2 / scale();
  tx = hw * 2 >= W ? W / 2 : clamp(tx, hw, W - hw); ty = hh * 2 >= H ? H / 2 : clamp(ty, hh, H - hh);
  cam.x += (tx - cam.x) * 0.14; cam.y += (ty - cam.y) * 0.14;
}

// ---------- drawing creatures ----------
function drawAnimal(g2, c, S) {
  const d = S.d, r = c.g.size, n = c.segs.length, hue = c.g.hue, ph = c.phase;
  for (let i = n - 1; i >= 0; i--) {
    const p = c.segs[i], q = i ? c.segs[i - 1] : null;
    const ang = q ? Math.atan2(q.y - p.y, q.x - p.x) : c.a;
    const rr = r * (i === 0 ? 1 : 1 - i / (n + 1) * 0.45);
    g2.save(); g2.translate(p.x, p.y); g2.rotate(ang);
    if (d.legs && i > 0) {
      g2.strokeStyle = `hsla(${hue},35%,55%,0.85)`; g2.lineWidth = Math.max(1, rr * 0.22); g2.beginPath();
      for (const side of [-1, 1]) { const sw = Math.sin(ph * 0.8 + i * 1.7 + (side > 0 ? 0 : Math.PI)) * 0.5; g2.moveTo(0, side * rr * 0.7); g2.lineTo(Math.cos(sw) * rr * 0.4, side * rr * 1.5); g2.lineTo(Math.cos(sw) * rr * 0.9 + rr * 0.3, side * rr * 1.9); }
      g2.stroke();
    }
    if (i >= 1 && i <= d.fins) {
      const flap = Math.sin(ph + i) * 0.35;
      g2.fillStyle = `hsla(${hue},55%,70%,0.45)`;
      for (const side of [-1, 1]) { g2.beginPath(); g2.moveTo(rr * 0.4, side * rr * 0.6); g2.lineTo(-rr * 0.9, side * rr * (1.9 + flap * side)); g2.lineTo(-rr * 0.5, side * rr * 0.6); g2.closePath(); g2.fill(); }
    }
    if (i === n - 1) {
      g2.fillStyle = `hsla(${hue},55%,65%,0.6)`; g2.beginPath();
      if (d.tail) { const sw = Math.sin(ph * 1.2) * rr * 0.6; g2.moveTo(-rr * 0.6, 0); g2.lineTo(-rr * 2.4, -rr * 1.3 + sw); g2.lineTo(-rr * 1.9, sw * 0.5); g2.lineTo(-rr * 2.4, rr * 1.3 + sw); }
      else { g2.moveTo(-rr * 0.5, -rr * 0.4); g2.lineTo(-rr * 1.6, Math.sin(ph) * rr * 0.3); g2.lineTo(-rr * 0.5, rr * 0.4); }
      g2.closePath(); g2.fill();
    }
    if (d.spikes) {
      g2.strokeStyle = `hsla(${hue},30%,88%,0.75)`; g2.lineWidth = 1; g2.beginPath();
      for (const side of [-1, 1]) for (const k of [-0.4, 0.4]) { g2.moveTo(k * rr, side * rr * 0.8); g2.lineTo(k * rr - rr * 0.3, side * rr * (1.35 + d.spikes * 0.2)); }
      g2.stroke();
    }
    g2.fillStyle = `hsla(${hue},${i ? 50 : 58}%,${i ? 46 : 52}%,0.85)`;
    g2.beginPath(); g2.ellipse(0, 0, rr * 1.15, rr * 0.92, 0, 0, Math.PI * 2); g2.fill();
    g2.fillStyle = `hsla(${hue},60%,75%,0.25)`; g2.beginPath(); g2.ellipse(rr * 0.15, -rr * 0.3, rr * 0.7, rr * 0.35, 0, 0, Math.PI * 2); g2.fill();
    g2.strokeStyle = d.armour ? `hsla(${hue},20%,85%,${0.45 + d.armour * 0.2})` : `hsla(${hue},70%,80%,0.45)`;
    g2.lineWidth = 0.8 + d.armour * 1.1; g2.beginPath(); g2.ellipse(0, 0, rr * 1.15, rr * 0.92, 0, 0, Math.PI * 2); g2.stroke();
    if (d.armour) { g2.beginPath(); g2.moveTo(-rr * 0.2, -rr * 0.85); g2.quadraticCurveTo(rr * 0.15, 0, -rr * 0.2, rr * 0.85); g2.stroke(); }
    if (i === 0) {
      const eyes = 1 + d.eyes;
      for (let k = 0; k < eyes; k++) {
        const ey = (k - (eyes - 1) / 2) * rr * 0.42, ex = rr * (0.45 - Math.abs(ey) / rr * 0.2);
        g2.fillStyle = '#0b1416'; g2.beginPath(); g2.arc(ex, ey, rr * 0.17, 0, 7); g2.fill();
        g2.fillStyle = 'rgba(255,255,240,0.8)'; g2.beginPath(); g2.arc(ex + rr * 0.05, ey - rr * 0.05, rr * 0.06, 0, 7); g2.fill();
      }
      g2.strokeStyle = `hsla(${hue},30%,90%,0.85)`; g2.fillStyle = `hsla(${hue},30%,90%,0.85)`; g2.lineWidth = Math.max(1, rr * 0.14);
      if (d.mouth === 'jaws') { const o = 0.25 + Math.abs(Math.sin(ph * 0.7)) * 0.3; g2.beginPath(); g2.moveTo(rr * 0.9, -rr * 0.3); g2.quadraticCurveTo(rr * 1.7, -rr * (0.3 + o), rr * 1.5, 0); g2.moveTo(rr * 0.9, rr * 0.3); g2.quadraticCurveTo(rr * 1.7, rr * (0.3 + o), rr * 1.5, 0); g2.stroke(); }
      else if (d.mouth === 'grazer') { for (let k = -2; k <= 2; k++) { g2.beginPath(); g2.arc(rr * 1.15, k * rr * 0.18, rr * 0.1, 0, 7); g2.fill(); } }
      else { g2.beginPath(); g2.moveTo(rr * 1.0, -rr * 0.25); g2.lineTo(rr * 1.55, 0); g2.lineTo(rr * 1.0, rr * 0.25); g2.closePath(); g2.fill(); }
    }
    g2.restore();
  }
}
function drawApex() {
  const A = apex, n = A.segs.length;
  for (let i = n - 1; i >= 0; i--) {
    const p = A.segs[i], q = i ? A.segs[i - 1] : null, ang = q ? Math.atan2(q.y - p.y, q.x - p.x) : A.a;
    const rr = A.r * (i === 0 ? 1.1 : 1 - i / (n + 2) * 0.6);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
    if (i > 0 && i < n - 1) { ctx.fillStyle = 'rgba(70,55,95,0.6)'; const fl = Math.sin(A.phase + i * 0.9) * 0.4; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(-rr * 0.2, s * rr * (1.1 + fl * s * 0.3), rr * 0.9, rr * 0.35, s * 0.4, 0, 7); ctx.fill(); } }
    ctx.fillStyle = i ? '#3b3150' : '#4a3c63'; ctx.beginPath(); ctx.ellipse(0, 0, rr * 1.2, rr, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(180,150,220,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    if (i === 0) {
      ctx.fillStyle = 'rgba(255,90,60,0.95)'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(rr * 0.5, s * rr * 0.45, rr * 0.13, 0, 7); ctx.fill(); }
      ctx.strokeStyle = 'rgba(230,220,240,0.9)'; ctx.lineWidth = 3; const o = Math.abs(Math.sin(A.phase)) * 0.5;
      ctx.beginPath(); ctx.moveTo(rr, -rr * 0.4); ctx.quadraticCurveTo(rr * 2.1, -rr * (0.6 + o), rr * 1.8, 0); ctx.moveTo(rr, rr * 0.4); ctx.quadraticCurveTo(rr * 2.1, rr * (0.6 + o), rr * 1.8, 0); ctx.stroke();
    }
    ctx.restore();
  }
}

function draw() {
  const Sc = scale(), Wc = cv.width, Hc = cv.height, t = performance.now() / 1000;
  const vx = Wc / 2 / Sc + 80, vy = Hc / 2 / Sc + 80, vis = (x, y) => Math.abs(x - cam.x) < vx && Math.abs(y - cam.y) < vy;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#02070c'; ctx.fillRect(0, 0, Wc, Hc);
  ctx.setTransform(Sc, 0, 0, Sc, Wc / 2 - cam.x * Sc, Hc / 2 - cam.y * Sc);
  ctx.drawImage(bg, 0, 0, W, H);
  // sunlight in the shallows
  for (const r of rays) {
    const x = r.x + Math.sin(t * 0.2 + r.ph) * 80, a = 0.05 + Math.sin(t * 0.5 + r.ph) * 0.025;
    const gr = ctx.createLinearGradient(0, SHORE, 0, REEF); gr.addColorStop(0, `rgba(220,255,240,${a})`); gr.addColorStop(1, 'rgba(220,255,240,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x, SHORE); ctx.lineTo(x + r.w, SHORE); ctx.lineTo(x + r.w + 260, REEF); ctx.lineTo(x + 260, REEF); ctx.fill();
  }
  if (ev && ev.type === 'redtide') {
    const gr = ctx.createRadialGradient(ev.x, ev.y, 0, ev.x, ev.y, ev.r);
    gr.addColorStop(0, 'rgba(200,40,50,0.38)'); gr.addColorStop(0.7, 'rgba(180,40,60,0.2)'); gr.addColorStop(1, 'rgba(160,30,60,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(ev.x, ev.y, ev.r, 0, 7); ctx.fill();
  }
  // kelp
  for (const k of kelp) {
    if (!vis(k.x, k.y)) continue;
    const sw = Math.sin(t * 0.8 + k.ph) * 14 + (ev && ev.type === 'storm' ? ev.cx * 30 : 0);
    ctx.strokeStyle = `hsla(${k.hue},45%,35%,0.7)`; ctx.lineWidth = k.w;
    ctx.beginPath(); ctx.moveTo(k.x, k.y); ctx.quadraticCurveTo(k.x + sw * 0.4, k.y - k.h * 0.5, k.x + sw, k.y - k.h); ctx.stroke();
  }
  // food
  ctx.fillStyle = 'rgba(120,210,110,0.8)'; ctx.beginPath();
  for (const f of food) { if (f.dead || f.t || !vis(f.x, f.y)) continue; ctx.moveTo(f.x + f.r * 1.6, f.y); ctx.ellipse(f.x, f.y, f.r * 1.6, f.r * 0.8, f.rot, 0, 7); }
  ctx.fill();
  ctx.fillStyle = 'rgba(215,95,85,0.85)'; ctx.beginPath();
  for (const f of food) { if (f.dead || !f.t || !vis(f.x, f.y)) continue; ctx.moveTo(f.x + f.r, f.y); ctx.arc(f.x, f.y, f.r, 0, 7); }
  ctx.fill();
  for (const c of animals) if (!c.dead && vis(c.x, c.y)) drawAnimal(ctx, c, species[c.sp]);
  if (apex && !apex.dead && vis(apex.x, apex.y)) drawApex();
  for (const e of effects) {
    e.t++; const p = e.t / 36;
    if (!vis(e.x, e.y)) continue;
    if (e.kind === 'bite') { ctx.strokeStyle = `rgba(255,140,120,${1 - p})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, 5 + p * 14, 0, 7); ctx.stroke(); }
    else if (e.kind === 'cull' || e.kind === 'death') { ctx.fillStyle = `hsla(${e.hue},40%,60%,${(1 - p) * 0.6})`; for (let k = 0; k < 10; k++) { const an = k * 0.63; ctx.beginPath(); ctx.arc(e.x + Math.cos(an) * p * 30, e.y + Math.sin(an) * p * 30, 2.2, 0, 7); ctx.fill(); } }
    else { ctx.strokeStyle = e.kind === 'favour' ? `rgba(232,196,106,${1 - p})` : `rgba(200,240,255,${1 - p})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, 6 + p * 40, 0, 7); ctx.stroke(); }
  }
  effects = effects.filter(e => e.t < 36);
  // darkness of the deep, with a pool of sight around your creature
  {
    const a = avatar && !avatar.dead ? avatar : null;
    const sight = a ? a.g.sense * species[0].st.sense * (species[0].d.eyes >= 2 ? 0.9 : 0.6) : 0;
    if (a && a.y > REEF - sight) {
      const gr = ctx.createRadialGradient(a.x, a.y, sight * 0.5, a.x, a.y, sight * 1.3);
      gr.addColorStop(0, 'rgba(1,5,9,0)'); gr.addColorStop(1, 'rgba(1,5,9,0.6)'); ctx.fillStyle = gr;
    } else ctx.fillStyle = 'rgba(1,5,9,0.6)';
    ctx.fillRect(0, REEF, W, H - REEF);
  }
  // surf line where the sea meets the shore
  ctx.strokeStyle = 'rgba(235,250,245,0.55)'; ctx.lineWidth = 3; ctx.beginPath();
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, SHORE + Math.sin(x * 0.02 + t * 1.5) * 6);
  ctx.stroke();
  const px = dpr / Sc;
  if (mapView) {
    ctx.font = `${14 * px}px "Chakra Petch", sans-serif`; ctx.fillStyle = 'rgba(215,235,230,0.7)'; ctx.textBaseline = 'top';
    [['SHORE', 20], ['SHALLOWS', SHORE + 20], ['REEF', SHALLOW + 20], ['DEEP', REEF + 20]].forEach(([l, y]) => ctx.fillText(l, 20, y));
    if (apex && !apex.dead) { ctx.strokeStyle = 'rgba(255,90,60,0.8)'; ctx.lineWidth = 3 * px; ctx.beginPath(); ctx.arc(apex.x, apex.y, 50, 0, 7); ctx.stroke(); }
  }
  if (avatar && !avatar.dead) {
    const a = avatar, st = species[0].st, r = a.g.size * 2.2 + 6;
    if (steer) { ctx.strokeStyle = 'rgba(232,196,106,0.3)'; ctx.lineWidth = 1.5 * px; ctx.setLineDash([3 * px, 5 * px]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(steer.x, steer.y); ctx.stroke(); ctx.setLineDash([]); }
    ctx.lineWidth = Math.max(2.5 * px, mapView ? 6 * px : 0);
    ctx.strokeStyle = 'rgba(232,196,106,0.2)'; ctx.beginPath(); ctx.arc(a.x, a.y, mapView ? 40 : r, 0, 7); ctx.stroke();
    const ef = clamp(a.e / st.eMax, 0, 1), hf = clamp(a.hp / st.hp, 0, 1);
    ctx.strokeStyle = ef < 0.25 ? 'rgba(255,122,138,0.95)' : 'rgba(232,196,106,0.95)';
    ctx.beginPath(); ctx.arc(a.x, a.y, mapView ? 40 : r, -Math.PI / 2, -Math.PI / 2 + ef * Math.PI * 2); ctx.stroke();
    if (!mapView) { ctx.strokeStyle = 'rgba(255,122,138,0.9)'; ctx.beginPath(); ctx.arc(a.x, a.y, r + 4 * px, -Math.PI / 2, -Math.PI / 2 + hf * Math.PI * 2); ctx.stroke(); }
  }
  if (selected && !selected.dead && selected !== avatar) { ctx.strokeStyle = 'rgba(215,235,230,0.8)'; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.arc(selected.x, selected.y, selected.g.size * 2.2 + 5, 0, 7); ctx.stroke(); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const vg = ctx.createRadialGradient(Wc / 2, Hc / 2, Math.min(Wc, Hc) * 0.4, Wc / 2, Hc / 2, Math.hypot(Wc, Hc) * 0.6);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, ev && ev.type === 'cold' ? 'rgba(150,200,255,0.35)' : 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, Wc, Hc);
}

// ---------- HUD ----------
const hsl = h => `hsl(${h},55%,58%)`;
$('share').innerHTML = DEF.map(d => `<span style="background:${hsl(d.hue)}"></span>`).join('');
function renderHud() {
  const me = species[0], tot = total();
  $('sTime').textContent = PR.fmtMyr(baseTime + tick * 0.05);
  $('sPop').textContent = me.count; $('sGen').textContent = me.maxGen; $('sDna').textContent = Math.floor(me.dna);
  $('sShare').textContent = Math.round(me.count / tot * 100) + '%';
  [...$('share').children].forEach((el, i) => el.style.width = (species[i].count / tot * 100) + '%');
  $('sZone').textContent = avatar && !avatar.dead ? zoneOf(avatar.y) : '—';
  $('dnaBtn').classList.toggle('ready', PARTS.some(p => lvOf(me.d, p) < maxOf(p) && me.dna >= p.cost(lvOf(me.d, p))));
  const db = $('dashBtn'); db.disabled = !me.d.tail || !avatar;
  db.textContent = !me.d.tail ? 'Dash' : avatar && avatar.dashCd > 0 ? 'Dash ' + Math.ceil(avatar.dashCd / 60) + 's' : 'Dash';
  const b = $('banner');
  if (ev) { b.hidden = false; $('bTitle').textContent = EVENTS[ev.type].title; $('bText').textContent = EVENTS[ev.type].text; $('bBar').style.width = (100 - (tick - ev.t0) / ev.dur * 100) + '%'; }
  else if (tick >= nextEv - 420) { const ty = evOrder[survived % evOrder.length]; b.hidden = false; $('bTitle').textContent = 'Warning: ' + EVENTS[ty].title.toLowerCase(); $('bText').textContent = EVENTS[ty].warn; $('bBar').style.width = ((nextEv - tick) / 420 * 100) + '%'; }
  else b.hidden = true;
  renderGoals();
  if (selected) renderInspector();
  if (!$('evolve').hidden) renderEditor();
}

// ---------- inspector ----------
const brainCv = $('brain'), bx = brainCv.getContext('2d');
function select(c) { selected = c; $('inspector').hidden = !c; if (c) { closeEditor(); renderInspector(); } }
const bar = (label, v, lo, hi, txt) => `<span>${label}</span><div class="t"><i style="width:${clamp((v - lo) / (hi - lo), 0, 1) * 100}%"></i></div><span>${txt}</span>`;
function renderInspector() {
  const c = selected; if (!c) return;
  const S = species[c.sp], st = S.st;
  $('iName').textContent = `${S.name} #${c.id}`;
  $('iSub').textContent = c.dead ? 'Dead' : `Generation ${c.gen} · ${MOUTHS[S.d.mouth].name.toLowerCase()} · ${zoneOf(c.y).toLowerCase()}${c === avatar ? ' · you' : ''}`;
  $('iTraits').innerHTML = bar('Health', c.hp, 0, st.hp, Math.max(0, c.hp).toFixed(0)) + bar('Energy', c.e, 0, st.eMax, Math.max(0, c.e).toFixed(0)) +
    bar('Size', c.g.size, 5.5, 14, c.g.size.toFixed(1)) + bar('Speed', c.g.speed * st.speed, 0.8, 3, (c.g.speed * st.speed).toFixed(2)) +
    bar('Senses', c.g.sense * st.sense, 60, 600, (c.g.sense * st.sense).toFixed(0)) + bar('Food eaten', c.eaten, 0, 40, c.eaten) +
    bar('Kills', c.kills, 0, 10, c.kills) + bar('Offspring', c.kids, 0, 10, c.kids);
  $('aControl').hidden = c.sp !== 0 || c === avatar; $('aFavour').hidden = c.sp !== 0;
  $('aCull').textContent = c.sp === 0 ? 'Cull' : 'Cull · 3 DNA';
  drawBrain(c);
}
function drawBrain(c) {
  const w = brainCv.width, h = brainCv.height, w8 = c.g.w;
  bx.clearRect(0, 0, w, h);
  const colX = [160, w / 2 + 10, w - 100], py = (n, i) => 16 + i * (h - 32) / (n - 1);
  const col = (s, a) => s >= 0 ? `rgba(127,224,200,${a})` : `rgba(255,122,138,${a})`;
  const node = (x, y, a) => { bx.beginPath(); bx.arc(x, y, 7, 0, 7); bx.fillStyle = col(a, 0.15 + Math.abs(a) * 0.85); bx.fill(); bx.strokeStyle = 'rgba(215,235,230,0.4)'; bx.lineWidth = 1; bx.stroke(); };
  const edge = (x1, y1, x2, y2, wt, act) => { const s = wt * act; bx.strokeStyle = col(s, Math.min(0.9, Math.abs(s) * 0.35)); bx.lineWidth = 0.5 + Math.min(3, Math.abs(wt)); bx.beginPath(); bx.moveTo(x1, y1); bx.lineTo(x2, y2); bx.stroke(); };
  for (let hh = 0; hh < NH; hh++) for (let i = 0; i < NI; i++) edge(colX[0], py(NI, i), colX[1], py(NH, hh), w8[hh * NI + i], c.inp[i]);
  for (let o = 0; o < NO; o++) for (let hh = 0; hh < NH; hh++) edge(colX[1], py(NH, hh), colX[2], py(NO, o), w8[HO + o * NH + hh], c.hid[hh]);
  bx.font = '20px "IBM Plex Mono", monospace'; bx.textBaseline = 'middle';
  for (let i = 0; i < NI; i++) { node(colX[0], py(NI, i), c.inp[i]); bx.fillStyle = '#9fbab4'; bx.textAlign = 'right'; bx.fillText(IN_LABELS[i], colX[0] - 14, py(NI, i)); }
  for (let hh = 0; hh < NH; hh++) node(colX[1], py(NH, hh), c.hid[hh]);
  for (let o = 0; o < NO; o++) { node(colX[2], py(NO, o), c.out[o]); bx.fillStyle = '#d7ebe6'; bx.textAlign = 'left'; bx.fillText(OUT_LABELS[o], colX[2] + 14, py(NO, o)); }
}
$('iClose').onclick = () => select(null);
$('aCull').onclick = () => cull(selected);
$('aFavour').onclick = () => favour(selected);
$('aControl').onclick = () => { if (selected && !selected.dead) { possess(selected); setTool('swim'); select(null); } };

// ---------- body editor ----------
const pv = $('preview'), pctx = pv.getContext('2d');
let editorKey = '';
function openEditor() { select(null); $('evolve').hidden = false; editorKey = ''; renderEditor(); }
function closeEditor() { $('evolve').hidden = true; }
function drawPreview() {
  const S = species[0], d = S.d, n = d.seg, r = 9;
  const fake = { g: { size: r, hue: 165 }, segs: [], a: 0, phase: performance.now() / 160 };
  const len = (n - 1) * r * 1.25;
  for (let i = 0; i < n; i++) fake.segs.push({ x: len / 2 - i * r * 1.25, y: Math.sin(fake.phase * 0.3 - i * 0.8) * 2 });
  pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.clearRect(0, 0, pv.width, pv.height);
  const k = Math.min(4.2, pv.width * 0.7 / (len + r * 5));
  pctx.setTransform(k, 0, 0, k, pv.width / 2 - 4 * k, pv.height / 2);
  drawAnimal(pctx, fake, S);
}
function renderEditor() {
  const me = species[0];
  $('eSub').textContent = `${Math.floor(me.dna)} DNA to spend · ${partCount(me.d)} parts`;
  const key = PARTS.map(p => lvOf(me.d, p) + (me.dna >= p.cost(lvOf(me.d, p)) ? 'y' : 'n')).join() + me.d.mouth + (me.dna >= MOUTH_COST) + species.map(S => S.extinct + partCount(S.d)).join();
  if (key === editorKey) return;
  editorKey = key;
  $('mouths').innerHTML = Object.entries(MOUTHS).map(([k, m]) => `<button type="button" data-m="${k}" aria-pressed="${me.d.mouth === k}"><b>${m.name}</b><small>${m.desc}</small></button>`).join('');
  $('mouths').querySelectorAll('button').forEach(b => b.onclick = () => {
    const k = b.dataset.m; if (me.d.mouth === k || !spend(MOUTH_COST)) return;
    me.d.mouth = k; stats(me); toast(`Your species now has ${MOUTHS[k].name.toLowerCase()}.`); editorKey = ''; renderEditor();
  });
  $('upgList').innerHTML = PARTS.map((p, i) => {
    const lv = lvOf(me.d, p), mx = maxOf(p), max = lv >= mx, cost = p.cost(lv);
    return `<button class="upg" type="button" data-u="${i}" ${max || me.dna < cost ? 'disabled' : ''}><b>${p.name}</b><small>${p.desc}. <em>Best for ${p.best}.</em></small><span class="cost">${max ? 'max' : cost + ' DNA'}<span class="pips">${Array.from({ length: mx }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('')}</span></span></button>`;
  }).join('');
  $('upgList').querySelectorAll('.upg').forEach(b => b.onclick = () => {
    const p = PARTS[+b.dataset.u];
    if (buyPart(me, p)) { toast(p.k === 'legs' ? 'Legs! Now swim to the shore at the top of the sea.' : `${p.name} added. Every creature of your species has it now.`); editorKey = ''; renderEditor(); }
  });
  $('rivalList').innerHTML = species.slice(1).map(S => `<div><span><i class="dot" style="background:${hsl(S.hue)}"></i>${S.name} · ${MOUTHS[S.d.mouth].name.toLowerCase()}</span><span>${S.extinct ? 'extinct' : partCount(S.d) + ' parts · ' + S.count}</span></div>`).join('');
}
$('dnaBtn').onclick = () => $('evolve').hidden ? openEditor() : closeEditor();
$('eClose').onclick = closeEditor;

// ---------- input ----------
function toWorld(px, py) { const S = scale(); return { x: (px * dpr - cv.width / 2) / S + cam.x, y: (py * dpr - cv.height / 2) / S + cam.y }; }
function pick(p, filter) {
  const tol = 24 * dpr / scale(); let best = null, bd = Infinity;
  for (const c of animals) { if (c.dead || (filter && !filter(c))) continue; const d = Math.hypot(c.x - p.x, c.y - p.y) - c.g.size; if (d < tol && d < bd) { bd = d; best = c; } }
  return best;
}
let steering = false;
cv.addEventListener('pointerdown', e => {
  const p = toWorld(e.clientX, e.clientY);
  if (tool === 'cull') { const c = pick(p); if (c) { cull(c); if (selected === c) select(null); } return; }
  if (tool === 'inspect') return select(pick(p));
  if (mapView) { const mine = pick(p, c => c.sp === 0); if (mine) { possess(mine); } mapView = false; $('viewBtn').textContent = 'Map'; return; }
  if (!avatar || avatar.dead) { const mine = pick(p, c => c.sp === 0); if (mine) possess(mine); else toast('Tap one of your teal creatures to take control.'); return; }
  steering = true; steer = p; cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', e => { if (steering) steer = toWorld(e.clientX, e.clientY); });
const endSteer = () => { steering = false; steer = null; };
cv.addEventListener('pointerup', endSteer); cv.addEventListener('pointercancel', endSteer);
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
addEventListener('keydown', e => {
  if (stopped) return;
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Space') { dashReq = true; e.preventDefault(); }
  if (e.code === 'KeyP') togglePause();
  if (e.code === 'KeyE') $('dnaBtn').click();
  if (e.code === 'KeyM') $('viewBtn').click();
  if (e.key === 'Escape') { if (PR.modal.open && PR.modal.close) PR.modal.close(); else { select(null); closeEditor(); } }
});
addEventListener('keyup', e => { if (stopped) return; if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
function setTool(t) {
  tool = t;
  document.querySelectorAll('[data-tool]').forEach(x => x.setAttribute('aria-pressed', x.dataset.tool === t));
  cv.style.cursor = t === 'cull' ? 'crosshair' : t === 'inspect' ? 'help' : 'pointer';
  const hint = { cull: 'Cull: tap a creature to remove it. Your own are free, rivals cost 3 DNA.', inspect: 'Inspect: tap any creature to see its brain.' }[t];
  if (hint) toast(hint);
}
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
function togglePause() { paused = !paused; $('pauseBtn').setAttribute('aria-pressed', paused); }
$('pauseBtn').onclick = togglePause;
$('speedBtn').onclick = () => { speedIdx = (speedIdx + 1) % SPEEDS.length; $('speedBtn').textContent = SPEEDS[speedIdx] + '×'; };
$('viewBtn').onclick = () => { mapView = !mapView; $('viewBtn').textContent = mapView ? 'Close up' : 'Map'; };
$('dashBtn').onclick = () => { dashReq = true; };
$('openAges').onclick = () => showModal({ eyebrow: 'The road to civilization', title: 'The ages ahead', body: PR.agesHtml(2), buttons: [['Back to the sea', null, true]] });
$('goals').addEventListener('click', e => { if (innerWidth <= 760 && e.target.id !== 'openAges') $('goals').classList.toggle('min'); });
if (innerWidth <= 760) $('goals').classList.add('min');

// ---------- modals ----------
const statsHtml = () => `<div class="statgrid">
  <div><span class="label">Time</span><b>${PR.fmtMyr(baseTime + tick * 0.05)}</b></div>
  <div><span class="label">Generations</span><b>${species[0].maxGen}</b></div>
  <div><span class="label">Fights won</span><b>${species[0].kills}</b></div>
  <div><span class="label">Disasters</span><b>${survived}</b></div></div>`;
function intro() {
  const d = species[0].d;
  const arrived = carry
    ? `<p>Your species arrives from Age 1 with <b>${carry.genomes.length} evolved brains</b>${d.fins || d.eyes || d.spikes || d.armour ? ` and a head start: ${[d.fins && d.fins + ' fins', d.eyes && d.eyes + ' eyes', d.spikes && 'spikes', d.armour && 'armour'].filter(Boolean).join(', ')}` : ''}. Everything it learned about finding food comes with it.</p>`
    : '<p>Your species starts fresh with random brains.</p>';
  showModal({ eyebrow: 'Age 2 · 600 million years ago', title: 'The Shallow Sea',
    body: `${arrived}
    <ul class="howto">
      <li><b>SWIM</b><span>Hold anywhere and your creature swims there. The sea is big, so tap Map to see all of it. Green is plants, red is meat.</span></li>
      <li><b>BUILD</b><span>Tap DNA to open the body editor. Add segments, fins, eyes, spikes, armour or a tail, and choose a mouth: grazer, beak or jaws.</span></li>
      <li><b>FIGHT</b><span>Creatures with a beak or jaws bite rivals they touch. Bodies drop meat. Spikes hurt anything that bites you.</span></li>
      <li><b>DEPTH</b><span>Plants grow best in the sunny shallows. The deep is dark and rich, and a hunter lives there. Kill it for 40 DNA if you dare.</span></li>
      <li><b>LAND</b><span>The final goal: grow legs and walk out onto the shore at the top of the sea.</span></li>
    </ul>`,
    buttons: [['Dive in', null, true]] });
}
function gameOver() {
  PR.clearSave();
  showModal({ eyebrow: 'Extinction', title: 'Your species is gone',
    body: `<p>The last of your creatures has died, and the sea belongs to the others now.</p>${statsHtml()}<p>Tip: stay in the shallows early on, add armour or spikes before you pick fights, and keep away from the red eyes in the deep.</p>`,
    buttons: [['Back to Age 1', () => PR.startAge(1)], ['Try Age 2 again', () => PR.startAge(2, null, carry), true]] });
}
function victory() {
  showModal({ eyebrow: 'Age 2 complete', title: 'Your species walks on land',
    body: `<p>Your creatures built bodies, survived the sea and its hunter, and one of them has just crawled out onto the shore. Next is Age 3, Creatures, where animals roam the land in herds and packs. It arrives in the next build.</p>${statsHtml()}`,
    buttons: [['Keep playing', null, true]] });
}

// ---------- save ----------
function serialize() {
  if (lost) return null;
  return { carry, tick, nextId, survived, won, nextEv, evOrder, flags, ev, shoreT,
    species: species.map(S => ({ d: S.d, dna: S.dna, kills: S.kills, maxGen: S.maxGen, extinct: S.extinct, strain: S.strain || 1 })),
    animals: animals.filter(c => !c.dead).map(c => [c.id, c.sp, PR.r1(c.x), PR.r1(c.y), +c.a.toFixed(2), PR.r1(c.e), PR.r1(c.hp), c.age, c.gen, Math.round(c.maxAge), c.eaten, c.kills, c.kids, PR.r1(c.g.size), +c.g.speed.toFixed(3), PR.r1(c.g.sense), PR.r1(c.g.hue), PR.packW(c.g.w)]),
    food: food.filter(f => !f.dead).map(f => [PR.r1(f.x), PR.r1(f.y), f.t, f.e]),
    apex: apex.dead ? { dead: true, respawnAt: apex.respawnAt } : { x: PR.r1(apex.x), y: PR.r1(apex.y), hp: apex.hp },
    goals: GOALS.map(g => !!g.done), avatarId: avatar && !avatar.dead ? avatar.id : null };
}
function restore(s) {
  newGame();
  animals = []; food = []; plantCount = 0;
  ({ tick, nextId, survived, won, nextEv, evOrder, shoreT } = s); flags = s.flags || {}; ev = s.ev || null;
  s.species.forEach((d, i) => { Object.assign(species[i], d); stats(species[i]); });
  for (const a of s.animals) {
    const c = makeAnimal({ w: new Float32Array(a[17]), size: a[13], speed: a[14], sense: a[15], hue: a[16] }, a[2], a[3], a[8], a[1], a[5]);
    Object.assign(c, { id: a[0], a: a[4], hp: a[6], age: a[7], maxAge: a[9], eaten: a[10], kills: a[11], kids: a[12] }); animals.push(c);
  }
  for (const f of s.food) addFood(f[0], f[1], f[2], f[3]);
  apex = makeApex();
  if (s.apex.dead) { apex.dead = true; apex.respawnAt = s.apex.respawnAt; } else { apex.x = s.apex.x; apex.y = s.apex.y; apex.hp = s.apex.hp; followSegs(apex.segs, apex.x, apex.y, 26); }
  GOALS.forEach((g, i) => g.done = !!s.goals[i]);
  for (const S of species) S.count = 0;
  for (const c of animals) species[c.sp].count++;
  avatar = null; possess(animals.find(c => c.id === s.avatarId) || animals.find(c => c.sp === 0));
}

// ---------- loop ----------
if (saved && saved.animals) restore(saved);
else { newGame(); for (let i = 0; i < 10; i++) step(); intro(); }
if (avatar) { cam.x = avatar.x; cam.y = avatar.y; }
cam.z = zClose;
let hudT = 0;
function frame(t) {
  if (stopped) return;
  if (!paused && !PR.modal.open) for (let i = 0; i < SPEEDS[speedIdx]; i++) step();
  updateCamera(); draw();
  if (!$('evolve').hidden) drawPreview();
  if (t - hudT > 250) { hudT = t; renderHud(); }
  else if (selected && !paused) drawBrain(selected);
  requestAnimationFrame(frame);
}
renderHud();
requestAnimationFrame(frame);
window.__sim2 = { debug: () => animals.slice(0, 6).map(c => [Math.round(c.x), Math.round(c.y), +c.e.toFixed(1), +c.hp.toFixed(0), c.eaten, +c.thrust.toFixed(2), c.dead]), step, bot: v => botPlayer = v, species: () => species, giveDna: n => species[0].dna += n,
  get stats() { return { tick, survived, won, lost, ev: ev && ev.type, apex: apex.dead ? 'dead' : Math.round(apex.hp), food: food.length, plants: plantCount, sp: species.map(S => ({ n: S.count, dna: Math.round(S.dna), gen: S.maxGen, k: S.kills, parts: partCount(S.d) })) }; } };
return { stop() { stopped = true; }, serialize };
} };
