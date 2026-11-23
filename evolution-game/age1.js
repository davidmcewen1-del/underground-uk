// HUD markup for Age 1, inserted into #hud when the age starts
const HUD1 = `
  <div id="readout">
    <div class="panel brand">PRIMORDIAL<small>Age 1 · Primordial Soup</small></div>
    <div class="panel stat" id="sTimeBox"><span class="label">Time</span><b id="sTime">0</b></div>
    <div class="panel stat"><span class="label">Yours</span><b id="sPop">0</b></div>
    <div class="panel stat"><span class="label">Gen</span><b id="sGen">0</b></div>
    <button class="panel stat" id="dnaBtn" type="button" aria-label="Open evolve panel"><span class="label">DNA</span><b id="sDna">0</b></button>
    <div class="panel sharebox"><span class="label">Share of the pool</span><div class="share" id="share"></div><div class="row"><span>Yours</span><b id="sShare">0%</b></div></div>
    <div class="panel chartbox">
      <canvas id="chart" width="300" height="88"></canvas>
      <div class="legend"><span><i style="background:var(--accent)"></i>your foraging</span><span><i style="background:var(--warn)"></i>best rival</span></div>
    </div>
  </div>

  <div id="banner" class="panel" hidden><b id="bTitle"></b><span id="bText"></span><div class="t"><i id="bBar"></i></div></div>

  <section id="goals" class="panel" aria-label="Goals">
    <span class="label">Goals to finish Age 1</span>
    <h2 id="goalTitle">Rule the pool</h2>
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
      <canvas id="brain" width="560" height="340"></canvas>
    </div>
    <div class="actions">
      <button class="btn go" id="aControl" type="button">Take control</button>
      <button class="btn" id="aFavour" type="button">Favour · 1 DNA</button>
      <button class="btn danger" id="aCull" type="button">Cull</button>
    </div>
  </aside>

  <aside id="evolve" class="panel side" hidden aria-label="Evolve">
    <header>
      <div><h3>Evolve your species</h3><div class="sub" id="eSub">DNA</div></div>
      <button class="close" id="eClose" type="button" aria-label="Close evolve panel">×</button>
    </header>
    <div id="upgList" style="display:flex;flex-direction:column;gap:6px"></div>
    <div class="rivals"><span class="label">Rivals are evolving too</span><div id="rivalList" class="rivals"></div></div>
    <p class="note">Upgrades apply to every cell of your species, now and in future generations. Brains still have to learn how to use them.</p>
  </aside>


  <nav id="toolbar" class="panel" aria-label="Tools">
    <button class="btn" data-tool="swim" aria-pressed="true" type="button">Swim</button>
    <button class="btn" data-tool="inspect" aria-pressed="false" type="button">Inspect</button>
    <button class="btn danger" data-tool="cull" aria-pressed="false" type="button">Cull</button>
    <button class="btn" data-tool="feed" aria-pressed="false" type="button">Feed</button>
    <span class="sep"></span>
    <button class="btn" id="pauseBtn" aria-pressed="false" type="button" aria-label="Pause">❚❚</button>
    <button class="btn" id="speedBtn" type="button" aria-label="Game speed">1×</button>
    <span class="sep"></span>
    <button class="btn" id="viewBtn" type="button" aria-label="Toggle close-up or whole-pool view">Whole pool</button>
  </nav>

`;

