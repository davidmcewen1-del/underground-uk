// Open world: one map, life evolves from cells at a deep-sea vent to land animals. The player guides it as natural selection.
const HUDW = `
  <div id="readout">
    <div class="panel brand">PRIMORDIAL<small id="eraName">Era of cells</small></div>
    <div class="panel stat"><span class="label">Time</span><b id="sTime">0</b></div>
    <div class="panel stat"><span class="label">Species</span><b id="sSpecies">0</b></div>
    <div class="panel stat"><span class="label">Life</span><b id="sLife">0</b></div>
  </div>

  <section id="goals" class="panel history" aria-label="History of life">
    <span class="label">Next in evolution</span>
    <h2 id="nextTitle">—</h2>
    <p class="note" id="nextHint"></p>
    <span class="label">History</span>
    <ol id="logList" class="log"></ol>
  </section>

  <aside id="speciesPanel" class="panel side" hidden aria-label="Species">
    <header>
      <div><h3>Tree of life</h3><div class="sub" id="spSub"></div></div>
      <button class="close" id="spClose" type="button" aria-label="Close species panel">×</button>
    </header>
    <div id="spList" class="splist"></div>
    <p class="note">Favour one species at a time: it uses less energy and evolves to the next stage faster. Tap a species to find one of its members.</p>
  </aside>

  <aside id="inspector" class="panel side" hidden aria-label="Creature">
    <header>
      <div><h3 id="iName">—</h3><div class="sub" id="iSub"></div></div>
      <button class="close" id="iClose" type="button" aria-label="Close creature panel">×</button>
    </header>
    <div class="traits" id="iTraits"></div>
    <div>
      <span class="label">Brain · live</span>
      <canvas id="brain" width="560" height="300"></canvas>
    </div>
    <div class="actions">
      <button class="btn go" id="aFollow" type="button">Follow</button>
      <button class="btn" id="aFavour" type="button">Favour species</button>
      <button class="btn danger" id="aCull" type="button">Cull</button>
    </div>
  </aside>

  <nav id="toolbar" class="panel wtools" aria-label="Tools">
    <button class="btn" data-tool="look" aria-pressed="true" type="button">Look</button>
    <button class="btn danger" data-tool="cull" aria-pressed="false" type="button">Cull</button>
    <button class="btn" data-tool="feed" aria-pressed="false" type="button">Feed</button>
    <button class="btn danger" data-tool="meteor" aria-pressed="false" type="button" id="meteorBtn">Meteor</button>
    <span class="sep"></span>
    <button class="btn" id="pauseBtn" aria-pressed="false" type="button" aria-label="Pause">❚❚</button>
    <button class="btn" id="speedBtn" type="button" aria-label="Game speed">1×</button>
    <span class="sep"></span>
    <button class="btn" id="zoomOut" type="button" aria-label="Zoom out">−</button>
    <button class="btn" id="zoomIn" type="button" aria-label="Zoom in">+</button>
    <button class="btn" id="worldBtn" type="button">World</button>
    <button class="btn" id="speciesBtn" type="button">Species</button>
  </nav>
`;

PR.ages.world = { start(saved) {
'use strict';
const { $, rnd, gauss, clamp, angTo, toast, showModal } = PR;
$('hud').innerHTML = HUDW;
const cv = $('world'), ctx = cv.getContext('2d');
let stopped = false;

// ---------- terrain from a seed ----------
const seed = saved ? saved.seed : (Math.random() * 1e9) | 0;
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = mulberry(seed), NG = 256, perm = new Float32Array(NG * NG);
for (let i = 0; i < perm.length; i++) perm[i] = R();
const nox = R() * 100, noy = R() * 100;
function vn(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, s = t => t * t * (3 - 2 * t), g = (i, j) => perm[((j & 255) * NG + (i & 255))]; const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1), u = s(xf), v = s(yf); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, y, o = 5) { let s = 0, amp = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += amp * vn(x * f, y * f); n += amp; amp *= 0.5; f *= 2; } return s / n; }
const W = 4800, H = 3200, TS = 20, TW = W / TS, TH = H / TS;
const DEEP = 0, SHAL = 1, BEACH = 2, GRASS = 3, FOREST = 4, DESERT = 5, MOUNT = 6;
const heightAt = (nx, ny) => { const dx = (nx - 0.56) / 0.40, dy = (ny - 0.5) / 0.40, fall = 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy)); return fbm(nx * 5 + nox, ny * 5 + noy) * 0.8 + fall * 0.55 - 0.08; };
const moistAt = (nx, ny) => fbm(nx * 4 + nox + 50, ny * 4 + noy + 50);
const tile = new Uint8Array(TW * TH);
const byType = [[], [], [], [], [], [], []];
for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
  const nx = (tx + 0.5) / TW, ny = (ty + 0.5) / TH, h = heightAt(nx, ny), m = moistAt(nx, ny);
  const t = h < 0.39 ? DEEP : h < 0.45 ? SHAL : h < 0.47 ? BEACH : h > 0.78 ? MOUNT : m > 0.56 ? FOREST : m < 0.40 ? DESERT : GRASS;
  tile[ty * TW + tx] = t; byType[t].push(ty * TW + tx);
}
const tileAt = (x, y) => tile[clamp(Math.floor(y / TS), 0, TH - 1) * TW + clamp(Math.floor(x / TS), 0, TW - 1)];
const isWater = t => t <= SHAL;
const coastal = i => { const tx = i % TW, ty = (i / TW) | 0; for (let j = -4; j <= 4; j++) for (let k = -4; k <= 4; k++) { const x = tx + k, y = ty + j; if (x >= 0 && y >= 0 && x < TW && y < TH && tile[y * TW + x] >= BEACH) return true; } return false; };
// the vent where life begins: shallow water near the coast
let vent;
{
  // open water: most of the surrounding 15x15 tiles are sea, but land is within reach
  const openWater = i => { const tx = i % TW, ty = (i / TW) | 0; let w = 0, n = 0; for (let j = -7; j <= 7; j++) for (let k = -7; k <= 7; k++) { const x = tx + k, y = ty + j; if (x < 0 || y < 0 || x >= TW || y >= TH) continue; n++; if (tile[y * TW + x] <= SHAL) w++; } return w / n > 0.75; };
  let opts = byType[SHAL].filter((i, k) => k % 5 === 0 && coastal(i) && openWater(i));
  if (!opts.length) opts = byType[SHAL];
  const i = opts[Math.floor(R() * opts.length)]; vent = { x: (i % TW + 0.5) * TS, y: (((i / TW) | 0) + 0.5) * TS };
}
const spawnNearVent = () => { for (let k = 0; k < 30; k++) { const x = vent.x + rnd(70), y = vent.y + rnd(70); if (isWater(tileAt(x, y))) return { x, y }; } return { x: vent.x, y: vent.y }; };
const randTile = list => { const i = list[Math.floor(Math.random() * list.length)]; return { x: (i % TW + Math.random()) * TS, y: (((i / TW) | 0) + Math.random()) * TS }; };

