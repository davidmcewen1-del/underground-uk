"""Weekly run: gather new releases, filter, pick, find on Spotify, publish the page."""
import argparse
import logging
import os
import re
import tomllib
from datetime import date, datetime, timedelta, timezone

from . import majors, render, votes
from .bandcamp import Bandcamp, label_key, site_root
from .discogs import Discogs, chain_is_major, uk_city
from .spotify import Spotify
from .util import DATA, ROOT, load_json, log, norm, save_json


def load_env_file():
    """Read a local .env file (for running on your own computer; GitHub uses Secrets)."""
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def signature(rel):
    return "sig:" + norm(rel["artist"]) + "|" + norm(rel["title"])


def load_digests():
    out = {}
    for path in sorted((DATA / "digests").glob("*.json")):
        out[path.stem] = load_json(f"digests/{path.name}", {}).get("releases", [])
    return out


class Run:
    def __init__(self, cfg, dry_run=False):
        self.cfg = cfg
        self.dry_run = dry_run
        self.today = date.today().isoformat()
        self.state = load_json("state.json", {})
        self.labels = load_json("labels.json", {})
        self.shown = load_json("shown.json", {})
        self.pending = load_json("pending.json", {})
        self.saved = load_json("saved.json", {})
        self.load_follows()
        iso = date.today().isocalendar()
        self.week = f"{iso.year}-W{iso.week:02d}"
        # A second run in the same week redoes that week's digest from the same starting point.
        self.redo = self.state.get("week") == self.week and "week_since" in self.state
        if self.redo:
            self.since = self.state["week_since"]
            self.discogs_min_id = self.state.get("week_discogs_min_id", 0)
        else:
            last = self.state.get("last_run")
            lookback = (date.fromisoformat(last[:10]) - timedelta(days=2)) if last else \
                date.today() - timedelta(days=cfg["digest"]["first_run_lookback_days"])
            self.since = lookback.isoformat()
            self.discogs_min_id = self.state.get("discogs_max_id", 0)
            self.state.update(week=self.week, week_since=self.since, week_discogs_min_id=self.discogs_min_id)
        self.candidates = {}
        self.notes = []

    # --- helpers ---------------------------------------------------------
    def load_follows(self):
        """Register followed labels/artists: [labels] follow in config.toml plus those saved on the page."""
        keys = set()
        wanted = [(raw, "label") for raw in self.cfg["labels"].get("follow", [])]
        wanted += [(v["url"], v.get("kind", "label")) for v in self.saved.values() if v.get("url")]
        for raw, kind in wanted:
            raw = raw.strip()
            m = re.search(r"discogs\.com/(?:[a-z]{2}/)?label/(\d+)(?:-([^/?#]+))?", raw)
            if m:
                key = f"dg:{m.group(1)}"
                entry = self.labels.setdefault(key, {
                    "name": (m.group(2) or "").replace("-", " ") or key, "source": "discogs",
                    "discogs_id": int(m.group(1)), "first_seen": self.today, "last_checked": None,
                    "known": None, "name_from_url": True})
            elif raw:
                url = site_root(raw if "://" in raw else "https://" + raw)
                key = label_key(url)
                entry = self.labels.setdefault(key, {
                    "name": key[3:], "source": "bandcamp", "url": url, "first_seen": self.today,
                    "last_checked": None, "known": None, "name_from_url": True})
            else:
                continue
            entry["followed"] = True
            entry["excluded"] = None
            entry["kind"] = kind
            if key in self.saved:
                entry["name"] = self.saved[key].get("name") or entry["name"]
                entry.pop("name_from_url", None)
            keys.add(key)
        for key, entry in self.labels.items():
            if entry.get("followed") and key not in keys:
                entry["followed"] = False
        self.follow_count = len(keys)

    def is_followed(self, rel):
        keys = [rel.get("label_key") or ""]
        if rel.get("self_released") and rel.get("bandcamp_url"):
            keys.append(label_key(site_root(rel["bandcamp_url"])))  # a saved artist's own account
        return any(self.labels.get(k, {}).get("followed") for k in keys)

    def note(self, msg):
        log.info(msg)
        self.notes.append(msg)

    def add(self, rel):
        if rel.get("upcoming") or rel["release_date"] > self.today:
            if self.cfg["digest"]["include_preorders"]:
                rel["upcoming"] = True
            else:
                self.pending.setdefault(rel["key"], rel)
                return
        self.candidates.setdefault(rel["key"], rel)

    def track_label(self, rel):
        if rel.get("label_url"):
            key = label_key(rel["label_url"])
            entry = self.labels.setdefault(key, {"name": rel["label"], "source": "bandcamp",
                                                 "url": rel["label_url"], "first_seen": self.today,
                                                 "last_checked": None, "known": None})
        elif rel.get("discogs_label_id"):
            key = f"dg:{rel['discogs_label_id']}"
            entry = self.labels.setdefault(key, {"name": rel["label"], "source": "discogs",
                                                 "discogs_id": rel["discogs_label_id"], "first_seen": self.today,
                                                 "last_checked": None, "known": None})
        else:
            return None
        entry.setdefault("city", rel.get("city"))
        rel["label_key"] = key
        return key

    def excluded(self, rel):
        if self.is_followed(rel):
            return False
        lc = self.cfg["labels"]
        name = rel.get("label")
        if rel.get("self_released") and not name:
            return not self.cfg["digest"]["include_self_released"]
        if norm(name) in {norm(n) for n in lc["always_exclude"]}:
            return True
        if lc["exclude_majors"] and majors.is_major(name, lc["never_exclude"]):
            return True
        entry = self.labels.get(rel.get("label_key") or "", {})
        return bool(entry.get("excluded"))

    # --- sources ---------------------------------------------------------
    def from_pending(self):
        released = [k for k, r in self.pending.items() if r["release_date"] <= self.today]
        for k in released:
            rel = self.pending.pop(k)
            rel["upcoming"] = False
            self.candidates.setdefault(k, rel)
        far_past = (date.today() - timedelta(days=30)).isoformat()
        for k in [k for k, r in self.pending.items() if r["release_date"] < far_past]:
            del self.pending[k]
        self.note(f"Pre-orders now out: {len(released)}")

    def from_bandcamp(self, bc):
        n = 0
        for city in self.cfg["bandcamp"]["cities"]:
            try:
                found = bc.discover_city(city, self.since, self.today)
            except Exception as exc:
                log.warning("Bandcamp %s failed: %s", city["name"], exc)
                continue
            for rel in found:
                self.track_label(rel)
                self.add(rel)
            n += len(found)
            log.info("Bandcamp %s: %d", city["name"], len(found))
        self.note(f"Bandcamp city feeds: {n} releases (incl. upcoming)")

    def check_bandcamp_labels(self, bc):
        todo = self.label_todo("bandcamp", self.cfg["labels"]["max_bandcamp_checks_per_run"])
        found = 0
        for key in todo:
            entry = self.labels[key]
            try:
                page_name, urls = bc.label_page(entry["url"])
            except Exception as exc:
                log.warning("Bandcamp label %s failed: %s", entry["name"], exc)
                continue
            if page_name and entry.pop("name_from_url", False):
                entry["name"] = page_name
            listed = {r.get("bandcamp_url") for r in self.candidates.values()}
            if entry["known"] is not None:
                known = set(entry["known"])
                to_read = [u for u in urls if u not in known and u not in listed]
            elif entry.get("followed"):
                to_read = [u for u in urls[:6] if u not in listed]  # newly followed: its latest releases
            else:
                to_read = []
            for url in to_read:
                try:
                    rel = bc.release_from_page(url, entry["name"], entry["url"])
                except Exception as exc:
                    log.warning("Bandcamp page %s failed: %s", url, exc)
                    continue
                if rel and entry.get("kind") == "artist":
                    rel.update(label=None, label_url=None, self_released=True)
                if rel and rel["release_date"] >= self.since:
                    rel["label_key"] = key
                    rel["city"] = rel["city"] if rel["city"] != "UK" else entry.get("city") or "UK"
                    self.add(rel)
                    found += 1
            entry["known"] = sorted(set(urls) | set(entry["known"] or []))
            entry["last_checked"] = self.today
        self.note(f"Bandcamp label pages: checked {len(todo)}, {found} new releases")

    def from_discogs(self, dg):
        year = date.today().year
        try:
            found, top = dg.search_new(year, self.since, self.discogs_min_id)
        except Exception as exc:
            log.warning("Discogs search failed: %s", exc)
            found, top = [], self.discogs_min_id
        self.state["discogs_max_id"] = max(top, self.state.get("discogs_max_id", 0))
        for rel in found:
            self.track_label(rel)
            self.add(rel)
        self.note(f"Discogs search: {len(found)} new UK {year} releases")

        todo = self.label_todo("discogs", self.cfg["labels"]["max_discogs_checks_per_run"])
        fresh_count = 0
        for key in todo:
            entry = self.labels[key]
            try:
                self.classify_discogs_label(dg, entry)
                if entry.get("excluded"):
                    continue
                fresh, ids = dg.label_new_releases(entry["discogs_id"], set(entry["known"] or []), year)
            except Exception as exc:
                log.warning("Discogs label %s failed: %s", entry["name"], exc)
                continue
            if entry["known"] is not None or entry.get("followed"):
                for rel in fresh:
                    if entry["known"] is None and rel["added"] < self.since:
                        continue  # newly followed: only releases added since the last digest
                    rel["label_key"] = key
                    self.add(rel)
                    fresh_count += 1
            entry["known"] = sorted(ids | set(entry["known"] or []))
            entry["last_checked"] = self.today
        self.note(f"Discogs labels: checked {len(todo)}, {fresh_count} new releases")

    def label_todo(self, source, cap):
        """Followed labels every run; the rest oldest-checked first, up to `cap`."""
        mine = [k for k, v in self.labels.items() if v["source"] == source]
        followed = [k for k in mine if self.labels[k].get("followed")]
        others = sorted((k for k in mine if not self.labels[k].get("followed") and not self.labels[k].get("excluded")),
                        key=lambda k: self.labels[k]["last_checked"] or "")
        return followed + others[:cap]

    def classify_discogs_label(self, dg, entry):
        if entry.get("followed"):
            if entry.pop("name_from_url", False):
                entry["name"] = dg.label_info(entry["discogs_id"])["name"]
            entry["excluded"] = None
            return
        if "excluded" in entry:
            return
        lc = self.cfg["labels"]
        info = dg.label_info(entry["discogs_id"])
        entry["parents"] = info["chain"][1:]
        if lc["exclude_majors"] and chain_is_major(info["chain"], lc["never_exclude"]):
            entry["excluded"] = "major"
            return
        if lc["max_releases"] or lc["max_avg_have"]:
            count, avg_have = dg.label_size(entry["discogs_id"], entry["name"])
            entry["releases"], entry["avg_have"] = count, round(avg_have)
            if (lc["max_releases"] and count > lc["max_releases"]) or \
                    (lc["max_avg_have"] and avg_have > lc["max_avg_have"]):
                entry["excluded"] = "size"
                return
        entry["excluded"] = None

    def discogs_label_city(self, dg, entry):
        """Look up a Discogs label's UK city from its address, once."""
        if entry.get("city_checked"):
            return
        city = uk_city(dg.label_info(entry["discogs_id"]).get("contact", ""))
        if city:
            entry["city"] = f"{city}, UK"
        entry["city_checked"] = True

    def reopen_week(self, previous):
        """Put this week's earlier picks back in the running so the redo can choose afresh."""
        for rel in previous:
            for k in (rel["key"], signature(rel)):
                if self.shown.get(k) == self.week:
                    del self.shown[k]
            self.candidates.setdefault(rel["key"], {**rel, "spotify_url": None})
        self.note(f"Redoing {self.week}: {len(previous)} earlier picks back in the pool")

    # --- main ------------------------------------------------------------
    def run(self):
        cfg = self.cfg
        digests = load_digests()
        all_votes = votes.sync(cfg["votes"]["worker_url"], os.environ.get("VOTE_KEY"), digests)
        self.digests, self.all_votes = digests, all_votes
        self.saved = votes.sync_saved(cfg["votes"]["worker_url"], os.environ.get("VOTE_KEY"))
        self.load_follows()

        bc = Bandcamp(cfg["bandcamp"])
        self.from_pending()
        if self.redo:
            self.reopen_week(digests.get(self.week, []))
        self.from_bandcamp(bc)
        token = os.environ.get("DISCOGS_TOKEN")
        dg = Discogs(cfg["discogs"], token) if token else None
        if dg:
            self.from_discogs(dg)
            # Classify every Discogs label behind a candidate (majors out) and fill in its city.
            for rel in self.candidates.values():
                entry = self.labels.get(rel.get("label_key") or "") if rel.get("discogs_label_id") else None
                if not entry:
                    continue
                try:
                    self.classify_discogs_label(dg, entry)
                    self.discogs_label_city(dg, entry)
                except Exception as exc:
                    log.warning("Discogs label %s failed: %s", entry["name"], exc)
                if entry.get("city") and rel.get("city") in (None, "", "UK"):
                    rel["city"] = entry["city"]
        else:
            self.note("Discogs skipped: DISCOGS_TOKEN not set")
        self.check_bandcamp_labels(bc)

        pool, seen_sigs = [], set()
        for rel in self.candidates.values():
            sig = signature(rel)
            if rel["key"] in self.shown or sig in self.shown or sig in seen_sigs or self.excluded(rel):
                continue
            seen_sigs.add(sig)
            pool.append(rel)
        self.note(f"Eligible after filters: {len(pool)}")

        size = cfg["digest"]["size"]
        followed = [r for r in pool if self.is_followed(r)]
        for rel in followed:
            rel["pick"] = "followed"
        others = [r for r in pool if not self.is_followed(r)]
        picked = followed + votes.choose(others, all_votes, max(0, round(size * 1.1) - len(followed)),
                                         cfg["digest"]["random_share"], cfg["digest"]["max_per_label"])
        self.note(f"Followed labels: {self.follow_count}, {len(followed)} new releases from them")
        releases = []
        for rel in picked:
            if rel["source"] == "bandcamp":
                bc.enrich(rel)
                if self.excluded(rel):
                    continue
            releases.append(rel)
            if len(releases) >= size:
                break
        order = {"followed": 0, "for-you": 1}
        releases.sort(key=lambda r: (order.get(r["pick"], 2), r.get("genre") or "", r["artist"].lower()))

        playlists = self.spotify(releases)
        d = date.today()
        label = f"Week {self.week.split('-W')[1]} · {d.day} {d:%b %Y}"
        clean = [{k: v for k, v in r.items() if k not in ("enriched", "upcoming", "added")} for r in releases]
        digests[self.week] = clean
        render.write_site(cfg, self.week, label, clean, playlists, digests, self.saved, all_votes)
        self.note(f"Digest {self.week}: {len(clean)} releases")

        if not self.dry_run:
            for r in clean:
                self.shown[r["key"]] = self.week
                self.shown[signature(r)] = self.week
            self.state["last_run"] = datetime.now(timezone.utc).isoformat()
            save_json(f"digests/{self.week}.json", {"label": label, "playlists": playlists, "releases": clean})
            save_json("state.json", self.state)
            save_json("labels.json", self.labels)
            save_json("shown.json", self.shown)
            save_json("pending.json", self.pending)
        self.summary()

    def spotify(self, releases):
        sc = self.cfg["spotify"]
        needed = ("SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REFRESH_TOKEN")
        if not sc["enabled"] or not all(os.environ.get(k) for k in needed):
            self.note("Spotify skipped: not configured")
            return None
        try:
            sp = Spotify(sc, *(os.environ[k] for k in needed))
        except Exception as exc:
            self.note(f"Spotify login failed: {exc}")
            return None
        # Two playlists a week: releases on labels, and self-released ones.
        groups = {"labels": [], "self-released": []}
        counts = {"labels": 0, "self-released": 0}
        for rel in releases:
            try:
                url, tracks = sp.find(rel)
            except Exception as exc:
                log.warning("Spotify search failed for %s: %s", rel["title"], exc)
                continue
            if url:
                rel["spotify_url"] = url
                group = "labels" if rel.get("label") else "self-released"
                groups[group].extend(tracks)
                counts[group] += 1
        self.note(f"Spotify: found {sum(counts.values())} of {len(releases)}")
        if self.dry_run:
            return {}
        previous = load_json(f"digests/{self.week}.json", {}).get("playlists", {}) if self.redo else {}
        titles = {"labels": "Labels", "self-released": "Self-released"}
        playlists = {}
        for group, uris in groups.items():
            if not uris:
                continue
            try:
                playlists[group] = sp.make_playlist(
                    sc["playlist_name"].format(kind=titles[group], week=self.week),
                    f"{counts[group]} new {'label' if group == 'labels' else 'self-released'} releases from the UK "
                    f"underground. Digest {self.week}.", uris, existing_url=previous.get(group))
            except Exception as exc:
                self.note(f"Spotify {titles[group]} playlist failed: {exc}")
        liked = self.update_liked(sp, releases)
        if liked:
            playlists["liked"] = liked
        return playlists

    def update_liked(self, sp, releases):
        """Refill the running "Liked" playlist with every 👍 release found on Spotify, newest first."""
        meta = {r["key"]: r for week in self.digests.values() for r in week}
        meta.update({r["key"]: r for r in releases})
        liked = sorted((k for k, v in self.all_votes.items() if v["vote"] > 0 and (meta.get(k) or {}).get("spotify_url")),
                       key=lambda k: self.all_votes[k].get("at") or "", reverse=True)
        uris = []
        for k in liked:
            album_id = meta[k]["spotify_url"].rstrip("/").split("/")[-1].split("?")[0]
            try:
                uris.extend(sp.album_tracks(album_id))
            except Exception as exc:
                log.warning("Spotify tracks failed for %s: %s", meta[k]["title"], exc)
        if not uris:
            return self.state.get("liked_playlist")
        try:
            url = sp.make_playlist(self.cfg["spotify"]["liked_playlist_name"],
                                   "Every release you gave a thumbs up in the Underground UK digest.",
                                   uris[:10000], existing_url=self.state.get("liked_playlist"))
        except Exception as exc:
            self.note(f"Spotify Liked playlist failed: {exc}")
            return self.state.get("liked_playlist")
        self.state["liked_playlist"] = url
        self.note(f"Liked playlist: {len(liked)} releases, {len(uris)} tracks")
        return url

    def summary(self):
        path = os.environ.get("GITHUB_STEP_SUMMARY")
        if path:
            with open(path, "a", encoding="utf-8") as f:
                f.write(f"## Digest {self.week}\n\n" + "\n".join(f"- {n}" for n in self.notes) + "\n")