// Age 1: Primordial Soup. Single cells with evolving neural-network brains.
PR.ages[1] = { start(saved) {
'use strict';
const { $, rnd, gauss, clamp } = PR;
$('hud').innerHTML = HUD1;
const cv = $('world'), ctx = cv.getContext('2d');
let stopped = false;

// ---------- world size ----------
let W, H;
{ const vw = innerWidth, vh = innerHeight, s = Math.max(0.55, Math.min(1.1, Math.min(vw, vh) / 700)); W = Math.round(vw / s); H = Math.round(vh / s); }
if (saved && saved.W) { W = saved.W; H = saved.H; }
const AREA = W * H, FOOD_MAX = Math.round(AREA / 1500), FOOD_RATE = AREA / 650000, G = 100;
const wrapD = (d, L) => d > L / 2 ? d - L : d < -L / 2 ? d + L : d;
const wrapP = (v, L) => ((v % L) + L) % L;

// ---------- brain ----------
const NI = 11, NH = 8, NO = 3;
const IH = NI * NH, HB = IH, HO = IH + NH, OB = HO + NH * NO, WN = OB + NO;
const IN_LABELS = ['Food dir', 'Food near', 'Cell dir', 'Cell near', 'Cell size', 'Kin', 'Danger', 'Energy', 'Bias', 'Rhythm', 'Memory'];
const OUT_LABELS = ['Turn', 'Swim', 'Attack'];
function randomGenome(hue) {
  const w = new Float32Array(WN);
  for (let i = 0; i < WN; i++) w[i] = rnd(1.2);
  return { w, size: 6 + Math.random() * 4, speed: 1 + Math.random() * 0.8, sense: 80 + Math.random() * 60, hue: hue + rnd(12) };
}
function mutate(g, base, rate = 1) {
  const w = new Float32Array(g.w);
  for (let i = 0; i < WN; i++) if (Math.random() < 0.12 * rate) w[i] = clamp(w[i] + gauss() * 0.45, -4, 4);
  return {
    w, size: clamp(g.size + gauss() * 0.5 * rate, 3.5, 16), speed: clamp(g.speed + gauss() * 0.1 * rate, 0.4, 3),
    sense: clamp(g.sense + gauss() * 8 * rate, 40, 260), hue: base + clamp(g.hue - base + gauss() * 3, -18, 18),
  };
}
function think(c, inp) {
  const w = c.g.w, hid = c.hid, out = c.out;
  for (let h = 0; h < NH; h++) { let s = w[HB + h]; for (let i = 0; i < NI; i++) s += w[h * NI + i] * inp[i]; hid[h] = Math.tanh(s); }
  for (let o = 0; o < NO; o++) { let s = w[OB + o]; for (let h = 0; h < NH; h++) s += w[HO + o * NH + h] * hid[h]; out[o] = Math.tanh(s); }
}

// ---------- species and upgrades ----------
const UPG = [
  { k: 'flag', best: 'Racing rivals to food and escaping hunters', name: 'Flagella', desc: 'Swim 15% faster', base: 8 },
  { k: 'eye', best: 'Spotting food and danger early', name: 'Eyespot', desc: 'See 25% further', base: 6 },
  { k: 'metab', best: 'Surviving ice ages and famine', name: 'Efficient metabolism', desc: 'Use 12% less energy', base: 10 },
  { k: 'split', best: 'Growing your numbers fast', name: 'Rapid division', desc: 'Divide with less stored energy', base: 10 },
  { k: 'spike', best: 'Hunting more of the rivals', name: 'Spines', desc: 'Hunt cells closer to your own size', base: 12 },
  { k: 'shell', best: 'Not getting eaten', name: 'Shell', desc: 'Harder to eat. Slightly heavier', base: 12 },
];
const MAXLV = 3;
const upgCost = (u, lv) => Math.round(u.base * (1 + lv * 1.6));
const SPECIES_DEF = [
  { name: 'Your species', hue: 165 }, { name: 'Crimson', hue: 352 }, { name: 'Amber', hue: 40 }, { name: 'Violet', hue: 268 },
];
let species;
function mods(S) {
  const l = S.lv;
  S.mod = {
    speed: 1 + 0.15 * l.flag, sense: 1 + 0.25 * l.eye,
    cost: (1 - 0.12 * l.metab) * (1 + 0.05 * l.spike + 0.06 * l.shell),
    repro: 0.82 - 0.09 * l.split,
  };
}
function buy(S, u) {
  const lv = S.lv[u.k]; if (lv >= MAXLV) return false;
  const cost = upgCost(u, lv); if (S.dna < cost) return false;
  S.dna -= cost; S.lv[u.k]++; mods(S); return true;
}

// ---------- state ----------
let cells, food, nextId, tick, speedIdx, paused, tool, selected, avatar, kills, history, effects, flags;
let ev, nextEv, evOrder, survived, won, lost, gameStart, respawnAt;
const SPEEDS = [1, 3, 8];
const GRACE = 3600;
function makeCell(g, x, y, gen, sp, e = 40) {
  return {
    id: nextId++, g, x, y, a: Math.random() * Math.PI * 2, e, age: 0, gen, sp, maxAge: 2600 + Math.random() * 1400,
    hid: new Float32Array(NH), out: new Float32Array(NO), inp: new Float32Array(NI),
    eaten: 0, kills: 0, kids: 0, dead: false, phase: Math.random() * 10, thrust: 0,
  };
}
function addFood(x, y) { if (food.length < FOOD_MAX * 1.6) food.push({ x: wrapP(x, W), y: wrapP(y, H), dead: false, r: 1.6 + Math.random() * 1.4 }); }
function newGame() {
  cells = []; food = []; nextId = 1; tick = 0; kills = 0; history = []; effects = []; flags = {};
  if (typeof GOALS !== 'undefined') GOALS.forEach(g => g.done = false);
  selected = null; avatar = null; ev = null; nextEv = 2200; survived = 0; won = false; lost = false; respawnAt = 0;
  evOrder = ['vent', 'amoeba', 'ice', 'bloom'].sort(() => Math.random() - 0.5);
  if (evOrder[0] === 'bloom') evOrder.push(evOrder.shift()); // open with a real threat
  evOrder.splice(2, 0, 'plague');
  species = SPECIES_DEF.map((d, i) => { const S = { ...d, i, dna: i ? 0 : 10, lv: { flag: 0, eye: 0, spike: 0, shell: 0, metab: 0, split: 0 }, kills: 0, count: 0, maxGen: 0, deathLog: [], extinct: false }; mods(S); return S; });
  for (let i = 0; i < FOOD_MAX * 0.6; i++) addFood(Math.random() * W, Math.random() * H);
  const per = Math.max(10, Math.round(AREA / 60000));
  for (const S of species) {
    const cx = Math.random() * W, cy = Math.random() * H;
    for (let i = 0; i < per; i++) cells.push(makeCell(randomGenome(S.hue), wrapP(cx + rnd(W * 0.3), W), wrapP(cy + rnd(H * 0.3), H), 0, S.i));
  }
  possess(cells.find(c => c.sp === 0));
  select(null); closeEvolve();
}

// ---------- spatial grid ----------
let gc, gr, gridF, gridC;
function buildGrid() {
  gc = Math.ceil(W / G); gr = Math.ceil(H / G);
  gridF = Array.from({ length: gc * gr }, () => []);
  gridC = Array.from({ length: gc * gr }, () => []);
  const at = o => clamp(Math.floor(o.y / G), 0, gr - 1) * gc + clamp(Math.floor(o.x / G), 0, gc - 1);
  for (const f of food) if (!f.dead) gridF[at(f)].push(f);
  for (const c of cells) if (!c.dead) gridC[at(c)].push(c);
}
function nearest(c, grid, R, isCell) {
  const cr = Math.ceil(R / G), cx = Math.floor(c.x / G), cy = Math.floor(c.y / G);
  let best = null, bd = R * R, bdx = 0, bdy = 0;
  for (let j = -cr; j <= cr; j++) for (let i = -cr; i <= cr; i++) {
    const list = grid[wrapP(cy + j, gr) * gc + wrapP(cx + i, gc)];
    for (const o of list) {
      if (o.dead || (isCell && o === c)) continue;
      const dx = wrapD(o.x - c.x, W), dy = wrapD(o.y - c.y, H), d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = o; bdx = dx; bdy = dy; }
    }
  }
  return best ? { o: best, d: Math.sqrt(bd), dx: bdx, dy: bdy } : null;
}
const angTo = (a, dx, dy) => { let r = Math.atan2(dy, dx) - a; while (r > Math.PI) r -= 2 * Math.PI; while (r < -Math.PI) r += 2 * Math.PI; return r; };

// ---------- hazards ----------
function hazardAt(x, y) {
  if (!ev) return 0;
  if (ev.type === 'vent') { const d = Math.hypot(wrapD(x - ev.x, W), wrapD(y - ev.y, H)); return d < ev.r ? 1 - d / ev.r : 0; }
  if (ev.type === 'amoeba') { const m = ev.m, d = Math.hypot(wrapD(x - m.x, W), wrapD(y - m.y, H)); return clamp(1 - (d - m.r) / 120, 0, 1); }
  return 0;
}
const EVENTS = {
  vent: { title: 'Volcanic vent', warn: 'A vent is about to open. Swim away from the glow.', text: 'Boiling water. Cells inside lose energy fast.' },
  amoeba: { title: 'Giant amoeba', warn: 'Something huge is coming. Keep your cells moving.', text: 'A giant amoeba is hunting the pool.' },
  ice: { title: 'Ice age', warn: 'The water is cooling. Food is about to run short.', text: 'Food grows slowly and every cell burns more energy.' },
  plague: { title: 'Plague', warn: 'A virus is coming. It hits the most crowded species hardest.', text: 'A virus is spreading through the most crowded species.' },
  bloom: { title: 'Algae bloom', warn: 'Nutrients are rising from below.', text: 'A rich patch of food. Get there first.' },
};
function startEvent() {
  const type = evOrder[survived % evOrder.length];
  ev = { type, t0: tick, dur: 1700, x: Math.random() * W, y: Math.random() * H };
  if (type === 'vent') {
    // open the vent near the biggest crowd of your cells to make it matter
    const mine = cells.filter(c => !c.dead && c.sp === 0); const p = mine[Math.floor(Math.random() * mine.length)];
    if (p) { ev.x = p.x + rnd(60); ev.y = p.y + rnd(60); }
    ev.r = Math.min(W, H) * 0.22;
  }
  if (type === 'amoeba') ev.m = { x: Math.random() * W, y: Math.random() * H, r: 26, a: 0, phase: 0, ate: 0 };
  if (type === 'bloom') { ev.r = Math.min(W, H) * 0.14; for (let i = 0; i < 160; i++) { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * ev.r; addFood(ev.x + Math.cos(a) * d, ev.y + Math.sin(a) * d); } }
  if (type === 'plague') {
    const big = species.reduce((a, S) => S.count > a.count ? S : a); ev.target = big.i;
    toast(`Plague! ${big.i ? big.name + ' is' : 'Your species is'} the most crowded and is getting sick.`, true);
    return;
  }
}
function endEvent() {
  const alive = species.filter(S => S.count > 0);
  for (const S of alive) S.dna += 8;
  if (species[0].count > 0) { survived++; toast(`You survived the ${EVENTS[ev.type].title.toLowerCase()}. +8 DNA.`); }
  ev = null; nextEv = tick + 2600;
  // extinct rivals are replaced by a fresh strain drifting in from another pool
  for (const S of species) if (S.i && S.extinct && species[0].count > 0) {
    S.extinct = false; S.strain = (S.strain || 1) + 1; S.dna = 0;
    const cx = Math.random() * W, cy = Math.random() * H;
    for (let i = 0; i < 12; i++) cells.push(makeCell(randomGenome(S.hue), wrapP(cx + rnd(80), W), wrapP(cy + rnd(80), H), 0, S.i, 60));
    toast(`A new ${S.name} strain has drifted into the pool.`);
  }
}
function stepAmoeba() {
  const m = ev.m; m.phase += 0.05;
  let best = null, bd = 320;
  for (const c of cells) { if (c.dead) continue; const d = Math.hypot(wrapD(c.x - m.x, W), wrapD(c.y - m.y, H)); if (d < bd) { bd = d; best = c; } }
  const ta = best ? Math.atan2(wrapD(best.y - m.y, H), wrapD(best.x - m.x, W)) : m.a + rnd(0.2);
  m.a += clamp(angTo(m.a, Math.cos(ta), Math.sin(ta)), -0.04, 0.04);
  const v = 0.75 + (best ? 0.25 : 0);
  m.x = wrapP(m.x + Math.cos(m.a) * v, W); m.y = wrapP(m.y + Math.sin(m.a) * v, H);
  for (const c of cells) {
    if (c.dead) continue;
    if (Math.hypot(wrapD(c.x - m.x, W), wrapD(c.y - m.y, H)) < m.r + c.g.size * 0.3) {
      c.dead = true; m.ate++; m.r = Math.min(52, m.r + 0.35);
      effects.push({ x: c.x, y: c.y, t: 0, hue: c.g.hue, kind: 'eat' }); onDeath(c);
    }
  }
}

// ---------- simulation ----------
const keys = {};
let botPlayer = false; // test hook: lets the player species auto-buy like a rival
let steer = null; // world point the player is pressing
function step() {
  tick++;
  const ice = ev && ev.type === 'ice';
  let rate = FOOD_RATE * (ice ? 0.3 : 1);
  const cap = FOOD_MAX * (ice ? 0.45 : 1);
  while (rate > 0) { if (Math.random() < rate && food.length < cap) addFood(Math.random() * W, Math.random() * H); rate -= 1; }
  if (ev && ev.type === 'bloom' && Math.random() < 0.5) { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * ev.r; addFood(ev.x + Math.cos(a) * d, ev.y + Math.sin(a) * d); }
  buildGrid();
  const born = [];
  for (const c of cells) {
    if (c.dead) continue;
    const S = species[c.sp], M = S.mod, g = c.g, inp = c.inp;
    const sense = g.sense * M.sense;
    const nf = nearest(c, gridF, sense, false), nc = nearest(c, gridC, sense, true);
    const danger = hazardAt(c.x, c.y);
    inp[0] = nf ? angTo(c.a, nf.dx, nf.dy) / Math.PI : 0;
    inp[1] = nf ? 1 - nf.d / sense : 0;
    inp[2] = nc ? angTo(c.a, nc.dx, nc.dy) / Math.PI : 0;
    inp[3] = nc ? 1 - nc.d / sense : 0;
    inp[4] = nc ? Math.tanh((nc.o.g.size - g.size) / g.size * 2) : 0;
    inp[5] = nc ? (nc.o.sp === c.sp ? 1 : -1) : 0;
    inp[6] = danger;
    inp[7] = c.e / (g.size * 10);
    inp[8] = 1;
    inp[9] = Math.sin(c.age * 0.05);
    inp[10] = c.thrust;
    let attack;
    if (c === avatar) {
      let want = null, thrust = 0.15;
      const kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), ky = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      if (kx || ky) { want = Math.atan2(ky, kx); thrust = 1; }
      else if (steer) {
        const dx = wrapD(steer.x - c.x, W), dy = wrapD(steer.y - c.y, H), d = Math.hypot(dx, dy);
        if (d > g.size) { want = Math.atan2(dy, dx); thrust = clamp(d / 50, 0.35, 1); }
      }
      const turn = want === null ? 0 : clamp(angTo(c.a, Math.cos(want), Math.sin(want)), -0.2, 0.2);
      c.a += turn; c.thrust = thrust; attack = true;
      c.out[0] = turn / 0.2; c.out[1] = thrust * 2 - 1; c.out[2] = 1;
      think(c, inp); // keep the brain visual alive, then override with the player's input
      c.out[0] = turn / 0.2; c.out[1] = thrust * 2 - 1; c.out[2] = 1;
    } else {
      think(c, inp);
      c.a += c.out[0] * 0.14;
      c.thrust = (c.out[1] + 1) / 2;
      attack = c.out[2] > 0.3;
    }
    const v = c.thrust * g.speed * M.speed;
    c.x = wrapP(c.x + Math.cos(c.a) * v, W);
    c.y = wrapP(c.y + Math.sin(c.a) * v, H);
    c.phase += 0.15 + v * 0.25;
    c.e -= (0.012 + 0.0026 * g.size + 0.0065 * c.thrust * g.speed * g.speed * g.size / 8 + (attack && c !== avatar ? 0.012 : 0) + sense * 0.00003) * M.cost * (ice ? 1.25 : 1) * (S.count < 15 ? 0.6 : 1);
    if (ev && ev.type === 'vent') c.e -= danger * 0.3;
    c.age++;
    if (nf && nf.d < g.size + 3 && !nf.o.dead) { nf.o.dead = true; c.e += 12; c.eaten++; S.dna += c === avatar ? 1 : 0.07; }
    if (attack && c.e < g.size * 10 * 0.75 && nc && !nc.o.dead && nc.o.sp !== c.sp && nc.d < g.size + nc.o.g.size) {
      const prey = nc.o, P = species[prey.sp];
      const need = Math.max(0.95, 1.38 - 0.12 * S.lv.spike + 0.12 * P.lv.shell);
      if (g.size > prey.g.size * need) {
        prey.dead = true; c.e += prey.e * 0.45 + prey.g.size; c.kills++; S.kills++;
        S.dna += c === avatar ? 4 : 0.5;
        effects.push({ x: prey.x, y: prey.y, t: 0, hue: prey.g.hue, kind: 'eat' });
        if (prey === avatar) toast(`Your cell was eaten by ${S.name}.`);
        onDeath(prey);
        if (!flags.firstKill) { flags.firstKill = true; toast('Predation has evolved. A cell just ate another cell.', true); }
      }
    }
    const maxE = g.size * 10;
    if (c.e > maxE) c.e = maxE;
    if (c.e > maxE * M.repro && c.age > 150) {
      c.e /= 2; c.kids++;
      const k = makeCell(mutate(g, S.hue), wrapP(c.x + rnd(4), W), wrapP(c.y + rnd(4), H), c.gen + 1, c.sp, c.e);
      k.a = c.a + Math.PI; born.push(k);
      if (k.gen > S.maxGen) { S.maxGen = k.gen; if (c.sp === 0 && S.maxGen % 5 === 0) toast(`Your species reached generation ${S.maxGen}.`); }
    }
    if (c.e <= 0 || c.age > c.maxAge) { c.dead = true; onDeath(c); }
  }
  if (born.length) cells.push(...born);
  if (ev && ev.type === 'amoeba') stepAmoeba();
  if (ev && ev.type === 'plague' && tick % 20 === 0) for (const c of cells) if (!c.dead && c.sp === ev.target && c !== avatar && Math.random() < 0.025) { c.dead = true; effects.push({ x: c.x, y: c.y, t: 0, hue: 90, kind: 'eat' }); onDeath(c); }
  if (tick % 30 === 0) { cells = cells.filter(c => !c.dead); food = food.filter(f => !f.dead); }
  // census
  if (tick % 10 === 0) {
    for (const S of species) S.count = 0;
    for (const c of cells) if (!c.dead) species[c.sp].count++;
    for (const S of species) {
      if (tick < GRACE && S.count < 5) cells.push(makeCell(randomGenome(S.hue), Math.random() * W, Math.random() * H, 0, S.i));
      else if (S.count === 0 && !S.extinct && tick >= GRACE) {
        S.extinct = true;
        if (S.i) toast(`${S.name} has gone extinct.`, true);
      }
    }
    if (species[0].extinct && !lost) { lost = true; setTimeout(gameOver, 600); }
  }
  // rivals spend DNA on random upgrades
  if (tick % 240 === 0) for (const S of species) if ((S.i || botPlayer) && !S.extinct) {
    const opts = UPG.filter(u => S.lv[u.k] < MAXLV); if (opts.length) buy(S, opts[Math.floor(Math.random() * opts.length)]);
  }
  // events
  if (!ev && tick === nextEv - 420) flags.warn = tick;
  if (!ev && tick >= nextEv) startEvent();
  if (ev && tick > ev.t0 + ev.dur) endEvent();
  // respawn control
  if ((!avatar || avatar.dead) && tick >= respawnAt && respawnAt) {
    const mine = cells.filter(c => !c.dead && c.sp === 0);
    if (mine.length) { possess(mine.sort((a, b) => b.e - a.e)[0]); toast('You took control of another of your cells.'); }
    respawnAt = 0;
  }
  if (tick % 120 === 0) record();
}
function onDeath(c) {
  const S = species[c.sp];
  if (c.age > 300) { S.deathLog.push(c.eaten / c.age * 1000); if (S.deathLog.length > 120) S.deathLog.shift(); }
  if (c === avatar) { avatar = null; respawnAt = tick + 90; if (!flags.avatarDied) { flags.avatarDied = true; toast('Your cell died. You will take over another one.'); } }
  if (selected === c) setTimeout(() => { if (selected === c) select(null); }, 900);
}
const skillOf = S => { const L = S.deathLog; if (L.length < 5) return 0; let s = 0; for (const v of L) s += v; return s / L.length; };
function record() {
  history.push({ me: skillOf(species[0]), rival: Math.max(...species.slice(1).map(skillOf)) });
  if (history.length > 240) history.shift();
}