// ---------- life ----------
const TIERS = [
  { name: 'Cells', era: 'Era of cells', size: [2.5, 4.5], speed: 0.9, sense: 90, cost: 0.006, minAge: 150, life: 2400, hab: 'water' },
  { name: 'Swimmers', era: 'Age of swimmers', size: [5, 9], speed: 1.3, sense: 120, cost: 0.011, minAge: 300, life: 4500, hab: 'water' },
  { name: 'Amphibians', era: 'Age of amphibians', size: [6, 10], speed: 1.15, sense: 130, cost: 0.012, minAge: 350, life: 5500, hab: 'amph' },
  { name: 'Land animals', era: 'Age of land animals', size: [7, 16], speed: 1.5, sense: 170, cost: 0.013, minAge: 400, life: 7000, hab: 'land' },
];
const NI = 10, NH = 6, NO = 2, IH = NI * NH, HB = IH, HO = IH + NH, OB = HO + NH * NO, WN = OB + NO;
const IN_LABELS = ['Food dir', 'Food near', 'Threat dir', 'Threat near', 'Prey dir', 'Prey near', 'Energy', 'Ground ahead', 'Bias', 'Rhythm'];
const OUT_LABELS = ['Turn', 'Move'];
function think(o) {
  const w = o.g.w, inp = o.inp, hid = o.hid, out = o.out;
  for (let h = 0; h < NH; h++) { let s = w[HB + h]; for (let i = 0; i < NI; i++) s += w[h * NI + i] * inp[i]; hid[h] = Math.tanh(s); }
  for (let k = 0; k < NO; k++) { let s = w[OB + k]; for (let h = 0; h < NH; h++) s += w[HO + k * NH + h] * hid[h]; out[k] = Math.tanh(s); }
}
// a starting instinct so the first cells can feed: steer at food, keep moving, flee threats, turn back from bad ground
function instinct() {
  const w = new Float32Array(WN); for (let i = 0; i < WN; i++) w[i] = rnd(0.3);
  w[0 * NI + 0] = 3; w[HO + 0 * NH + 0] = 2.4;
  w[1 * NI + 2] = -3; w[1 * NI + 3] = 1; w[HO + 0 * NH + 1] = 1.6;
  w[2 * NI + 4] = 3; w[HO + 0 * NH + 2] = 1.2;
  w[3 * NI + 7] = -2.5; w[HB + 3] = -0.5; w[HO + 0 * NH + 3] = 2;
  w[HB + 4] = 2; w[HO + 1 * NH + 4] = 1.5;
  return w;
}
function mutateW(w, rate) { const n = new Float32Array(w); for (let i = 0; i < WN; i++) if (Math.random() < 0.1 * rate) n[i] = clamp(n[i] + gauss() * 0.4 * rate, -4, 4); return n; }
function mutate(g, tier, hue, rate = 1) {
  const T = TIERS[tier];
  return { w: mutateW(g.w, rate), size: clamp(g.size + gauss() * 0.25 * rate, T.size[0], T.size[1]), speed: clamp(g.speed + gauss() * 0.04 * rate, 0.6, 1.6),
    sense: clamp(g.sense + gauss() * 4 * rate, 0.6, 1.8), diet: clamp(g.diet + gauss() * 0.025 * rate, 0, 1), hue: hue + clamp(g.hue - hue + gauss() * 2, -12, 12) };
}

// ---------- names ----------
const SYL = ['vor', 'ka', 'mi', 'thal', 'ru', 'zen', 'oc', 'li', 'pra', 'su', 'ne', 'cor', 'ib', 'ax', 'el', 'ty', 'qua', 'dor', 'bra', 'gal', 'phy', 'sto', 'mer'];
const END1 = ['ella', 'ium', 'oma', 'ax', 'ida', 'ula', 'on', 'ia', 'odon', 'ops', 'erpeton', 'therium'];
function makeName(tier) {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  let s = ''; for (let i = 0; i < 1 + Math.floor(Math.random() * 2); i++) s += pick(SYL);
  const ends = tier === 0 ? END1.slice(0, 4) : tier === 1 ? ['ichthys', 'aspis', 'odus', 'ella', 'ops'] : tier === 2 ? ['erpeton', 'stega', 'batrax', 'odon'] : ['therium', 'saurus', 'odon', 'ceros', 'lestes'];
  s += pick(ends); return s[0].toUpperCase() + s.slice(1);
}

// ---------- state ----------
let ago = 3800, topTier = 0, lastUp = 0, lastSpToast = 0;
let orgs = [], food = [], species = [], nextId = 1, tick = 0, veg = 0, log = [], flags = {}, effects = [], craters = [];
let selected = null, following = null, tool = 'look', speedIdx = 0, paused = false, meteorCd = 0;
const SPEEDS = [1, 4, 10, 20], CAP = 650, SP_CAP = 220, MAX_SPECIES = 14;
const FOOD_KIND = { plankton: 0, plant: 1, meat: 2 };
let foodCount = [0, 0, 0];

function newSpecies(tier, parent, hue, gen) {
  const S = { id: species.length, name: makeName(tier), tier, hue: ((hue % 360) + 360) % 360, parent, bornT: tick, baseGen: gen, count: 0, peak: 0, alive: true, favoured: false, kills: 0, diet: 0 };
  species.push(S); return S;
}
function makeOrg(g, x, y, sp, gen, e) {
  const S = species[sp], T = TIERS[S.tier];
  return { id: nextId++, sp, tier: S.tier, g, x, y, a: Math.random() * 6.28, e: e ?? g.size * 5, age: 0, gen, maxAge: T.life * (0.8 + Math.random() * 0.4),
    inp: new Float32Array(NI), hid: new Float32Array(NH), out: new Float32Array(NO), dead: false, phase: Math.random() * 6, thrust: 0, dry: 0, eaten: 0, kills: 0, kids: 0 };
}
function addFood(x, y, kind, e) {
  if (kind === 0 && foodCount[0] > 1100) return;
  if (kind === 1 && foodCount[1] > 1100 * veg + 20) return;
  if (kind === 2 && foodCount[2] > 260) return;
  food.push({ x: clamp(x, 2, W - 2), y: clamp(y, 2, H - 2), kind, e: e || [8, 12, 22][kind], dead: false, rot: tick + [2500, 6000, 1500][kind] * (0.7 + Math.random() * 0.6) }); foodCount[kind]++;
}
function canEnter(o, t) {
  const hab = TIERS[o.tier].hab;
  if (hab === 'water') return t <= SHAL;
  if (hab === 'amph') return t !== MOUNT;
  return t !== DEEP;
}
function addLog(key, text, x, y) {
  if (key && flags[key]) return false;
  if (key) flags[key] = true;
  log.unshift({ t: ago, text, x, y }); if (log.length > 40) log.pop();
  renderLog(); return true;
}
function newWorld() {
  orgs = []; food = []; species = []; foodCount = [0, 0, 0]; nextId = 1; tick = 0; ago = 3800; topTier = 0; lastUp = 0; veg = 0; log = []; flags = {}; effects = []; craters = [];
  for (let i = 0; i < 500; i++) { const p = randTile(Math.random() < 0.75 ? byType[SHAL] : byType[DEEP]); addFood(p.x, p.y, 0); }
  const S = newSpecies(0, null, 165, 0);
  for (let i = 0; i < 40; i++) {
    const g = { w: mutateW(instinct(), 2), size: 3 + Math.random(), speed: 0.9 + Math.random() * 0.3, sense: 0.9 + Math.random() * 0.3, diet: Math.random() * 0.15, hue: 165 + rnd(8) };
    const p = spawnNearVent(); orgs.push(makeOrg(g, p.x, p.y, S.id, 0, 25));
  }
  addLog('life', `Life begins at a deep-sea vent: the first cells, ${S.name}.`, vent.x, vent.y);
}

