// Shared helpers for every age: maths, toasts, the modal, saving and the age list.
window.PR = (() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const rnd = (a = 1) => (Math.random() * 2 - 1) * a;
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const wrapD = (d, L) => d > L / 2 ? d - L : d < -L / 2 ? d + L : d;
  const wrapP = (v, L) => ((v % L) + L) % L;
  const angTo = (a, dx, dy) => { let r = Math.atan2(dy, dx) - a; while (r > Math.PI) r -= 2 * Math.PI; while (r < -Math.PI) r += 2 * Math.PI; return r; };

  function toast(msg, big) {
    const el = document.createElement('div'); el.className = 'panel toast' + (big ? ' big' : ''); el.textContent = msg;
    $('toasts').appendChild(el); setTimeout(() => el.remove(), big ? 5000 : 3200);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
  }

  // modal: buttons are [label, onClick, isPrimary]; the last button is the default and Escape presses it
  const modal = { open: false, close: null };
  function showModal({ eyebrow, title, body, buttons }) {
    $('mEyebrow').textContent = eyebrow; $('mTitle').textContent = title; $('mBody').innerHTML = body;
    modal.open = true;
    const wrap = $('mBtns'); wrap.innerHTML = '';
    buttons.forEach(([label, fn, primary]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (primary ? ' primary' : ''); b.textContent = label;
      b.onclick = () => { $('modal').hidden = true; modal.open = false; modal.close = null; if (fn) fn(); };
      wrap.appendChild(b);
    });
    modal.close = () => wrap.lastChild.click();
    $('modal').hidden = false;
    wrap.lastChild.focus();
  }

  // saving: one slot in this browser
  const KEY = 'primordial-save-v1';
  function save(obj) { try { localStorage.setItem(KEY, JSON.stringify(obj)); return true; } catch (e) { return false; } }
  function load() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function clearSave() { try { localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ } }
  const packW = w => Array.from(w, v => Math.round(v * 1000) / 1000);
  const r1 = v => Math.round(v * 10) / 10;

  const AGES = [
    ['Primordial Soup', 'Single cells compete, hunt and learn.'],
    ['Shallow Sea', 'Cells join into creatures with fins, jaws and eyes.'],
    ['Creatures', 'Animals roam the land. Herds, packs and predators.'],
    ['Tribe', 'Tools, fire and the first camps.'],
    ['Settlement', 'Workers learn jobs. Roads, farms and supply chains.'],
    ['Kingdom', 'Armies learn tactics against rival evolved peoples.'],
    ['City', 'Zoning, traffic, power and citizens with their own minds.'],
    ['Civilization', 'Nations, trade, science and diplomacy across the world.'],
  ];
  const agesHtml = now => `<ol class="ages">${AGES.map((a, i) => `<li class="${i + 1 === now ? 'now' : i + 1 < now ? 'past' : 'locked'}"><span class="n">${String(i + 1).padStart(2, '0')}</span><div><b>${a[0]}</b>${a[1]}</div></li>`).join('')}</ol>`;
  const fmtMyr = my => my < 1000 ? my.toFixed(0) + ' Myr' : (my / 1000).toFixed(2) + ' Byr';

  // each age registers { start(saved, carry) } and returns { stop, serialize }
  const ages = {};
  let current = null;
  function startAge(n, saved, carry) {
    if (current) current.stop();
    // a fresh canvas drops every listener the previous age attached
    const old = $('world'), cv = old.cloneNode(false); old.replaceWith(cv);
    $('hud').innerHTML = '';
    current = ages[n].start(saved, carry);
    current.age = n;
    autosave();
    return current;
  }
  function autosave() {
    if (!current || !current.serialize) return;
    const st = current.serialize();
    if (st) save({ v: 1, age: current.age, state: st, at: Date.now() });
  }
  setInterval(autosave, 15000);
  addEventListener('pagehide', autosave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) autosave(); });

  return { $, rnd, gauss, clamp, wrapD, wrapP, angTo, toast, showModal, modal, save, load, clearSave, packW, r1, AGES, agesHtml, fmtMyr, ages, startAge, autosave, get current() { return current; } };
})();