// ---------- player actions ----------
function possess(c) { avatar = c || null; if (c) { respawnAt = 0; if (!flags.firstControl) flags.firstControl = true; } }
function spend(n) { const S = species[0]; if (S.dna < n) { toast(`You need ${n} DNA. Earn it by eating and hunting.`); return false; } S.dna -= n; return true; }
function cull(c) {
  if (!c || c.dead) return;
  if (c.sp !== 0 && !spend(3)) return;
  c.dead = true; effects.push({ x: c.x, y: c.y, t: 0, hue: c.g.hue, kind: 'cull' }); onDeath(c);
  if (!flags.firstCull) { flags.firstCull = true; toast(c.sp ? 'Rival culled for 3 DNA.' : 'Culled. Its genes are gone from your pool.'); }
}
function favour(c) { if (!c || c.dead || !spend(1)) return; c.e = Math.min(c.g.size * 10, c.e + c.g.size * 4); effects.push({ x: c.x, y: c.y, t: 0, kind: 'favour' }); }
function feed(x, y) { if (!spend(2)) return; for (let i = 0; i < 18; i++) addFood(x + rnd(40), y + rnd(40)); effects.push({ x, y, t: 0, kind: 'feed' }); }

// ---------- goals ----------
const AGES = [
  ['Primordial Soup', 'Single cells compete, hunt and learn.'],
  ['Multicellular', 'Cells join into bodies with limbs, mouths and eyes.'],
  ['Creatures', 'Animals roam the land. Herds, packs and predators.'],
  ['Tribe', 'Tools, fire and the first camps.'],
  ['Settlement', 'Workers learn jobs. Roads, farms and supply chains.'],
  ['Kingdom', 'Armies learn tactics against rival evolved peoples.'],
  ['City', 'Zoning, traffic, power and citizens with their own minds.'],
  ['Civilization', 'Nations, trade, science and diplomacy across the world.'],
];
const total = () => species.reduce((a, S) => a + S.count, 0) || 1;
const GOALS = [
  { t: 'Own half of the pool', v: () => species[0].count / total() * 100, max: 50, fmt: v => Math.floor(v) + '%' },
  { t: 'Reach generation 20', v: () => species[0].maxGen, max: 20 },
  { t: 'Survive 3 disasters', v: () => survived, max: 3 },
  { t: 'Win 25 hunts', v: () => species[0].kills, max: 25 },
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

// ---------- camera & rendering ----------
let dpr = 1, s0 = 1, zoomZ = 2, closeUp = true;
const cam = { x: W / 2, y: H / 2, z: 1 };
let bgCanvas;
function fit() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  s0 = Math.min(innerWidth / W, innerHeight / H);
  zoomZ = Math.max(1.6, 1.5 / s0);
  bgCanvas = document.createElement('canvas');
  bgCanvas.width = Math.ceil(W / 2); bgCanvas.height = Math.ceil(H / 2);
  const b = bgCanvas.getContext('2d'), bw = bgCanvas.width, bh = bgCanvas.height;
  b.fillStyle = '#0c2423'; b.fillRect(0, 0, bw, bh);
  // soft blotches that tile seamlessly
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * bw, y = Math.random() * bh, r = 30 + Math.random() * 90;
    for (const ox of [-bw, 0, bw]) for (const oy of [-bh, 0, bh]) {
      const gr = b.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(${30 + Math.random() * 20},${70 + Math.random() * 30},${60 + Math.random() * 20},0.25)`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      b.fillStyle = gr; b.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  for (let i = 0; i < 900; i++) {
    b.fillStyle = `rgba(${150 + Math.random() * 60},${190 + Math.random() * 50},${170 + Math.random() * 50},${Math.random() * 0.08})`;
    b.beginPath(); b.arc(Math.random() * bw, Math.random() * bh, Math.random() * 3, 0, 7); b.fill();
  }
}
fit();
addEventListener('resize', () => { if (!stopped) fit(); });
const scale = () => s0 * cam.z * dpr;
function updateCamera() {
  const follow = closeUp && avatar && !avatar.dead;
  const tz = follow ? zoomZ : 1;
  cam.z += (tz - cam.z) * 0.08;
  const tx = follow ? avatar.x : W / 2, ty = follow ? avatar.y : H / 2;
  cam.x = wrapP(cam.x + wrapD(tx - cam.x, W) * (follow ? 0.15 : 0.08), W);
  cam.y = wrapP(cam.y + wrapD(ty - cam.y, H) * (follow ? 0.15 : 0.08), H);
}
function drawCell(c, x, y) {
  const g = c.g, r = g.size, h = g.hue, S = species[c.sp];
  ctx.save(); ctx.translate(x, y); ctx.rotate(c.a);
  ctx.strokeStyle = `hsla(${h},45%,75%,0.45)`; ctx.lineWidth = Math.max(0.8, r * 0.12);
  const tails = 1 + S.lv.flag;
  for (let t = 0; t < tails; t++) {
    const off = (t - (tails - 1) / 2) * r * 0.35;
    ctx.beginPath();
    for (let k = 0; k <= 10; k++) { const u = k / 10, px = -r * 0.9 - u * r * 1.8, py = off + Math.sin(c.phase - u * 6 + t) * r * 0.4 * u; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
  }
  if (S.lv.spike) {
    ctx.strokeStyle = `hsla(${h},70%,85%,0.7)`; ctx.lineWidth = 1; ctx.beginPath();
    const n = 6 + S.lv.spike * 3;
    for (let k = 0; k < n; k++) { const an = -1.3 + k / (n - 1) * 2.6; ctx.moveTo(Math.cos(an) * r * 1.1, Math.sin(an) * r * 0.85); ctx.lineTo(Math.cos(an) * r * (1.45 + S.lv.spike * 0.1), Math.sin(an) * r * (1.15 + S.lv.spike * 0.08)); }
    ctx.stroke();
  }
  const wob = 1 + Math.sin(c.phase * 0.5) * 0.04;
  const grd = ctx.createRadialGradient(r * 0.2, -r * 0.2, r * 0.1, 0, 0, r * 1.15);
  grd.addColorStop(0, `hsla(${h},55%,70%,0.25)`); grd.addColorStop(0.75, `hsla(${h},60%,55%,0.45)`); grd.addColorStop(1, `hsla(${h},70%,72%,0.88)`);
  ctx.fillStyle = grd; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.15 * wob, r * 0.88 / wob, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = S.lv.shell ? `hsla(${h},40%,90%,${0.5 + S.lv.shell * 0.15})` : `hsla(${h},80%,85%,0.55)`;
  ctx.lineWidth = 0.9 + S.lv.shell * 0.9; ctx.stroke();
  ctx.fillStyle = `hsla(${(h + 40) % 360},50%,70%,0.35)`;
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(Math.cos(k * 2.1 + c.id) * r * 0.55, Math.sin(k * 2.1 + c.id) * r * 0.45, r * 0.12, 0, 7); ctx.fill(); }
  ctx.fillStyle = `hsla(${h},45%,22%,0.75)`; ctx.beginPath(); ctx.arc(-r * 0.15, 0, r * 0.34, 0, 7); ctx.fill();
  ctx.fillStyle = `rgba(255,${120 + g.sense / 3},90,${0.45 + S.lv.eye * 0.15})`; ctx.beginPath(); ctx.arc(r * 0.8, 0, Math.max(0.8, r * (0.13 + S.lv.eye * 0.04)), 0, 7); ctx.fill();
  ctx.restore();
}
function draw() {
  const S = scale(), Wc = cv.width, Hc = cv.height;
  const vx = Wc / 2 / S + 60, vy = Hc / 2 / S + 60; // half view in world units + margin
  const X = x => cam.x + wrapD(x - cam.x, W), Y = y => cam.y + wrapD(y - cam.y, H);
  const vis = (x, y) => Math.abs(x - cam.x) < vx && Math.abs(y - cam.y) < vy;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#040a0b'; ctx.fillRect(0, 0, Wc, Hc);
  ctx.setTransform(S, 0, 0, S, Wc / 2 - cam.x * S, Hc / 2 - cam.y * S);
  if (cam.z > 1.02) { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) ctx.drawImage(bgCanvas, i * W, j * H, W, H); }
  else ctx.drawImage(bgCanvas, 0, 0, W, H);
  const t = performance.now() / 1000;
  // hazards under everything
  if (ev && ev.type === 'vent') {
    const x = X(ev.x), y = Y(ev.y), pul = 1 + Math.sin(t * 3) * 0.04;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, ev.r * pul);
    gr.addColorStop(0, 'rgba(255,170,80,0.55)'); gr.addColorStop(0.5, 'rgba(255,110,50,0.25)'); gr.addColorStop(1, 'rgba(255,80,40,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, ev.r * pul, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,180,0.5)';
    for (let k = 0; k < 14; k++) { const a = k * 2.4 + t * 0.6, d = ((t * 30 + k * 23) % ev.r); ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2.5 - d / ev.r * 2, 0, 7); ctx.fill(); }
  }
  if (ev && ev.type === 'bloom') {
    const x = X(ev.x), y = Y(ev.y), gr = ctx.createRadialGradient(x, y, 0, x, y, ev.r * 1.3);
    gr.addColorStop(0, 'rgba(120,230,130,0.18)'); gr.addColorStop(1, 'rgba(120,230,130,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, ev.r * 1.3, 0, 7); ctx.fill();
  }
  // food
  ctx.fillStyle = 'rgba(110,220,140,0.12)'; ctx.beginPath();
  for (const f of food) { if (f.dead) continue; const x = X(f.x), y = Y(f.y); if (!vis(x, y)) continue; ctx.moveTo(x + f.r * 2.6, y); ctx.arc(x, y, f.r * 2.6, 0, 7); }
  ctx.fill();
  ctx.fillStyle = 'rgba(170,240,160,0.85)'; ctx.beginPath();
  for (const f of food) { if (f.dead) continue; const x = X(f.x), y = Y(f.y); if (!vis(x, y)) continue; ctx.moveTo(x + f.r, y); ctx.arc(x, y, f.r, 0, 7); }
  ctx.fill();
  // cells
  for (const c of cells) { if (c.dead) continue; const x = X(c.x), y = Y(c.y); if (vis(x, y)) drawCell(c, x, y); }
  // amoeba
  if (ev && ev.type === 'amoeba') {
    const m = ev.m, x = X(m.x), y = Y(m.y);
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath();
    for (let k = 0; k <= 40; k++) { const a = k / 40 * Math.PI * 2, rr = m.r * (1 + 0.16 * Math.sin(a * 3 + m.phase * 2) + 0.1 * Math.sin(a * 5 - m.phase * 3) + 0.18 * Math.max(0, Math.cos(a - m.a))); const px = Math.cos(a) * rr, py = Math.sin(a) * rr; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    const gr = ctx.createRadialGradient(0, 0, m.r * 0.2, 0, 0, m.r * 1.3);
    gr.addColorStop(0, 'rgba(200,190,160,0.35)'); gr.addColorStop(0.8, 'rgba(170,160,130,0.45)'); gr.addColorStop(1, 'rgba(230,220,190,0.8)');
    ctx.fillStyle = gr; ctx.fill(); ctx.strokeStyle = 'rgba(240,230,200,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(70,60,45,0.7)'; ctx.beginPath(); ctx.arc(-m.r * 0.2, m.r * 0.1, m.r * 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(150,200,140,0.35)';
    for (let k = 0; k < Math.min(12, m.ate); k++) { ctx.beginPath(); ctx.arc(Math.cos(k * 2.3) * m.r * 0.55, Math.sin(k * 2.3) * m.r * 0.5, 3, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  const px = 1 / S * dpr; // one css pixel in world units
  // avatar marker, steering line and energy ring
  if (avatar && !avatar.dead) {
    const a = avatar, x = X(a.x), y = Y(a.y), r = a.g.size * 1.7 + 4;
    if (steer) {
      const sx = x + wrapD(steer.x - a.x, W), sy = y + wrapD(steer.y - a.y, H);
      ctx.strokeStyle = 'rgba(232,196,106,0.3)'; ctx.lineWidth = 1.5 * px; ctx.setLineDash([3 * px, 5 * px]);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(sx, sy); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(sx, sy, 5 * px, 0, 7); ctx.stroke();
    }
    ctx.lineWidth = 2.5 * px;
    ctx.strokeStyle = 'rgba(232,196,106,0.2)'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
    const ef = clamp(a.e / (a.g.size * 10), 0, 1);
    ctx.strokeStyle = ef < 0.25 ? 'rgba(255,122,138,0.95)' : 'rgba(232,196,106,0.95)';
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + ef * Math.PI * 2); ctx.stroke();
  }
  if (selected && !selected.dead && selected !== avatar) {
    const x = X(selected.x), y = Y(selected.y);
    ctx.strokeStyle = 'rgba(215,235,230,0.8)'; ctx.lineWidth = 1.5 * px;
    ctx.beginPath(); ctx.arc(x, y, selected.g.size * 1.8 + 3, 0, 7); ctx.stroke();
    ctx.setLineDash([4 * px, 6 * px]); ctx.strokeStyle = 'rgba(215,235,230,0.22)';
    ctx.beginPath(); ctx.arc(x, y, selected.g.sense * species[selected.sp].mod.sense, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const e of effects) {
    e.t += 1; const p = e.t / 40, x = X(e.x), y = Y(e.y);
    if (e.kind === 'cull') {
      ctx.strokeStyle = `rgba(255,122,138,${1 - p})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 6 + p * 30, 0, 7); ctx.stroke();
      ctx.fillStyle = `hsla(${e.hue},40%,60%,${(1 - p) * 0.6})`;
      for (let k = 0; k < 8; k++) { const an = k * 0.785; ctx.beginPath(); ctx.arc(x + Math.cos(an) * p * 26, y + Math.sin(an) * p * 26, 2, 0, 7); ctx.fill(); }
    } else if (e.kind === 'eat') {
      ctx.strokeStyle = `hsla(${e.hue},70%,70%,${1 - p})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 4 + p * 16, 0, 7); ctx.stroke();
    } else {
      ctx.strokeStyle = e.kind === 'favour' ? `rgba(232,196,106,${1 - p})` : `rgba(140,230,150,${1 - p})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 4 + p * 40, 0, 7); ctx.stroke();
    }
  }
  effects = effects.filter(e => e.t < 40);
  // lens vignette, tinted cold during an ice age
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const vg = ctx.createRadialGradient(Wc / 2, Hc / 2, Math.min(Wc, Hc) * 0.35, Wc / 2, Hc / 2, Math.hypot(Wc, Hc) * 0.6);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, ev && ev.type === 'ice' ? 'rgba(150,200,255,0.35)' : 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, Wc, Hc);
  if (ev && ev.type === 'ice') { ctx.fillStyle = 'rgba(140,190,255,0.06)'; ctx.fillRect(0, 0, Wc, Hc); }
}