// ---------- spatial grid ----------
const G = 100, gc = W / G, gr = H / G;
const gridO = Array.from({ length: gc * gr }, () => []), gridF = Array.from({ length: gc * gr }, () => []);
function buildGrid() {
  for (let i = 0; i < gridO.length; i++) { gridO[i].length = 0; gridF[i].length = 0; }
  const at = o => clamp(Math.floor(o.y / G), 0, gr - 1) * gc + clamp(Math.floor(o.x / G), 0, gc - 1);
  for (const o of orgs) if (!o.dead) gridO[at(o)].push(o);
  for (const f of food) if (!f.dead) gridF[at(f)].push(f);
}
function scan(o, R) {
  const cr = Math.ceil(R / G), cx = Math.floor(o.x / G), cy = Math.floor(o.y / G), R2 = R * R;
  const herb = o.g.diet < 0.5, hab = TIERS[o.tier].hab;
  let food1 = null, fd = R2, threat = null, td = R2, prey = null, pd = R2;
  for (let j = Math.max(0, cy - cr); j <= Math.min(gr - 1, cy + cr); j++) for (let i = Math.max(0, cx - cr); i <= Math.min(gc - 1, cx + cr); i++) {
    for (const f of gridF[j * gc + i]) {
      if (f.dead) continue;
      const ok = herb ? (f.kind === 0 ? hab !== 'land' : f.kind === 1 ? hab !== 'water' : false) : f.kind === 2 || (o.g.diet < 0.7 && f.kind !== 2 && (f.kind === 0 ? hab !== 'land' : hab !== 'water'));
      if (!ok) continue;
      const dx = f.x - o.x, dy = f.y - o.y, d = dx * dx + dy * dy; if (d < fd) { fd = d; food1 = f; }
    }
    for (const p of gridO[j * gc + i]) {
      if (p.dead || p === o || p.sp === o.sp) continue;
      const dx = p.x - o.x, dy = p.y - o.y, d = dx * dx + dy * dy;
      if (p.g.diet > 0.5 && p.g.size > o.g.size * 1.2 && d < td) { td = d; threat = p; }
      if (p.g.size * 1.25 < o.g.size && d < pd) { pd = d; prey = p; }
    }
  }
  return { food: food1, fd: Math.sqrt(fd), threat, td: Math.sqrt(td), prey, pd: Math.sqrt(pd) };
}

