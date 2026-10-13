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

  const genre = document.getElementById("f-genre");
  const city = document.getElementById("f-city");
  const show = document.getElementById("f-show");
  const empty = document.querySelector(".empty");
  function applyFilters() {
    if (!genre) return;
    let visible = 0;
    cards.forEach((c) => {
      const ok = (!genre.value || c.dataset.genre === genre.value) &&
        (!city.value || c.dataset.city === city.value) &&
        (!show.value || (show.value === "unvoted" ? !votes[c.dataset.key] : c.dataset.pick === show.value));
      c.hidden = !ok;
      if (ok) visible++;
    });
    if (empty) empty.hidden = visible > 0;
  }
  [genre, city, show].forEach((el) => el && el.addEventListener("change", applyFilters));

  if (worker && pin && cards.length) {
    call("/votes").then((all) => {
      Object.keys(all).forEach((k) => (votes[k] = all[k].vote));
      cards.forEach(paint);
      applyFilters();
    }).catch((e) => { if (e.message === "pin") pin = null; });
  }
})();