// ---------- HUD ----------
const chart = $('chart'), cx2 = chart.getContext('2d');
const fmtTime = t => { const my = t * 0.05; return my < 1000 ? my.toFixed(0) + ' Myr' : (my / 1000).toFixed(2) + ' Byr'; };
const hsl = h => `hsl(${h},55%,60%)`;
$('share').innerHTML = SPECIES_DEF.map(d => `<span style="background:${hsl(d.hue)}"></span>`).join('');
function renderHud() {
  const me = species[0], tot = total();
  $('sTime').textContent = fmtTime(tick);
  $('sPop').textContent = me.count;
  $('sGen').textContent = me.maxGen;
  $('sDna').textContent = Math.floor(me.dna);
  $('sShare').textContent = Math.round(me.count / tot * 100) + '%';
  [...$('share').children].forEach((el, i) => el.style.width = (species[i].count / tot * 100) + '%');
  $('dnaBtn').classList.toggle('ready', UPG.some(u => me.lv[u.k] < MAXLV && me.dna >= upgCost(u, me.lv[u.k])));
  // event banner
  const b = $('banner');
  if (ev) {
    b.hidden = false; $('bTitle').textContent = EVENTS[ev.type].title; $('bText').textContent = EVENTS[ev.type].text;
    $('bBar').style.width = (100 - (tick - ev.t0) / ev.dur * 100) + '%';
  } else if (tick >= nextEv - 420) {
    const type = evOrder[survived % evOrder.length];
    b.hidden = false; $('bTitle').textContent = 'Warning: ' + EVENTS[type].title.toLowerCase();
    $('bText').textContent = EVENTS[type].warn; $('bBar').style.width = ((nextEv - tick) / 420 * 100) + '%';
  } else b.hidden = true;
  // chart
  const w = chart.width, h = chart.height;
  cx2.clearRect(0, 0, w, h);
  cx2.strokeStyle = 'rgba(140,210,200,0.12)'; cx2.lineWidth = 1;
  for (let k = 1; k < 4; k++) { cx2.beginPath(); cx2.moveTo(0, h * k / 4); cx2.lineTo(w, h * k / 4); cx2.stroke(); }
  if (history.length > 1) {
    const mx = Math.max(1, ...history.map(p => Math.max(p.me, p.rival)));
    const line = (key, color, fill) => {
      cx2.beginPath();
      history.forEach((p, i) => { const x = i / (history.length - 1) * w, y = h - 4 - p[key] / mx * (h - 10); i ? cx2.lineTo(x, y) : cx2.moveTo(x, y); });
      cx2.strokeStyle = color; cx2.lineWidth = 2; cx2.stroke();
      if (fill) { cx2.lineTo(w, h); cx2.lineTo(0, h); cx2.closePath(); cx2.fillStyle = fill; cx2.fill(); }
      cx2.fillStyle = color; cx2.beginPath(); cx2.arc(w - 3, h - 4 - history[history.length - 1][key] / mx * (h - 10), 3, 0, 7); cx2.fill();
    };
    line('rival', 'rgba(255,122,138,0.75)');
    line('me', '#7fe0c8', 'rgba(127,224,200,0.1)');
  }
  renderGoals();
  if (selected) renderInspector();
  if (!$('evolve').hidden) renderEvolve();
}