// ---------- simulation ----------
function step() {
  tick++;
  ago = Math.max([1000, 480, 380, 0][topTier], ago - [0.025, 0.012, 0.006, 0.003][topTier]);
  // vegetation spreads over the land once multicellular life exists
  if (flags.multi && veg < 1) {
    const before = Math.floor(veg * 10); veg = Math.min(1, veg + 0.000009);
    if (Math.floor(veg * 10) !== before) terrainDirty = true;
    if (veg > 0.25) addLog('plants', 'Plants have spread across the land. There is food out of the water now.', W * 0.56, H * 0.5);
  }
  for (let k = 0; k < 2; k++) { const p = randTile(Math.random() < 0.88 ? byType[SHAL] : byType[DEEP]); addFood(p.x, p.y, 0); }
  if (Math.random() < 0.3) { const p = randTile(byType[SHAL]); addFood(p.x, p.y, 0); }
  if (Math.random() < 0.15) { const p = spawnNearVent(); addFood(p.x + rnd(80), p.y + rnd(80), 0); }
  if (veg > 0.02) for (let k = 0; k < 2; k++) if (Math.random() < veg * 0.9) { const r = Math.random(); const p = randTile(r < 0.45 ? byType[FOREST] : r < 0.88 ? byType[GRASS] : r < 0.95 ? byType[BEACH] : byType[DESERT]); addFood(p.x, p.y, 1); }
  for (const c of craters) c.t--;
  if (craters.length && craters[0].t <= 0) craters.shift();
  buildGrid();
  const born = [];
  let total = 0; for (const o of orgs) if (!o.dead) total++;
  for (const o of orgs) {
    if (o.dead) continue;
    const S = species[o.sp], T = TIERS[o.tier], g = o.g, inp = o.inp;
    const sense = T.sense * g.sense;
    // look around every third tick; in between, re-measure the last things seen
    let s;
    if (!o.cache || (tick + o.id) % 3 === 0) s = o.cache = scan(o, sense);
    else {
      s = o.cache;
      s.fd = s.food && !s.food.dead ? Math.hypot(s.food.x - o.x, s.food.y - o.y) : (s.food = null, sense);
      s.td = s.threat && !s.threat.dead ? Math.hypot(s.threat.x - o.x, s.threat.y - o.y) : (s.threat = null, sense);
      s.pd = s.prey && !s.prey.dead ? Math.hypot(s.prey.x - o.x, s.prey.y - o.y) : (s.prey = null, sense);
    }
    inp[0] = s.food ? angTo(o.a, s.food.x - o.x, s.food.y - o.y) / Math.PI : 0;
    inp[1] = s.food ? 1 - s.fd / sense : 0;
    inp[2] = s.threat ? angTo(o.a, s.threat.x - o.x, s.threat.y - o.y) / Math.PI : 0;
    inp[3] = s.threat ? 1 - s.td / sense : 0;
    inp[4] = s.prey && g.diet > 0.4 ? angTo(o.a, s.prey.x - o.x, s.prey.y - o.y) / Math.PI : 0;
    inp[5] = s.prey && g.diet > 0.4 ? 1 - s.pd / sense : 0;
    inp[6] = o.e / (g.size * 10);
    const ahead = tileAt(o.x + Math.cos(o.a) * g.size * 4, o.y + Math.sin(o.a) * g.size * 4);
    inp[7] = canEnter(o, ahead) ? (T.hab === 'amph' && o.dry > 400 ? (isWater(ahead) ? 1 : -0.5) : 1) : -1;
    inp[8] = 1;
    inp[9] = Math.sin(o.age * 0.05);
    think(o);
    o.a += o.out[0] * 0.15;
    o.thrust = (o.out[1] + 1) / 2;
    const here = tileAt(o.x, o.y);
    let v = o.thrust * T.speed * g.speed;
    if (T.hab === 'land' && (here === MOUNT || here === SHAL)) v *= 0.5;
    if (T.hab === 'amph' && !isWater(here)) v *= 0.7;
    const nx = o.x + Math.cos(o.a) * v, ny = o.y + Math.sin(o.a) * v;
    if (nx < 5 || ny < 5 || nx > W - 5 || ny > H - 5 || !canEnter(o, tileAt(nx, ny))) { o.a += Math.PI * (0.6 + Math.random() * 0.8); }
    else { o.x = nx; o.y = ny; }
    o.phase += 0.1 + v * 0.3;
    if (T.hab === 'amph') { if (isWater(tileAt(o.x, o.y))) o.dry = 0; else { o.dry++; if (o.dry > 700) o.e -= 0.04; if (!flags.landfall && o.dry > 30) addLog('landfall', `${S.name} crawls out of the water. Life is on land for the first time.`, o.x, o.y); } }
    o.e -= (T.cost * (0.5 + g.size / 8) + 0.006 * o.thrust * T.speed * g.speed * g.size / 6 + sense * 0.00001) * (S.favoured ? 0.8 : 1);
    o.age++;
    // eating
    if (s.food && s.fd < g.size + 3 && !s.food.dead) {
      const f = s.food, eff = f.kind === 2 ? g.diet : 1 - g.diet * 0.8;
      f.dead = true; foodCount[f.kind]--; o.e += f.e * eff; o.eaten++;
    }
    if (g.diet > 0.5 && s.prey && !s.prey.dead && s.pd < g.size + s.prey.g.size) {
      const p = s.prey; p.dead = true; o.e += (p.e * 0.5 + p.g.size * 3) * g.diet; o.kills++; S.kills++;
      effects.push({ x: p.x, y: p.y, t: 0, kind: 'eat', hue: p.g.hue });
      if (selected === p) { select(null); }
      if (following === p) refollow(p);
      if (!flags.pred && S.kills >= 5) addLog('pred', `${S.name} has become a predator, hunting other species.`, o.x, o.y);
      if (o.tier === 3 && g.diet > 0.6 && S.kills >= 5) addLog('apex', `${S.name} is the first land predator.`, o.x, o.y);
    }
    const maxE = g.size * 10;
    if (o.e > maxE) o.e = maxE;
    if (o.e > maxE * 0.75 && o.age > T.minAge && S.count < SP_CAP && total < CAP) {
      o.e /= 2; o.kids++;
      const child = makeOrg(mutate(g, o.tier, S.hue), o.x + rnd(3), o.y + rnd(3), o.sp, o.gen + 1, o.e);
      speciate(o, child, S);
      born.push(child); total++;
    }
    if (o.e <= 0 || o.age > o.maxAge) die(o);
  }
  if (born.length) orgs.push(...born);
  if (tick % 30 === 0) {
    orgs = orgs.filter(o => !o.dead);
    for (const f of food) if (!f.dead && f.rot < tick) { f.dead = true; foodCount[f.kind]--; }
    food = food.filter(f => !f.dead);
  }
  if (tick % 20 === 0) census();
  if (meteorCd > 0) meteorCd--;
}
function die(o) {
  if (o.dead) return;
  o.dead = true;
  if (o.tier >= 1) addFood(o.x, o.y, 2, 10 + o.g.size * 1.5);
  if (selected === o) setTimeout(() => { if (selected === o) select(null); }, 800);
  if (following === o) refollow(o);
}
function refollow(o) {
  let best = null, bd = Infinity;
  for (const p of orgs) if (!p.dead && p.sp === o.sp) { const d = Math.hypot(p.x - o.x, p.y - o.y); if (d < bd) { bd = d; best = p; } }
  following = best; if (best && selected === o) select(best);
}
function speciate(parent, child, S) {
  // the longer nothing new has evolved, the more likely the next step becomes
  const press = Math.min(10, 1 + (tick - lastUp) / 25000);
  const gens = child.gen - S.baseGen, fav = (S.favoured ? 4 : 1) * press, here = tileAt(child.x, child.y);
  let up = false;
  if (S.tier === 0 && gens >= 40 && Math.random() < 0.0008 * fav) up = true;
  else if (S.tier === 1 && veg > 0.4 && gens >= 30 && coastalAt(child.x, child.y) && Math.random() < 0.0015 * fav) up = true;
  else if (S.tier === 2 && veg > 0.6 && gens >= 30 && !isWater(here) && Math.random() < 0.002 * fav) up = true;
  const alive = species.filter(x => x.alive).length;
  if (up) {
    const tier = S.tier + 1, T = TIERS[tier];
    const N = newSpecies(tier, S.id, S.hue + 50 + Math.random() * 90, child.gen);
    child.sp = N.id; child.tier = tier;
    child.g = { ...child.g, w: mutateW(child.g.w, 1.5), size: T.size[0] + Math.random() * (T.size[1] - T.size[0]) * 0.4, hue: N.hue };
    child.maxAge = T.life; child.e = child.g.size * 6;
    if (tier > topTier) lastUp = tick;
    const msgs = [null, `Cells have joined together. ${N.name} is the first multicellular life.`, `${N.name} grows legs: the first amphibian. It can crawl into the shallows and onto the beach.`, `${N.name} no longer needs the water. The first true land animal has evolved.`];
    addLog(['', 'multi', 'amph', 'land'][tier], msgs[tier], child.x, child.y);
    if (!flags['stage' + tier]) { flags['stage' + tier] = true; toast(TIERS[tier].era + ' begins!', true); }
    else if (performance.now() - lastSpToast > 4000) { lastSpToast = performance.now(); toast(`New species: ${N.name}, ${TIERS[tier].name.toLowerCase().replace(/s$/, '')}.`); }
  } else if (alive < MAX_SPECIES && gens >= 12 && Math.random() < 0.0007) {
    // a branch at the same stage, often with a new diet
    const N = newSpecies(S.tier, S.id, S.hue + (Math.random() < 0.5 ? -1 : 1) * (35 + Math.random() * 60), child.gen);
    child.sp = N.id;
    const diet = Math.random() < 0.4 ? clamp(child.g.diet + 0.45 + Math.random() * 0.2, 0, 1) : clamp(child.g.diet + rnd(0.15), 0, 1);
    child.g = { ...child.g, w: mutateW(child.g.w, 1.5), diet, hue: N.hue, size: clamp(child.g.size * (diet > 0.5 ? 1.25 : 1), TIERS[S.tier].size[0], TIERS[S.tier].size[1]) };
    if (performance.now() - lastSpToast > 4000) { lastSpToast = performance.now(); toast(`New species: ${N.name}${diet > 0.5 ? ', a predator' : ''}.`); }
  }
}
function coastalAt(x, y) { const tx = Math.floor(x / TS), ty = Math.floor(y / TS); for (let j = -3; j <= 3; j++) for (let k = -3; k <= 3; k++) { const a = tx + k, b = ty + j; if (a >= 0 && b >= 0 && a < TW && b < TH && tile[b * TW + a] >= BEACH) return true; } return false; }
function census() {
  for (const S of species) { S.count = 0; S.dietSum = 0; }
  topTier = 0; for (const o of orgs) if (!o.dead && o.tier > topTier) topTier = o.tier;
  for (const o of orgs) if (!o.dead) { const S = species[o.sp]; S.count++; S.dietSum += o.g.diet; }
  for (const S of species) {
    if (S.count) { S.diet = S.dietSum / S.count; S.peak = Math.max(S.peak, S.count); }
    if (S.alive && S.count === 0) {
      S.alive = false; S.extinctT = tick; if (S.favoured) S.favoured = false;
      if (S.peak >= 15) addLog(null, `${S.name} has gone extinct.`);
    }
    if (S.tier === 3 && S.count >= 30) addLog('herd', `${S.name} roams the land in herds of ${S.count}.`);
  }
  if (!orgs.some(o => !o.dead)) {
    // life always finds a way back from the vent
    const S = newSpecies(0, null, 165, 0);
    for (let i = 0; i < 30; i++) { const p = spawnNearVent(); orgs.push(makeOrg({ w: mutateW(instinct(), 2), size: 3.5, speed: 1, sense: 1, diet: 0.05, hue: 165 }, p.x, p.y, S.id, 0, 25)); }
    addLog(null, 'All life was wiped out. New cells have appeared at the vent.', vent.x, vent.y);
  }
}

// ---------- player actions ----------
function cull(o) { if (!o || o.dead) return; effects.push({ x: o.x, y: o.y, t: 0, kind: 'cull', hue: o.g.hue }); die(o); }
function feed(x, y) {
  const t = tileAt(x, y), kind = isWater(t) ? 0 : 1;
  if (kind === 1 && veg < 0.02) { toast('Nothing grows on the land yet. Feed the water instead.'); return; }
  for (let i = 0; i < 20; i++) addFood(x + rnd(50), y + rnd(50), kind);
  effects.push({ x, y, t: 0, kind: 'feed' });
}
function meteor(x, y) {
  if (meteorCd > 0) { toast(`The meteor is not ready. ${Math.ceil(meteorCd / 60)} seconds at normal speed.`); return; }
  meteorCd = 2400; const r = 260; let n = 0;
  for (const o of orgs) if (!o.dead && Math.hypot(o.x - x, o.y - y) < r) { die(o); n++; }
  for (const f of food) if (!f.dead && Math.hypot(f.x - x, f.y - y) < r) { f.dead = true; foodCount[f.kind]--; }
  craters.push({ x, y, r, t: 6000 }); effects.push({ x, y, t: 0, kind: 'meteor' });
  addLog(null, `A meteor struck, killing ${n} creatures.`, x, y);
}
function favourSpecies(S) {
  const was = S.favoured; for (const s of species) s.favoured = false;
  S.favoured = !was; toast(S.favoured ? `You favour ${S.name}. It will thrive and evolve faster.` : `You no longer favour ${S.name}.`);
  renderSpecies();
}

