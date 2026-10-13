// Filters and thumbs up/down. Votes go to your Cloudflare Worker, protected by a PIN
// you type once on each device (remembered in that browser).
(function () {
  const worker = (document.body.dataset.worker || "").replace(/\/$/, "");
  const status = document.getElementById("vote-status");
  const cards = Array.from(document.querySelectorAll(".card"));
  const votes = {};

  function store(get, value) {
    try {
      if (get) return localStorage.getItem("vote-pin");
      localStorage.setItem("vote-pin", value);
    } catch (e) { return null; }
  }
  let pin = store(true);

  function say(text) { if (status) status.textContent = text; }

  function paint(card) {
    const v = votes[card.dataset.key] || 0;
    card.querySelectorAll(".vote button").forEach((b) => {
      b.setAttribute("aria-pressed", String(Number(b.dataset.vote) === v));
    });
  }

  async function call(path, options) {
    const res = await fetch(worker + path, Object.assign({
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + pin }
    }, options));
    if (res.status === 401) throw new Error("pin");
    if (!res.ok) throw new Error("http " + res.status);
    return res.json();
  }

  async function askPin() {
    const entered = window.prompt("Enter your voting PIN (you only need to do this once on this device):");
    if (!entered) return false;
    pin = entered.trim();
    try {
      await call("/check");
      store(false, pin);
      return true;
    } catch (e) {
      pin = null;
      alert(e.message === "pin" ? "That PIN wasn't accepted." : "Couldn't reach the vote server.");
      return false;
    }
  }

  async function vote(card, value) {
    if (!worker) { say("Voting isn't set up yet."); return; }
    if (!pin && !(await askPin())) return;
    const key = card.dataset.key;
    const next = votes[key] === value ? 0 : value; // tapping the same thumb again clears it
    const buttons = card.querySelectorAll(".vote button");
    buttons.forEach((b) => (b.disabled = true));
    try {
      await call("/vote", { method: "POST", body: JSON.stringify({ key: key, vote: next }) });
      if (next) votes[key] = next; else delete votes[key];
      paint(card);
      say("Saved");
      applyFilters();
    } catch (e) {
      if (e.message === "pin") { pin = null; say("PIN needed again — tap a thumb to enter it."); }
      else say("Couldn't save that vote — try again.");
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  }

  cards.forEach((card) => {
    card.querySelectorAll(".vote button").forEach((b) => {
      b.addEventListener("click", () => vote(card, Number(b.dataset.vote)));
    });
  });

  // Genre buttons open their (folded) section and scroll to it.
  document.querySelectorAll(".jump .chip").forEach((chip) => {
    chip.addEventListener("click", (e) => {
      const section = document.getElementById(chip.dataset.target);
      if (!section) return;
      e.preventDefault();
      section.open = true;
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  const city = document.getElementById("f-city");
  const show = document.getElementById("f-show");
  const empty = document.querySelector(".empty");
  function applyFilters() {
    if (!city) return;
    let visible = 0;
    cards.forEach((c) => {
      const ok = (!city.value || c.dataset.city === city.value) &&
        (!show.value || (show.value === "unvoted" ? !votes[c.dataset.key] : c.dataset.pick === show.value));
      c.hidden = !ok;
      if (ok) visible++;
    });
    // Update each section's count and hide sections (and their buttons) left empty.
    document.querySelectorAll(".genre").forEach((section) => {
      const n = section.querySelectorAll(".card:not([hidden])").length;
      section.hidden = n === 0;
      section.querySelector(".count").textContent = n;
      const chip = document.querySelector('.chip[data-target="' + section.id + '"]');
      if (chip) { chip.hidden = n === 0; chip.querySelector(".n").textContent = n; }
    });
    if (empty) empty.hidden = visible > 0;
  }
  [city, show].forEach((el) => el && el.addEventListener("change", applyFilters));

  // --- Save label / artist ---------------------------------------------
  const saved = {};
  const saveButtons = Array.from(document.querySelectorAll("button.save"));

  function paintSaves() {
    saveButtons.forEach((b) => {
      const on = Boolean(saved[b.dataset.saveKey]);
      b.setAttribute("aria-pressed", String(on));
      b.innerHTML = '<span class="star" aria-hidden="true">' + (on ? "★" : "☆") + "</span> " +
        (on ? "Saved " : "Save ") + b.dataset.saveKind;
    });
  }

  async function toggleSave(b) {
    if (!worker) { say("Saving isn't set up yet."); return; }
    if (!pin && !(await askPin())) return;
    const key = b.dataset.saveKey;
    const on = !saved[key];
    const same = saveButtons.filter((x) => x.dataset.saveKey === key);
    same.forEach((x) => (x.disabled = true));
    try {
      await call("/save", { method: "POST", body: JSON.stringify({
        key: key, name: b.dataset.saveName, url: b.dataset.saveUrl, kind: b.dataset.saveKind, save: on }) });
      if (on) saved[key] = { name: b.dataset.saveName, url: b.dataset.saveUrl, kind: b.dataset.saveKind };
      else delete saved[key];
      paintSaves();
      say(on ? "Saved " + b.dataset.saveName + " — it'll be checked every week" : "Removed " + b.dataset.saveName);
    } catch (e) {
      if (e.message === "pin") { pin = null; say("PIN needed again — tap again to enter it."); }
      else say("Couldn't save that — try again.");
    } finally {
      same.forEach((x) => (x.disabled = false));
    }
  }
  saveButtons.forEach((b) => b.addEventListener("click", () => toggleSave(b)));

  // The "My labels" page: show the live list, with a remove button on each.
  function renderSavedList() {
    ["label", "artist"].forEach((kind) => {
      const ul = document.getElementById("saved-" + kind);
      if (!ul) return;
      const items = Object.keys(saved).filter((k) => saved[k].kind === kind)
        .sort((a, b) => saved[a].name.localeCompare(saved[b].name));
      ul.innerHTML = "";
      if (!items.length) { ul.innerHTML = '<li class="none">Nothing saved yet.</li>'; return; }
      items.forEach((k) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = saved[k].url; a.target = "_blank"; a.rel = "noopener"; a.textContent = saved[k].name;
        const when = document.createElement("span");
        when.className = "when"; when.textContent = saved[k].at ? "saved " + saved[k].at.slice(0, 10) : "";
        const rm = document.createElement("button");
        rm.type = "button"; rm.className = "btn remove"; rm.textContent = "Remove";
        rm.addEventListener("click", async () => {
          rm.disabled = true;
          try {
            await call("/save", { method: "POST", body: JSON.stringify({ key: k, save: false }) });
            delete saved[k];
            renderSavedList();
          } catch (e) { rm.disabled = false; say("Couldn't remove that — try again."); }
        });
        li.append(a, " ", when, rm);
        ul.appendChild(li);
      });
    });
  }

  if (worker && pin) {
    if (cards.length) {
      call("/votes").then((all) => {
        Object.keys(all).forEach((k) => (votes[k] = all[k].vote));
        cards.forEach(paint);
        applyFilters();
      }).catch((e) => { if (e.message === "pin") pin = null; });
    }
    call("/saved").then((all) => {
      Object.assign(saved, all);
      paintSaves();
      renderSavedList();
    }).catch(() => {});
  } else if (document.getElementById("saved-label")) {
    say("Enter your PIN on the digest page (tap any thumb) to see changes made since Friday.");
  }
})();
