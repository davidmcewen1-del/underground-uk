"""Bandcamp: the location-filtered Discover feed, label pages and album pages.

Bandcamp's robots.txt explicitly allows /api/discover/1/discover_web; album and
label pages are ordinary public pages. All requests go through PoliteSession.
"""
import html
import json
import re
from datetime import datetime
from urllib.parse import urljoin, urlsplit

from .util import PoliteSession, log, norm

DISCOVER = "https://bandcamp.com/api/discover/1/discover_web"
GENRES = {
    1: "acoustic", 2: "alternative", 3: "ambient", 4: "blues", 5: "classical", 6: "comedy",
    7: "country", 9: "devotional", 10: "electronic", 11: "experimental", 12: "folk", 13: "funk",
    14: "hip-hop/rap", 15: "jazz", 16: "kids", 17: "latin", 18: "metal", 19: "pop", 20: "punk",
    21: "r&b/soul", 22: "reggae", 23: "rock", 24: "soundtrack", 25: "spoken word", 26: "world",
    27: "podcasts", 28: "audiobooks",
}
BANDCAMP_GENRES = set(GENRES.values())
SKIP_GENRES = {"podcasts", "audiobooks"}  # not music releases


def art_url(image_id, is_art=True):
    if not image_id:
        return None
    return f"https://f4.bcbits.com/img/{'a' if is_art else ''}{int(image_id):010d}_2.jpg"


def site_root(url):
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


def label_key(url):
    """"bc:<subdomain>" for x.bandcamp.com, "bc:<host>" for labels on their own domain."""
    host = urlsplit(url if "://" in url else "https://" + url).netloc.lower()
    host = host[4:] if host.startswith("www.") else host
    return "bc:" + (host[:-len(".bandcamp.com")] if host.endswith(".bandcamp.com") else host)


def clean_url(url):
    return url.split("?")[0]


def posted_by_label(account_name, album_artist):
    """A release posted by an account that isn't the artist is treated as a label release."""
    if not album_artist:
        return False
    a, b = norm(account_name), norm(album_artist)
    return bool(a and b) and a not in b and b not in a