// ---------- milestones ----------
const NEXT = [
  ['multi', 'Multicellular life', 'Cells need many generations to join together. Favour a cell species that is doing well to speed it up.'],
  ['plants', 'Plants on land', 'Once multicellular life exists, plants slowly spread over the empty land.'],
  ['amph', 'The first amphibian', 'Swimmers living in shallow water near the coast can evolve legs. Favour one that stays near the shore.'],
  ['landfall', 'Crawl onto land', 'Amphibians will start leaving the water to find plants on the beach.'],
  ['land', 'The first land animal', 'Amphibians that spend generations on land can lose their need for water.'],
  ['herd', 'Herds', 'A land species needs 30 members at once. Keep predators in check with Cull.'],
  ['apex', 'Land predators', 'A land species may branch off and start hunting the others.'],
  ['mind', 'Intelligence', 'Tribes, settlements and civilization arrive on this same map in the next updates.'],
];
function renderLog() {
  const n = NEXT.find(([k]) => !flags[k]);
  $('nextTitle').textContent = n ? n[1] : 'Every milestone reached';
  $('nextHint').textContent = n ? n[2] : '';
  $('logList').innerHTML = log.map((e, i) => `<li${e.x !== undefined ? ` data-i="${i}" class="go"` : ''}><span>${fmtAgo(e.t)}</span>${e.text}</li>`).join('');
  $('logList').querySelectorAll('li.go').forEach(li => li.onclick = () => { const e = log[+li.dataset.i]; following = null; camT.x = e.x; camT.y = e.y; camT.z = Math.max(camT.z, 1.2); });
}
const fmtAgo = my => { return my >= 1000 ? (my / 1000).toFixed(2) + ' bya' : Math.round(my) + ' mya'; };

// ---------- camera & terrain ----------
let dpr = 1, zMin = 0.2, terrainDirty = true, terrain;
const ZMAX = 3.2;
const cam = { x: W / 2, y: H / 2, z: 0.3 }, camT = { x: W / 2, y: H / 2, z: 0.3 };
function fit() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  zMin = Math.min(innerWidth / W, innerHeight / H) * 0.95;
}
fit();
addEventListener('resize', () => { if (!stopped) fit(); });
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const C = { deep1: hex('#081f36'), deep2: hex('#0f3a5c'), shal1: hex('#1b6b82'), shal2: hex('#38a3a5'), beach: hex('#d2c18f'), bare: hex('#8b7b63'), bareF: hex('#7a6c57'),
  grass: hex('#6f9a45'), forest: hex('#2f5f2f'), desert: hex('#c9a66b'), mount: hex('#8a8178'), snow: hex('#eeeeea') };
const PX = 3; // world units per terrain pixel
const tw = Math.round(W / PX), th = Math.round(H / PX);
const hmap = new Float32Array(tw * th), mmap = new Float32Array(tw * th);
for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { hmap[y * tw + x] = heightAt((x + 0.5) / tw, (y + 0.5) / th); mmap[y * tw + x] = moistAt((x + 0.5) / tw, (y + 0.5) / th); }
function renderTerrain() {
  terrain = terrain || document.createElement('canvas'); terrain.width = tw; terrain.height = th;
  const tctx = terrain.getContext('2d'), img = tctx.createImageData(tw, th), d = img.data;
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const i = y * tw + x, h = hmap[i], m = mmap[i];
    let c;
    if (h < 0.39) c = mix(C.deep1, C.deep2, clamp((h - 0.2) / 0.19, 0, 1));
    else if (h < 0.45) c = mix(C.shal1, C.shal2, (h - 0.39) / 0.06);
    else if (h < 0.47) c = C.beach;
    else if (h > 0.84) c = C.snow;
    else if (h > 0.78) c = C.mount;
    else {
      const green = m > 0.56 ? mix(C.bareF, C.forest, veg) : m < 0.40 ? C.desert : mix(C.bare, C.grass, veg);
      c = mix(green, C.mount, clamp((h - 0.68) / 0.12, 0, 1) * 0.6);
    }
    // hill shading from the height gradient
    if (h >= 0.45) { const hx = hmap[i + (x < tw - 1 ? 1 : 0)] - hmap[i - (x > 0 ? 1 : 0)], hy = hmap[i + (y < th - 1 ? tw : 0)] - hmap[i - (y > 0 ? tw : 0)]; const sh = clamp(1 + (-hx - hy) * 18, 0.75, 1.25); c = [c[0] * sh, c[1] * sh, c[2] * sh]; }
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
  }
  tctx.putImageData(img, 0, 0); terrainDirty = false;
}
const scale = () => cam.z * dpr;
function updateCamera() {
  if (following && !following.dead) { camT.x = following.x; camT.y = following.y; }
  camT.z = clamp(camT.z, zMin, ZMAX);
  cam.z += (camT.z - cam.z) * 0.18;
  const hw = innerWidth / 2 / cam.z, hh = innerHeight / 2 / cam.z;
  const cx = hw * 2 >= W ? W / 2 : clamp(camT.x, hw, W - hw), cy = hh * 2 >= H ? H / 2 : clamp(camT.y, hh, H - hh);
  camT.x = cx; camT.y = cy;
  cam.x += (cx - cam.x) * 0.2; cam.y += (cy - cam.y) * 0.2;
}

