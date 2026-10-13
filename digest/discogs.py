"""Discogs API: UK releases from the current year, label details and label catalogues."""
import re
import time

from . import majors
from .util import PoliteSession, log, norm

API = "https://api.discogs.com"


# Discogs genre names mapped onto Bandcamp's, so each genre gets one section on the page.
GENRE_NAMES = {
    "hip hop": "hip-hop/rap", "funk / soul": "r&b/soul", "folk, world, & country": "folk",
    "stage & screen": "soundtrack", "children's": "kids", "non-music": "spoken word",
    "brass & military": "classical", "latin": "latin", "reggae": "reggae", "blues": "blues",
    "electronic": "electronic", "rock": "rock", "pop": "pop", "jazz": "jazz", "classical": "classical",
}


def genre_name(discogs_genre):
    if not discogs_genre:
        return None
    return GENRE_NAMES.get(discogs_genre.lower(), discogs_genre.lower())


def clean_name(name):
    """Drop Discogs' disambiguation suffix, e.g. "Undergrowth (3)" -> "Undergrowth"."""
    return re.sub(r"\s\(\d{1,2}\)$", "", name or "").rstrip("*")


UK_CITIES = [
    "London", "Manchester", "Birmingham", "Leeds", "Glasgow", "Edinburgh", "Bristol", "Liverpool",
    "Sheffield", "Newcastle", "Nottingham", "Leicester", "Brighton", "Cardiff", "Belfast", "Oxford",
    "Cambridge", "Norwich", "Bath", "Southampton", "Portsmouth", "Aberdeen", "Dundee", "Swansea",
    "Coventry", "York", "Hull", "Bradford", "Derby", "Plymouth", "Exeter", "Margate", "Hastings",
    "Bournemouth", "Wolverhampton", "Huddersfield", "Salford", "Gateshead", "Sunderland", "Middlesbrough",
    "Lancaster", "Preston", "Stockport", "Luton", "Milton Keynes", "Northampton", "Ipswich", "Colchester",
    "Canterbury", "Inverness", "Stirling", "Derry", "Newport", "Cheltenham", "Gloucester", "Worcester",
    "Folkestone", "Stoke-on-Trent", "Leamington Spa", "Falmouth",
]
_CITY_RE = re.compile(r"\b(" + "|".join(re.escape(c) for c in UK_CITIES) + r")\b")


def uk_city(address):
    """First UK city named in a label's Discogs address (the current address is listed first)."""
    m = _CITY_RE.search(address or "")
    return m.group(1) if m else None


def is_self_released(label_name):
    return norm(label_name).startswith("not on label")