class Bandcamp:
    def __init__(self, cfg):
        self.cfg = cfg
        self.http = PoliteSession(cfg["delay_seconds"], {"Content-Type": "application/json"})

    # --- Discover feed -------------------------------------------------
    def discover_city(self, city, since, today):
        """Releases from one city dated since `since`, plus upcoming ones (flagged)."""
        found, cursor, quiet_pages = [], "*", 0
        for _ in range(self.cfg["pages_per_city"]):
            body = {"category_id": 0, "tag_norm_names": [], "geoname_id": city["geoname_id"],
                    "slice": "new", "time_facet_id": None, "cursor": cursor, "size": 60,
                    "include_result_types": ["a"]}
            data = self.http.post(DISCOVER, data=json.dumps(body)).json()
            hits = 0
            for item in data.get("results", []):
                rel = self._from_discover(item, city["name"])
                if not rel or rel["release_date"] < since:
                    continue
                rel["upcoming"] = rel["release_date"] > today
                found.append(rel)
                hits += 1
            quiet_pages = 0 if hits else quiet_pages + 1
            cursor = data.get("cursor")
            if not cursor or quiet_pages >= 2:
                break
        return found

    def _from_discover(self, item, city_name):
        if not item.get("item_url") or not item.get("release_date"):
            return None
        genre = GENRES.get(item.get("band_genre_id"))
        if genre in SKIP_GENRES:
            return None
        account = item.get("band_name") or ""
        album_artist = item.get("album_artist")
        is_label = posted_by_label(account, album_artist)
        image = item.get("primary_image") or {}
        return {
            "key": f"bc:{item['item_id']}",
            "source": "bandcamp",
            "title": item.get("title") or "",
            "artist": album_artist or account,
            "label": account if is_label else None,
            "label_url": site_root(item["band_url"]) if is_label and item.get("band_url") else None,
            "self_released": not is_label,
            "city": item.get("band_location") or city_name,
            "genre": genre,
            "tags": [genre] if genre else [],
            "artwork": art_url(image.get("image_id"), image.get("is_art", True)),
            "release_date": item["release_date"][:10],
            "bandcamp_url": clean_url(item["item_url"]),
            "discogs_url": None,
            "spotify_url": None,
            "enriched": False,
        }

    # --- Label pages ----------------------------------------------------
    def label_page(self, label_url):
        """(label name, album/track URLs on its /music page in page order, newest first)."""
        resp = self.http.get(label_url.rstrip("/") + "/music")
        page, base = resp.text, resp.url
        m = re.search(r'<meta property="og:site_name" content="([^"]*)"', page)
        name = html.unescape(m.group(1)) if m else None
        if re.search(r"/(album|track)/", urlsplit(base).path):
            return name, [clean_url(base)]  # single-release accounts redirect to it
        urls = [urljoin(base, u) for u in re.findall(r'href="((?:https?://[^"/]+)?/(?:album|track)/[^"?#]+)', page)]
        extra = re.search(r'data-client-items="([^"]+)"', page)
        if extra:
            for it in json.loads(html.unescape(extra.group(1))):
                if it.get("page_url"):
                    urls.append(urljoin(base, it["page_url"]))
        return name, list(dict.fromkeys(clean_url(u) for u in urls))

    # --- Album pages ----------------------------------------------------
    def album_details(self, url):
        """Metadata from an album/track page's JSON-LD block."""
        page = self.http.get(url).text
        m = re.search(r'<script type="application/ld\+json">\s*(.*?)\s*</script>', page, re.S)
        if not m:
            return None
        ld = json.loads(m.group(1))
        publisher = ld.get("publisher") or {}
        by_artist = ld.get("byArtist") or {}
        record_label = ld.get("recordLabel")
        if isinstance(record_label, dict):
            record_label = record_label.get("name")
        item_id = None
        for rel in ld.get("albumRelease") or []:
            for prop in rel.get("additionalProperty") or []:
                if prop.get("name") == "item_id":
                    item_id = prop.get("value")
            if item_id:
                break
        if not item_id:
            for prop in ld.get("additionalProperty") or []:
                if prop.get("name") == "track_id":
                    item_id = prop.get("value")
        released = None
        if ld.get("datePublished"):
            try:
                released = datetime.strptime(ld["datePublished"][:11], "%d %b %Y").date().isoformat()
            except ValueError:
                pass
        keywords = ld.get("keywords") or []
        if isinstance(keywords, str):
            keywords = [k.strip() for k in keywords.split(",")]
        return {
            "item_id": item_id,
            "title": ld.get("name") or "",
            "artist": by_artist.get("name") or publisher.get("name") or "",
            "account": publisher.get("name") or "",
            "account_url": publisher.get("@id"),
            "record_label": record_label,
            "city": (publisher.get("foundingLocation") or {}).get("name"),
            "tags": [k.lower() for k in keywords if k],
            "artwork": ld.get("image").replace("_10.jpg", "_2.jpg") if isinstance(ld.get("image"), str) else None,
            "release_date": released,
        }

    def release_from_page(self, url, label=None, label_url=None):
        """Build a release dict straight from an album page (used for label-page finds)."""
        d = self.album_details(url)
        if not d or not d["item_id"] or not d["release_date"]:
            return None
        place = norm((d["city"] or "").split(",")[0])
        tags = [t for t in d["tags"] if norm(t) != place]
        genre = next((t for t in tags if t in BANDCAMP_GENRES), None)
        return {
            "key": f"bc:{d['item_id']}",
            "source": "bandcamp",
            "title": d["title"],
            "artist": d["artist"],
            "label": label or d["account"],
            "label_url": label_url,
            "self_released": False,
            "city": d["city"] or "UK",
            "genre": genre,
            "tags": tags[:8],
            "artwork": d["artwork"],
            "release_date": d["release_date"],
            "bandcamp_url": url,
            "discogs_url": None,
            "spotify_url": None,
            "enriched": True,
        }

    def enrich(self, rel):
        """Add tags and any declared record label to a Discover-feed release."""
        if rel.get("enriched"):
            return rel
        try:
            d = self.album_details(rel["bandcamp_url"])
        except Exception as exc:  # keep the release with what we already know
            log.warning("Could not read %s: %s", rel["bandcamp_url"], exc)
            return rel
        if d:
            place = norm((rel["city"] or "").split(",")[0])
            tags = rel["tags"] + [t for t in d["tags"] if t not in rel["tags"] and norm(t) != place]
            rel["tags"] = tags[:8]
            if rel["self_released"] and d["record_label"] and norm(d["record_label"]) != norm(rel["artist"]):
                rel["label"] = d["record_label"]
                rel["self_released"] = False
            if d["artwork"] and not rel.get("artwork"):
                rel["artwork"] = d["artwork"]
        rel["enriched"] = True
        return rel