// ---------- drawing life ----------
function drawOrg(o, S) {
  const r = o.g.size, h = o.g.hue, ph = o.phase, pred = o.g.diet > 0.5;
  ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a);
  if (o.tier === 0) {
    ctx.strokeStyle = `hsla(${h},50%,80%,0.5)`; ctx.lineWidth = r * 0.18;
    ctx.beginPath(); for (let k = 0; k <= 6; k++) { const u = k / 6; ctx.lineTo(-r - u * r * 1.6, Math.sin(ph - u * 5) * r * 0.35 * u); } ctx.stroke();
    ctx.fillStyle = `hsla(${h},60%,62%,0.55)`; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.15, r * 0.9, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = `hsla(${h},80%,85%,0.7)`; ctx.lineWidth = r * 0.14; ctx.stroke();
    ctx.fillStyle = `hsla(${h},45%,25%,0.8)`; ctx.beginPath(); ctx.arc(-r * 0.15, 0, r * 0.35, 0, 7); ctx.fill();
  } else if (o.tier === 1) {
    const wig = Math.sin(ph) * 0.35;
    ctx.fillStyle = `hsla(${h},50%,62%,0.8)`;
    ctx.beginPath(); ctx.moveTo(-r * 1.2, 0); ctx.lineTo(-r * 2.2, -r * 0.7 + wig * r); ctx.lineTo(-r * 2.2, r * 0.7 + wig * r); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `hsla(${h},50%,70%,0.55)`; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(-r * 0.1, s * r * 0.6, r * 0.5, r * 0.2, s * 0.6 + wig * s, 0, 7); ctx.fill(); }
    ctx.fillStyle = `hsl(${h},48%,${pred ? 42 : 52}%)`; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.5, r * 0.62, 0, 0, 7); ctx.fill();
    ctx.fillStyle = `hsla(${h},60%,80%,0.35)`; ctx.beginPath(); ctx.ellipse(r * 0.2, -r * 0.2, r * 0.9, r * 0.2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#0a1214'; ctx.beginPath(); ctx.arc(r * 0.95, -r * 0.25, r * 0.14, 0, 7); ctx.arc(r * 0.95, r * 0.25, r * 0.14, 0, 7); ctx.fill();
    if (pred) { ctx.strokeStyle = 'rgba(240,235,220,0.85)'; ctx.lineWidth = r * 0.12; ctx.beginPath(); ctx.moveTo(r * 1.35, -r * 0.25); ctx.lineTo(r * 1.75, 0); ctx.lineTo(r * 1.35, r * 0.25); ctx.stroke(); }
  } else {
    const land = o.tier === 3, walk = Math.sin(ph * (land ? 1.2 : 0.9));
    if (land) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(r * 0.15, r * 0.25, r * 1.5, r * 0.85, 0, 0, 7); ctx.fill(); }
    // legs
    ctx.strokeStyle = `hsl(${h},35%,${land ? 32 : 40}%)`; ctx.lineWidth = r * (land ? 0.28 : 0.22); ctx.lineCap = 'round'; ctx.beginPath();
    for (const [lx, side, k] of [[r * 0.6, -1, 1], [r * 0.6, 1, -1], [-r * 0.6, -1, -1], [-r * 0.6, 1, 1]]) {
      const sw = walk * k * 0.5; ctx.moveTo(lx, side * r * 0.35); ctx.lineTo(lx + Math.cos(sw) * r * (land ? 0.25 : 0.5) + r * 0.25 * sw, side * r * (land ? 0.95 : 1.05));
    }
    ctx.stroke();
    // tail
    ctx.strokeStyle = `hsl(${h},40%,${land ? 38 : 46}%)`; ctx.lineWidth = r * (land ? 0.22 : 0.4); ctx.beginPath(); ctx.moveTo(-r * 1.1, 0);
    ctx.quadraticCurveTo(-r * 1.8, Math.sin(ph) * r * 0.5, -r * (land ? 2.1 : 2.6), Math.sin(ph - 1) * r * 0.6); ctx.stroke();
    // body and head
    ctx.fillStyle = `hsl(${h},${land ? 38 : 45}%,${pred ? 36 : land ? 46 : 50}%)`;
    ctx.beginPath(); ctx.ellipse(0, 0, r * (land ? 1.3 : 1.4), r * (land ? 0.72 : 0.55), 0, 0, 7); ctx.fill();
    if (pred && land) { ctx.strokeStyle = `hsla(${h},40%,20%,0.6)`; ctx.lineWidth = r * 0.12; ctx.beginPath(); for (const sx of [-0.5, 0, 0.5]) { ctx.moveTo(r * sx, -r * 0.6); ctx.lineTo(r * sx - r * 0.15, r * 0.6); } ctx.stroke(); }
    ctx.fillStyle = `hsl(${h},${land ? 38 : 45}%,${pred ? 32 : land ? 42 : 46}%)`;
    ctx.beginPath(); ctx.ellipse(r * (land ? 1.45 : 1.35), 0, r * (pred ? 0.6 : 0.5), r * 0.42, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#0b1010'; ctx.beginPath(); ctx.arc(r * 1.6, -r * 0.2, r * 0.09, 0, 7); ctx.arc(r * 1.6, r * 0.2, r * 0.09, 0, 7); ctx.fill();
    if (land && !pred && r > 11) { ctx.strokeStyle = 'rgba(235,225,200,0.9)'; ctx.lineWidth = r * 0.08; ctx.beginPath(); ctx.moveTo(r * 1.5, -r * 0.3); ctx.lineTo(r * 1.75, -r * 0.6); ctx.moveTo(r * 1.5, r * 0.3); ctx.lineTo(r * 1.75, r * 0.6); ctx.stroke(); }
  }
  ctx.restore();
}
function draw() {
  if (terrainDirty) renderTerrain();
  const Sc = scale(), Wc = cv.width, Hc = cv.height, t = performance.now() / 1000;
  const vx = Wc / 2 / Sc + 40, vy = Hc / 2 / Sc + 40, vis = (x, y) => Math.abs(x - cam.x) < vx && Math.abs(y - cam.y) < vy;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#061a2e'; ctx.fillRect(0, 0, Wc, Hc);
  ctx.setTransform(Sc, 0, 0, Sc, Wc / 2 - cam.x * Sc, Hc / 2 - cam.y * Sc);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(terrain, 0, 0, W, H);
  const px = dpr / Sc;
  // trees once plants have spread
  if (veg > 0.3 && cam.z > 0.7) {
    const x0 = Math.max(0, Math.floor((cam.x - vx) / TS)), x1 = Math.min(TW - 1, Math.ceil((cam.x + vx) / TS));
    const y0 = Math.max(0, Math.floor((cam.y - vy) / TS)), y1 = Math.min(TH - 1, Math.ceil((cam.y + vy) / TS));
    ctx.fillStyle = 'rgba(25,60,28,0.85)';
    ctx.beginPath();
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (tile[ty * TW + tx] !== FOREST) continue;
      const hsh = Math.sin(tx * 12.9898 + ty * 78.233) * 43758.5453, fr = hsh - Math.floor(hsh);
      if (fr > veg) continue;
      const x = (tx + fr) * TS, y = (ty + ((fr * 7) % 1)) * TS, rr = 6 + fr * 5;
      ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, 7);
    }
    ctx.fill();
  }
  // vent glow
  { const gr = ctx.createRadialGradient(vent.x, vent.y, 0, vent.x, vent.y, 70); gr.addColorStop(0, `rgba(255,160,90,${0.35 + Math.sin(t * 2) * 0.08})`); gr.addColorStop(1, 'rgba(255,120,60,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(vent.x, vent.y, 70, 0, 7); ctx.fill(); }
  for (const c of craters) { ctx.fillStyle = `rgba(30,20,15,${Math.min(0.5, c.t / 6000)})`; ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 0.8, 0, 7); ctx.fill(); }
  // food when close enough to see it
  if (cam.z > 0.55) {
    const cols = ['rgba(150,230,190,0.75)', 'rgba(120,200,90,0.9)', 'rgba(200,80,70,0.9)'];
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = cols[k]; ctx.beginPath();
      const rr = k === 0 ? 1.4 : 2.4;
      for (const f of food) if (!f.dead && f.kind === k && vis(f.x, f.y)) { ctx.moveTo(f.x + rr, f.y); ctx.arc(f.x, f.y, rr, 0, 7); }
      ctx.fill();
    }
  }
  // life: full drawings close up, dots from far away
  for (const o of orgs) {
    if (o.dead || !vis(o.x, o.y)) continue;
    const S = species[o.sp];
    if (o.g.size * cam.z < 2.6) { const s = Math.max(o.g.size, 1.8 / cam.z); ctx.fillStyle = `hsl(${o.g.hue},60%,${o.tier === 3 ? 55 : 65}%)`; ctx.fillRect(o.x - s, o.y - s, s * 2, s * 2); }
    else drawOrg(o, S);
  }
  if (selected && !selected.dead) { ctx.strokeStyle = 'rgba(232,196,106,0.95)'; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.arc(selected.x, selected.y, Math.max(selected.g.size * 2.4, 10 * px), 0, 7); ctx.stroke(); }
  for (const e of effects) {
    e.t++; const p = e.t / (e.kind === 'meteor' ? 90 : 36);
    if (e.kind === 'meteor') { ctx.fillStyle = `rgba(255,170,80,${0.6 * (1 - p)})`; ctx.beginPath(); ctx.arc(e.x, e.y, 40 + p * 260, 0, 7); ctx.fill(); }
    else if (e.kind === 'feed') { ctx.strokeStyle = `rgba(140,230,150,${1 - p})`; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.arc(e.x, e.y, 6 + p * 50, 0, 7); ctx.stroke(); }
    else { ctx.strokeStyle = e.kind === 'cull' ? `rgba(255,122,138,${1 - p})` : `hsla(${e.hue},70%,70%,${1 - p})`; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.arc(e.x, e.y, 4 + p * 18, 0, 7); ctx.stroke(); }
  }
  effects = effects.filter(e => e.t < (e.kind === 'meteor' ? 90 : 36));
}