// ---------- inspector ----------
const brainCv = $('brain'), bx = brainCv.getContext('2d');
function select(c) { selected = c; $('inspector').hidden = !c; if (c) { closeEvolve(); renderInspector(); } }
const bar = (label, v, lo, hi, txt) => `<span>${label}</span><div class="t"><i style="width:${clamp((v - lo) / (hi - lo), 0, 1) * 100}%"></i></div><span>${txt}</span>`;
function renderInspector() {
  const c = selected; if (!c) return;
  const g = c.g, S = species[c.sp];
  $('iName').textContent = `${S.name} #${c.id}`;
  $('iSub').textContent = c.dead ? 'Dead' : `Generation ${c.gen} · age ${fmtTime(c.age)}${c === avatar ? ' · you' : ''}`;
  $('iTraits').innerHTML =
    bar('Energy', c.e, 0, g.size * 10, Math.max(0, c.e).toFixed(0)) + bar('Size', g.size, 3.5, 16, g.size.toFixed(1)) +
    bar('Speed', g.speed * S.mod.speed, 0.4, 4, (g.speed * S.mod.speed).toFixed(2)) + bar('Senses', g.sense * S.mod.sense, 40, 450, (g.sense * S.mod.sense).toFixed(0)) +
    bar('Food eaten', c.eaten, 0, 40, c.eaten) + bar('Kills', c.kills, 0, 10, c.kills) + bar('Offspring', c.kids, 0, 10, c.kids);
  $('aControl').hidden = c.sp !== 0 || c === avatar;
  $('aFavour').hidden = c.sp !== 0;
  $('aCull').textContent = c.sp === 0 ? 'Cull' : 'Cull · 3 DNA';
  drawBrain(c);
}
function drawBrain(c) {
  const w = brainCv.width, h = brainCv.height, w8 = c.g.w;
  bx.clearRect(0, 0, w, h);
  const colX = [150, w / 2 + 10, w - 112];
  const py = (n, i) => 16 + i * (h - 32) / (n - 1);
  const node = (x, y, a) => { bx.beginPath(); bx.arc(x, y, 7, 0, 7); bx.fillStyle = a >= 0 ? `rgba(127,224,200,${0.15 + Math.abs(a) * 0.85})` : `rgba(255,122,138,${0.15 + Math.abs(a) * 0.85})`; bx.fill(); bx.strokeStyle = 'rgba(215,235,230,0.4)'; bx.lineWidth = 1; bx.stroke(); };
  const edge = (x1, y1, x2, y2, wt, act) => { const s = wt * act; bx.strokeStyle = s >= 0 ? `rgba(127,224,200,${Math.min(0.9, Math.abs(s) * 0.35)})` : `rgba(255,122,138,${Math.min(0.9, Math.abs(s) * 0.35)})`; bx.lineWidth = 0.5 + Math.min(3, Math.abs(wt)); bx.beginPath(); bx.moveTo(x1, y1); bx.lineTo(x2, y2); bx.stroke(); };
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

// ---------- evolve panel ----------
function openEvolve() { select(null); $('evolve').hidden = false; renderEvolve(); }
function closeEvolve() { $('evolve').hidden = true; }
let lastEvolveKey = '';
function renderEvolve() {
  const me = species[0];
  $('eSub').textContent = `${Math.floor(me.dna)} DNA to spend`;
  const key = UPG.map(u => me.lv[u.k] + (me.dna >= upgCost(u, me.lv[u.k]) ? 'y' : 'n')).join() + species.map(S => S.extinct).join();
  if (key !== lastEvolveKey) {
    lastEvolveKey = key;
    $('upgList').innerHTML = UPG.map((u, i) => {
      const lv = me.lv[u.k], max = lv >= MAXLV, cost = upgCost(u, lv);
      return `<button class="upg" type="button" data-u="${i}" ${max || me.dna < cost ? 'disabled' : ''}><b>${u.name}</b><small>${u.desc}. <em>Best for: ${u.best.toLowerCase()}.</em></small><span class="cost">${max ? 'max' : cost + ' DNA'}<span class="pips">${[0, 1, 2].map(k => `<i class="${k < lv ? 'on' : ''}"></i>`).join('')}</span></span></button>`;
    }).join('');
    $('upgList').querySelectorAll('.upg').forEach(b => b.onclick = () => {
      const u = UPG[+b.dataset.u];
      if (buy(me, u)) { toast(`${u.name} evolved. Every cell of your species has it now.`); renderEvolve(); }
    });
  }
  $('rivalList').innerHTML = species.slice(1).map(S => {
    const n = UPG.reduce((a, u) => a + S.lv[u.k], 0);
    return `<div><span><i class="dot" style="background:${hsl(S.hue)}"></i>${S.name}</span><span>${S.extinct ? 'extinct' : n + ' upgrades · ' + S.count + ' cells'}</span></div>`;
  }).join('');
}
$('dnaBtn').onclick = () => $('evolve').hidden ? openEvolve() : closeEvolve();
$('eClose').onclick = closeEvolve;

// ---------- input ----------
function toWorld(px, py) { const S = scale(); return { x: wrapP((px * dpr - cv.width / 2) / S + cam.x, W), y: wrapP((py * dpr - cv.height / 2) / S + cam.y, H) }; }
function pick(p, filter) {
  const tol = 22 * dpr / scale(); let best = null, bd = Infinity;
  for (const c of cells) { if (c.dead || (filter && !filter(c))) continue; const d = Math.hypot(wrapD(c.x - p.x, W), wrapD(c.y - p.y, H)) - c.g.size; if (d < tol && d < bd) { bd = d; best = c; } }
  return best;
}
let steering = false;
cv.addEventListener('pointerdown', e => {
  const p = toWorld(e.clientX, e.clientY);
  if (tool === 'feed') return feed(p.x, p.y);
  if (tool === 'cull') { const c = pick(p); if (c) { cull(c); if (selected === c) select(null); } return; }
  if (tool === 'inspect') return select(pick(p));
  // swim
  if (!avatar || avatar.dead) { const mine = pick(p, c => c.sp === 0); if (mine) possess(mine); else toast('Tap one of your teal cells to take control of it.'); return; }
  steering = true; steer = p; cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', e => { if (steering) steer = toWorld(e.clientX, e.clientY); });
const endSteer = () => { steering = false; steer = null; };
cv.addEventListener('pointerup', endSteer); cv.addEventListener('pointercancel', endSteer);
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
addEventListener('keydown', e => {
  if (stopped) return;
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Space') { togglePause(); e.preventDefault(); }
  if (e.code === 'KeyE') $('dnaBtn').click();
  if (e.key === 'Escape') { if (PR.modal.open && PR.modal.close) PR.modal.close(); else { select(null); closeEvolve(); } }
});
addEventListener('keyup', e => { if (stopped) return; if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
function setTool(t) {
  tool = t;
  document.querySelectorAll('[data-tool]').forEach(x => x.setAttribute('aria-pressed', x.dataset.tool === t));
  cv.style.cursor = t === 'cull' ? 'crosshair' : t === 'feed' ? 'copy' : t === 'inspect' ? 'help' : 'pointer';
  const hint = { cull: 'Cull: tap a cell to kill it. Your own are free, rivals cost 3 DNA.', feed: 'Feed: tap to drop food for 2 DNA.', inspect: 'Inspect: tap any cell to see its brain.' }[t];
  if (hint) toast(hint);
}
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
function togglePause() { paused = !paused; $('pauseBtn').setAttribute('aria-pressed', paused); }
$('pauseBtn').onclick = togglePause;
$('speedBtn').onclick = () => { speedIdx = (speedIdx + 1) % SPEEDS.length; $('speedBtn').textContent = SPEEDS[speedIdx] + '×'; };
$('viewBtn').onclick = () => { closeUp = !closeUp; $('viewBtn').textContent = closeUp ? 'Whole pool' : 'Close up'; };
$('openAges').onclick = () => showModal({
  eyebrow: 'The road to civilization', title: 'The ages ahead',
  body: PR.agesHtml(1),
  buttons: [['Back to the pool', null, true]],
});
$('goals').addEventListener('click', e => { if (innerWidth <= 760 && e.target.id !== 'openAges') $('goals').classList.toggle('min'); });
if (innerWidth <= 760) $('goals').classList.add('min');

// ---------- modal ----------
const showModal = PR.showModal, toast = PR.toast;
const statsHtml = () => `<div class="statgrid">
  <div><span class="label">Time</span><b>${fmtTime(tick)}</b></div>
  <div><span class="label">Generations</span><b>${species[0].maxGen}</b></div>
  <div><span class="label">Hunts won</span><b>${species[0].kills}</b></div>
  <div><span class="label">Disasters</span><b>${survived}</b></div></div>`;
function gameOver() {
  PR.clearSave();
  showModal({ eyebrow: 'Extinction', title: 'Your species is gone',
    body: `<p>The last of your cells has died. The pool belongs to ${species.filter(S => S.i && !S.extinct).map(S => S.name).join(', ') || 'nobody'} now.</p>${statsHtml()}<p>Tip: spend DNA early, stay out of the vent, and cull your own cells that swim in circles so the smarter ones breed.</p>`,
    buttons: [['Start again', () => { newGame(); intro(); }, true]] });
}
function victory() {
  showModal({ eyebrow: 'Age 1 complete', title: 'Your species rules the pool',
    body: `<p>Your cells learned to forage, hunt and survive disasters, and they now outnumber every rival. Next they join together into creatures in the Shallow Sea.</p><p>Your upgrades turn into body parts, and your best brains carry over, so everything your species learned here comes with it.</p>${statsHtml()}`,
    buttons: [['Keep playing', null], ['Advance to Age 2', advance, true]] });
}
function advance() {
  const mine = cells.filter(c => !c.dead && c.sp === 0).sort((a, b) => (b.eaten + b.kids * 2) - (a.eaten + a.kids * 2)).slice(0, 24);
  const carry = { lv: { ...species[0].lv }, gen: species[0].maxGen, time: tick * 0.05,
    genomes: mine.map(c => ({ w: PR.packW(c.g.w), size: c.g.size, speed: c.g.speed, sense: c.g.sense })) };
  PR.startAge(2, null, carry);
}
function intro() {
  showModal({ eyebrow: '3.8 billion years ago', title: 'Primordial',
    body: `<p>Four species of single cells share one pool. Yours are <b style="color:var(--accent)">teal</b>. Every cell has a tiny brain that learns over generations. Only one species can win.</p>
    <ul class="howto">
      <li><b>SWIM</b><span>You control one cell with the gold ring. Hold anywhere and it swims toward your finger (arrow keys or WASD on a keyboard). Eat green algae. Swim into smaller rival cells to eat them.</span></li>
      <li><b>DNA</b><span>Your species earns DNA when it eats and hunts. Your own cell earns the most. Spend it on upgrades like flagella, spines and shells.</span></li>
      <li><b>SELECT</b><span>Cull the cells you don't like and favour the ones you do. Better cells breed, so your whole species gets smarter.</span></li>
      <li><b>SURVIVE</b><span>Disasters hit the pool: volcanic vents, a giant amoeba, ice ages. If your species dies out, the game is over.</span></li>
    </ul>`,
    buttons: [['Begin', null, true]] });
}

// ---------- loop ----------
speedIdx = 0; paused = false; tool = 'swim';
function serialize() {
  if (lost) return null;
  return { W, H, tick, nextId, kills, survived, won, nextEv, evOrder, flags, ev,
    species: species.map(S => ({ dna: S.dna, lv: S.lv, kills: S.kills, maxGen: S.maxGen, extinct: S.extinct, strain: S.strain || 1, deathLog: S.deathLog.slice(-40) })),
    cells: cells.filter(c => !c.dead).map(c => [c.id, c.sp, PR.r1(c.x), PR.r1(c.y), +c.a.toFixed(2), PR.r1(c.e), c.age, c.gen, Math.round(c.maxAge), c.eaten, c.kills, c.kids, PR.r1(c.g.size), +c.g.speed.toFixed(3), PR.r1(c.g.sense), PR.r1(c.g.hue), PR.packW(c.g.w)]),
    food: food.filter(f => !f.dead).map(f => [PR.r1(f.x), PR.r1(f.y)]),
    goals: GOALS.map(g => !!g.done), avatarId: avatar && !avatar.dead ? avatar.id : null, history };
}
function restore(s) {
  newGame();
  cells = []; food = [];
  ({ tick, nextId, kills, survived, won, nextEv, evOrder } = s); flags = s.flags || {}; ev = s.ev || null; history = s.history || [];
  s.species.forEach((d, i) => { Object.assign(species[i], d); mods(species[i]); });
  for (const a of s.cells) {
    const c = makeCell({ w: new Float32Array(a[16]), size: a[12], speed: a[13], sense: a[14], hue: a[15] }, a[2], a[3], a[7], a[1], a[5]);
    Object.assign(c, { id: a[0], a: a[4], age: a[6], maxAge: a[8], eaten: a[9], kills: a[10], kids: a[11] }); cells.push(c);
  }
  for (const f of s.food) addFood(f[0], f[1]);
  GOALS.forEach((g, i) => g.done = !!s.goals[i]);
  for (const S of species) S.count = 0;
  for (const c of cells) species[c.sp].count++;
  avatar = null; possess(cells.find(c => c.id === s.avatarId) || cells.find(c => c.sp === 0));
}
if (saved && saved.cells) { restore(saved); toast('Welcome back. Your pool is as you left it.'); }
else { newGame(); for (let i = 0; i < 10; i++) step(); intro(); }
cam.x = avatar ? avatar.x : W / 2; cam.y = avatar ? avatar.y : H / 2; cam.z = zoomZ;
let hudT = 0;
function frame(t) {
  if (stopped) return;
  if (!paused && !PR.modal.open) for (let i = 0; i < SPEEDS[speedIdx]; i++) step();
  updateCamera();
  draw();
  if (t - hudT > 250) { hudT = t; renderHud(); }
  else if (selected && !paused) drawBrain(selected);
  requestAnimationFrame(frame);
}
renderHud();
requestAnimationFrame(frame);
window.__sim = { bot: v => botPlayer = v, step, species: () => species, get stats() { return { tick, survived, won, lost, ev: ev && ev.type, sp: species.map(S => ({ n: S.count, dna: Math.round(S.dna), gen: S.maxGen, k: S.kills, lv: Object.values(S.lv).join(''), sk: +skillOf(S).toFixed(1) })) }; }, win: () => { GOALS.forEach(g => g.done = true); }, advance };
return { stop() { stopped = true; }, serialize };
} };