def rebuild(cfg):
    """Re-render the latest saved digest with the current page design (no fetching)."""
    digests = load_digests()
    if not digests:
        log.info("Nothing to rebuild yet")
        return
    week = max(digests)
    saved = load_json(f"digests/{week}.json", {})
    playlists = saved.get("playlists") or ({"all": saved["playlist_url"]} if saved.get("playlist_url") else {})
    render.write_site(cfg, week, saved["label"], saved["releases"], playlists, digests,
                      load_json("saved.json", {}), load_json("votes.json", {}))
    log.info("Rebuilt page for %s", week)


def main():
    parser = argparse.ArgumentParser(description="Build the weekly Underground UK digest.")
    parser.add_argument("--rebuild", action="store_true", help="only re-render the latest digest page")
    parser.add_argument("--dry-run", action="store_true", help="build the page but save no state and make no playlist")
    parser.add_argument("--cities", type=int, help="only use the first N cities (for quick tests)")
    parser.add_argument("--size", type=int, help="override digest size")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    load_env_file()
    cfg = tomllib.loads((ROOT / "config.toml").read_text(encoding="utf-8"))
    if args.cities:
        cfg["bandcamp"]["cities"] = cfg["bandcamp"]["cities"][:args.cities]
    if args.size:
        cfg["digest"]["size"] = args.size
    cfg["votes"]["worker_url"] = os.environ.get("WORKER_URL") or cfg["votes"]["worker_url"]
    if args.rebuild:
        rebuild(cfg)
    else:
        Run(cfg, args.dry_run).run()


if __name__ == "__main__":
    main()