// ---------- HUD ----------
function renderHud() {
  $('sTime').textContent = fmtAgo(ago);
  const alive = species.filter(S => S.alive);
  $('sSpecies').textContent = alive.length;
  $('sLife').textContent = orgs.filter(o => !o.dead).length;
  const top = Math.max(0, ...alive.map(S => S.tier));
  $('eraName').textContent = TIERS[top].era;
  $('meteorBtn').textContent = meteorCd > 0 ? `Meteor ${Math.ceil(meteorCd / 60)}s` : 'Meteor';
  if (selected) renderInspector();
  if (!$('speciesPanel').hidden) renderSpecies();
}
const tierIcon = ['cell', 'swimmer', 'amphibian', 'land animal'];
function renderSpecies() {
  const list = species.filter(S => S.alive).sort((a, b) => b.tier - a.tier || b.count - a.count);
  const ext = species.length - list.length;
  $('spSub').textContent = `${list.length} alive · ${ext} extinct`;
  const key = list.map(S => S.id + ':' + S.count + S.favoured).join();
  if (key === renderSpecies.key) return; renderSpecies.key = key;
  $('spList').innerHTML = list.map(S => `<div class="sprow${S.favoured ? ' fav' : ''}" data-s="${S.id}">
    <i class="dot" style="background:hsl(${S.hue},60%,60%)"></i>
    <div><b>${S.name}</b><small>${tierIcon[S.tier]} · ${S.diet > 0.5 ? 'predator' : S.tier === 0 ? 'feeds on plankton' : 'grazer'}${S.parent !== null ? ' · from ' + species[S.parent].name : ''}</small></div>
    <span class="n">${S.count}</span>
    <button class="star" type="button" data-f="${S.id}" aria-label="Favour ${S.name}" aria-pressed="${S.favoured}">${S.favoured ? '★' : '☆'}</button></div>`).join('');
  $('spList').querySelectorAll('.star').forEach(b => b.onclick = e => { e.stopPropagation(); favourSpecies(species[+b.dataset.f]); });
  $('spList').querySelectorAll('.sprow').forEach(r => r.onclick = () => {
    const S = species[+r.dataset.s], o = orgs.find(x => !x.dead && x.sp === S.id);
    if (o) { select(o); following = o; camT.z = Math.max(camT.z, 1.6); }
  });
}
$('speciesBtn').onclick = () => { const p = $('speciesPanel'); p.hidden = !p.hidden; if (!p.hidden) { select(null); renderSpecies.key = ''; renderSpecies(); } };
$('spClose').onclick = () => { $('speciesPanel').hidden = true; };

// ---------- inspector ----------
const brainCv = $('brain'), bx = brainCv.getContext('2d');
function select(o) { selected = o; $('inspector').hidden = !o; if (o) { $('speciesPanel').hidden = true; renderInspector(); } else following = null; }
const bar = (label, v, lo, hi, txt) => `<span>${label}</span><div class="t"><i style="width:${clamp((v - lo) / (hi - lo), 0, 1) * 100}%"></i></div><span>${txt}</span>`;
function renderInspector() {
  const o = selected; if (!o) return;
  const S = species[o.sp];
  $('iName').textContent = S.name;
  $('iSub').textContent = o.dead ? 'Dead' : `${tierIcon[o.tier]} · generation ${o.gen}${S.favoured ? ' · favoured' : ''}`;
  $('iTraits').innerHTML = bar('Energy', o.e, 0, o.g.size * 10, Math.max(0, o.e).toFixed(0)) + bar('Size', o.g.size, 2, 16, o.g.size.toFixed(1)) +
    bar('Speed', o.g.speed, 0.6, 1.6, o.g.speed.toFixed(2)) + bar('Senses', o.g.sense, 0.6, 1.8, o.g.sense.toFixed(2)) +
    bar('Diet', o.g.diet, 0, 1, o.g.diet > 0.5 ? 'meat' : 'plants') + bar('Eaten', o.eaten, 0, 40, o.eaten) + bar('Offspring', o.kids, 0, 10, o.kids);
  $('aFavour').textContent = S.favoured ? 'Unfavour' : 'Favour species';
  $('aFollow').textContent = following === o ? 'Stop following' : 'Follow';
  drawBrain(o);
}
function drawBrain(o) {
  const w = brainCv.width, h = brainCv.height, w8 = o.g.w;
  bx.clearRect(0, 0, w, h);
  const colX = [170, w / 2 + 20, w - 90], py = (n, i) => 16 + i * (h - 32) / Math.max(1, n - 1);
  const col = (s, a) => s >= 0 ? `rgba(127,224,200,${a})` : `rgba(255,122,138,${a})`;
  const node = (x, y, a) => { bx.beginPath(); bx.arc(x, y, 7, 0, 7); bx.fillStyle = col(a, 0.15 + Math.abs(a) * 0.85); bx.fill(); bx.strokeStyle = 'rgba(215,235,230,0.4)'; bx.lineWidth = 1; bx.stroke(); };
  const edge = (x1, y1, x2, y2, wt, act) => { const s = wt * act; bx.strokeStyle = col(s, Math.min(0.9, Math.abs(s) * 0.35)); bx.lineWidth = 0.5 + Math.min(3, Math.abs(wt)); bx.beginPath(); bx.moveTo(x1, y1); bx.lineTo(x2, y2); bx.stroke(); };
  for (let hh = 0; hh < NH; hh++) for (let i = 0; i < NI; i++) edge(colX[0], py(NI, i), colX[1], py(NH, hh), w8[hh * NI + i], o.inp[i]);
  for (let k = 0; k < NO; k++) for (let hh = 0; hh < NH; hh++) edge(colX[1], py(NH, hh), colX[2], py(NO, k), w8[HO + k * NH + hh], o.hid[hh]);
  bx.font = '20px "IBM Plex Mono", monospace'; bx.textBaseline = 'middle';
  for (let i = 0; i < NI; i++) { node(colX[0], py(NI, i), o.inp[i]); bx.fillStyle = '#9fbab4'; bx.textAlign = 'right'; bx.fillText(IN_LABELS[i], colX[0] - 14, py(NI, i)); }
  for (let hh = 0; hh < NH; hh++) node(colX[1], py(NH, hh), o.hid[hh]);
  for (let k = 0; k < NO; k++) { node(colX[2], py(NO, k), o.out[k]); bx.fillStyle = '#d7ebe6'; bx.textAlign = 'left'; bx.fillText(OUT_LABELS[k], colX[2] + 14, py(NO, k)); }
}
$('iClose').onclick = () => select(null);
$('aCull').onclick = () => cull(selected);
$('aFavour').onclick = () => { if (selected) favourSpecies(species[selected.sp]); };
$('aFollow').onclick = () => { if (!selected) return; following = following === selected ? null : selected; if (following) camT.z = Math.max(camT.z, 1.8); renderInspector(); };