class Discogs:
    def __init__(self, cfg, token):
        self.cfg = cfg
        self.http = PoliteSession(cfg["delay_seconds"], {"Authorization": f"Discogs token={token}"})
        self.label_cache = {}

    def _get(self, path, **params):
        resp = self.http.get(API + path, params=params)
        if resp.headers.get("X-Discogs-Ratelimit-Remaining", "60").isdigit() and \
                int(resp.headers["X-Discogs-Ratelimit-Remaining"]) < 3:
            time.sleep(15)
        return resp.json()

    def _skip_format(self, formats):
        skip = {s.lower() for s in self.cfg["skip_formats"]}
        return any(str(f).lower() in skip for f in formats)

    # --- Search ---------------------------------------------------------
    def search_new(self, year, since, min_id):
        """Newly added UK releases for `year`; returns (releases, highest id seen)."""
        found, lookups, top_id, stale = [], 0, min_id, 0
        for page in range(1, self.cfg["search_pages"] + 1):
            data = self._get("/database/search", type="release", country="UK", year=year,
                             per_page=100, page=page, sort="date_added", sort_order="desc")
            results = data.get("results", [])
            for r in results:
                if r["id"] <= min_id or self._skip_format(r.get("format", [])):
                    continue
                if lookups >= self.cfg["max_release_lookups"]:
                    break
                lookups += 1
                rel = self.release(r["id"])
                if not rel:
                    continue
                if rel["added"] < since:
                    stale += 1
                    continue
                stale = 0
                top_id = max(top_id, r["id"])
                found.append(rel)
            if not results or page >= data.get("pagination", {}).get("pages", 0) or stale > 40:
                break
        return found, top_id

    def release(self, release_id, year=None):
        """Full release record as a digest release dict, or None if it doesn't qualify."""
        d = self._get(f"/releases/{release_id}")
        formats = []
        for f in d.get("formats") or []:
            formats.append(f.get("name", ""))
            formats.extend(f.get("descriptions") or [])
        if self._skip_format(formats):
            return None
        if year and str(d.get("year")) != str(year):
            return None
        labels = d.get("labels") or []
        label = labels[0] if labels else {}
        artists = ", ".join(clean_name(a.get("anv") or a.get("name", "")) for a in d.get("artists") or [])
        images = d.get("images") or []
        primary = next((i for i in images if i.get("type") == "primary"), images[0] if images else {})
        self_rel = not label or is_self_released(label.get("name", ""))
        return {
            "key": f"dg:{d['id']}",
            "source": "discogs",
            "title": d.get("title", ""),
            "artist": artists,
            "label": None if self_rel else clean_name(label.get("name")),
            "discogs_label_id": None if self_rel else label.get("id"),
            "self_released": self_rel,
            "city": "UK",
            "genre": genre_name((d.get("genres") or [None])[0]),
            "tags": [t.lower() for t in (d.get("styles") or []) + (d.get("genres") or [])][:8],
            "artwork": primary.get("uri150") or primary.get("uri"),
            "release_date": d.get("released") or str(d.get("year", "")),
            "added": (d.get("date_added") or "")[:10],
            "have": (d.get("community") or {}).get("have", 0),
            "bandcamp_url": None,
            "discogs_url": d.get("uri"),
            "spotify_url": None,
            "enriched": True,
        }

    # --- Labels ---------------------------------------------------------
    def label_info(self, label_id):
        """Name, major ownership (via parent labels) and, if needed, size figures."""
        if label_id in self.label_cache:
            return self.label_cache[label_id]
        d = self._get(f"/labels/{label_id}")
        chain, parent = [d.get("name", "")], d.get("parent_label")
        for _ in range(4):
            if not parent:
                break
            chain.append(parent.get("name", ""))
            parent = self._get(f"/labels/{parent['id']}").get("parent_label")
        info = {"name": d.get("name", ""), "chain": chain, "contact": d.get("contact_info") or ""}
        self.label_cache[label_id] = info
        return info

    def label_size(self, label_id, label_name):
        """(number of releases, average "have" count across a sample of them)."""
        count = self._get(f"/labels/{label_id}/releases", per_page=1).get("pagination", {}).get("items", 0)
        sample = self._get("/database/search", type="release", label=label_name, per_page=50).get("results", [])
        haves = [r.get("community", {}).get("have", 0) for r in sample]
        return count, (sum(haves) / len(haves) if haves else 0)

    def label_new_releases(self, label_id, known, year):
        """Releases on a label not seen before; returns (new releases, all ids now known)."""
        data = self._get(f"/labels/{label_id}/releases", per_page=50, sort="year", sort_order="desc")
        ids = {str(r["id"]) for r in data.get("releases", []) if r.get("type", "release") == "release"}
        fresh = []
        for r in data.get("releases", []):
            if str(r["id"]) in known or str(r.get("year")) != str(year) or r.get("type", "release") != "release":
                continue
            try:
                rel = self.release(r["id"], year=year)
            except Exception as exc:
                log.warning("Discogs release %s failed: %s", r["id"], exc)
                continue
            if rel:
                fresh.append(rel)
        return fresh, ids


def chain_is_major(chain, never_exclude):
    return any(majors.is_major(name, never_exclude) for name in chain)