// ---------- input: drag to pan, pinch or wheel to zoom, tap to use a tool ----------
const pointers = new Map(); let drag = null, pinch = null;
const toWorld = (px, py) => ({ x: (px - innerWidth / 2) / cam.z + cam.x, y: (py - innerHeight / 2) / cam.z + cam.y });
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, cx: camT.x, cy: camT.y, moved: false };
  else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: camT.z }; drag = null; }
});
cv.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; camT.z = clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, zMin, ZMAX); return; }
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) { drag.moved = true; following = null; }
    if (drag.moved) { camT.x = drag.cx - dx / cam.z; camT.y = drag.cy - dy / cam.z; cam.x = camT.x; cam.y = camT.y; }
  }
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (drag && !drag.moved && e.type === 'pointerup') tap(toWorld(e.clientX, e.clientY));
  if (!pointers.size) drag = null;
}
cv.addEventListener('pointerup', endPointer); cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const before = toWorld(e.clientX, e.clientY), nz = clamp(camT.z * Math.exp(-e.deltaY * 0.0015), zMin, ZMAX);
  camT.z = nz; cam.z = nz; following = null;
  const after = toWorld(e.clientX, e.clientY); camT.x += before.x - after.x; camT.y += before.y - after.y; cam.x = camT.x; cam.y = camT.y;
}, { passive: false });
function pick(p) {
  const tol = 18 / cam.z; let best = null, bd = Infinity;
  for (const o of orgs) { if (o.dead) continue; const d = Math.hypot(o.x - p.x, o.y - p.y) - o.g.size; if (d < tol && d < bd) { bd = d; best = o; } }
  return best;
}
function tap(p) {
  if (tool === 'cull') { const o = pick(p); if (o) cull(o); return; }
  if (tool === 'feed') return feed(p.x, p.y);
  if (tool === 'meteor') return meteor(p.x, p.y);
  select(pick(p));
}
function setTool(t) {
  tool = t;
  document.querySelectorAll('[data-tool]').forEach(x => x.setAttribute('aria-pressed', x.dataset.tool === t));
  const hint = { cull: 'Cull: tap a creature to remove it from the gene pool.', feed: 'Feed: tap to drop food. Plankton in water, plants on land.', meteor: 'Meteor: tap anywhere to strike. It wipes out everything nearby.', look: 'Look: drag to move, pinch or scroll to zoom, tap a creature to inspect it.' }[t];
  toast(hint);
}
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
function togglePause() { paused = !paused; $('pauseBtn').setAttribute('aria-pressed', paused); }
$('pauseBtn').onclick = togglePause;
$('speedBtn').onclick = () => { speedIdx = (speedIdx + 1) % SPEEDS.length; $('speedBtn').textContent = SPEEDS[speedIdx] + '×'; };
$('zoomIn').onclick = () => { camT.z = clamp(camT.z * 1.6, zMin, ZMAX); };
$('zoomOut').onclick = () => { camT.z = clamp(camT.z / 1.6, zMin, ZMAX); };
$('worldBtn').onclick = () => { following = null; camT.z = zMin; camT.x = W / 2; camT.y = H / 2; };
addEventListener('keydown', e => {
  if (stopped) return;
  if (e.code === 'Space') { togglePause(); e.preventDefault(); }
  if (e.key === '+' || e.key === '=') $('zoomIn').click();
  if (e.key === '-') $('zoomOut').click();
  if (e.key === 'Escape') { if (PR.modal.open && PR.modal.close) PR.modal.close(); else select(null); }
});
$('goals').addEventListener('click', e => { if (innerWidth <= 760 && !e.target.closest('li')) $('goals').classList.toggle('min'); });
if (innerWidth <= 760) $('goals').classList.add('min');

// ---------- intro ----------
function intro() {
  showModal({ eyebrow: '3.8 billion years ago', title: 'One world, from cells to civilization',
    body: `<p>Life is about to begin at a vent in the ocean. Everything happens on this one map: watch cells become swimmers, plants cover the land, creatures crawl out of the water and land animals form herds. Every creature has a small brain that evolves.</p>
    <ul class="howto">
      <li><b>WATCH</b><span>Drag to move around, pinch or scroll to zoom. Tap any creature to see its brain, or follow it.</span></li>
      <li><b>FAVOUR</b><span>Open Species and star one. It uses less energy and evolves to the next stage faster.</span></li>
      <li><b>SELECT</b><span>You are natural selection. Cull creatures you don't want, feed the ones you do, or drop a meteor to reset a region.</span></li>
      <li><b>SPEED</b><span>Speed up time to watch millions of years pass. The history panel tells you what comes next.</span></li>
    </ul>`,
    buttons: [['Begin', null, true]] });
}

// ---------- save ----------
function serialize() {
  return { seed, tick, ago, lastUp, nextId, veg, flags, log, meteorCd,
    species: species.map(S => ({ ...S })),
    orgs: orgs.filter(o => !o.dead).map(o => [o.id, o.sp, PR.r1(o.x), PR.r1(o.y), +o.a.toFixed(2), PR.r1(o.e), o.age, o.gen, Math.round(o.maxAge), o.eaten, o.kills, o.kids, PR.r1(o.g.size), +o.g.speed.toFixed(3), +o.g.sense.toFixed(3), +o.g.diet.toFixed(3), PR.r1(o.g.hue), PR.packW(o.g.w), o.dry]),
    cam: { x: Math.round(camT.x), y: Math.round(camT.y), z: +camT.z.toFixed(3) } };
}
function restore(s) {
  ({ tick, nextId, veg, meteorCd } = s); ago = s.ago ?? 3800; lastUp = s.lastUp ?? tick; flags = s.flags || {}; log = s.log || [];
  species = s.species; orgs = [];
  for (const a of s.orgs) {
    const S = species[a[1]];
    const o = makeOrg({ w: new Float32Array(a[17]), size: a[12], speed: a[13], sense: a[14], diet: a[15], hue: a[16] }, a[2], a[3], a[1], a[7], a[5]);
    Object.assign(o, { id: a[0], tier: S.tier, a: a[4], age: a[6], maxAge: a[8], eaten: a[9], kills: a[10], kids: a[11], dry: a[18] || 0 }); orgs.push(o);
  }
  food = []; foodCount = [0, 0, 0];
  for (let i = 0; i < 600; i++) { const p = randTile(Math.random() < 0.75 ? byType[SHAL] : byType[DEEP]); addFood(p.x, p.y, 0); }
  if (veg > 0.02) for (let i = 0; i < 900 * veg; i++) { const p = randTile(Math.random() < 0.5 ? byType[FOREST] : byType[GRASS]); addFood(p.x, p.y, 1); }
  if (s.cam) { Object.assign(camT, s.cam); Object.assign(cam, s.cam); }
  census(); renderLog();
}

// ---------- loop ----------
if (saved && saved.orgs) restore(saved);
else {
  newWorld();
  for (let i = 0; i < 10; i++) step();
  camT.x = cam.x = vent.x; camT.y = cam.y = vent.y; camT.z = cam.z = clamp(Math.min(innerWidth, innerHeight) / 380, 1.1, 2.4);
  intro();
}
renderLog();
let hudT = 0;
function frame(t) {
  if (stopped) return;
  if (!paused && !PR.modal.open) { const end = performance.now() + 14; for (let i = 0; i < SPEEDS[speedIdx] && (i === 0 || performance.now() < end); i++) step(); }
  updateCamera(); draw();
  if (t - hudT > 300) { hudT = t; renderHud(); }
  else if (selected && !paused) drawBrain(selected);
  requestAnimationFrame(frame);
}
renderHud();
requestAnimationFrame(frame);
window.__world = { step, get stats() { return { tick, ago: fmtAgo(ago), veg: +veg.toFixed(2), life: orgs.filter(o => !o.dead).length, food: foodCount.slice(), flags: Object.keys(flags), species: species.filter(S => S.alive).map(S => `${S.name}:t${S.tier}:${S.count}:d${S.diet.toFixed(1)}`) }; }, favourTop: tier => { const S = species.filter(x => x.alive && x.tier === tier).sort((a, b) => b.count - a.count)[0]; if (S && !S.favoured) favourSpecies(S); } };
return { stop() { stopped = true; }, serialize };
} };
