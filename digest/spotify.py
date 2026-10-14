"""Spotify: find each release, then build the week's playlist.

Uses the endpoints from Spotify's February 2026 Web API changes
(POST /me/playlists, POST /playlists/{id}/items, search limit <= 10).
"""
import base64
from difflib import SequenceMatcher

import requests

from .util import PoliteSession, log, norm

API = "https://api.spotify.com/v1"
VARIOUS = {"various artists", "various", "va"}
EDITION_WORDS = {"ep", "lp", "single", "remixes", "deluxe", "edition", "album"}


def title_core(text):
    return " ".join(w for w in norm(text).split() if w not in EDITION_WORDS)


def similar(a, b):
    return SequenceMatcher(None, a, b).ratio()


class SpotifyBlocked(Exception):
    """Spotify has asked us to stop for a long time (rate limit); skip it for this run."""


class Spotify:
    def __init__(self, cfg, client_id, client_secret, refresh_token):
        self.cfg = cfg
        self.basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
        self.refresh_token = refresh_token
        self.http = PoliteSession(0.5)  # gentle: about 2 requests a second
        self.login()

    def login(self):
        resp = PoliteSession(0).post("https://accounts.spotify.com/api/token",
                                     data={"grant_type": "refresh_token", "refresh_token": self.refresh_token},
                                     headers={"Authorization": f"Basic {self.basic}"})
        self.http.session.headers["Authorization"] = f"Bearer {resp.json()['access_token']}"

    def call(self, method, url, **kw):
        """One API call: logs in again if the 1-hour login has expired, and stops on a long block."""
        for attempt in range(2):
            try:
                return self.http.request(method, url, **kw)
            except RuntimeError as exc:
                if "asked to wait" in str(exc):
                    raise SpotifyBlocked(str(exc)) from exc
                raise
            except requests.HTTPError as exc:
                if exc.response is not None and exc.response.status_code == 401 and attempt == 0:
                    self.login()
                    continue
                raise

    def find(self, rel):
        """(album URL, [all track URIs]) for a release, or (None, []) if no close match."""
        artist, title = rel["artist"], rel["title"]
        various = norm(artist) in VARIOUS
        queries = [f'album:"{title}"' if various else f'album:"{title}" artist:"{artist}"',
                   f"{title} {'' if various else artist}".strip()]
        for q in queries:
            items = self.call("GET", f"{API}/search", params={"q": q, "type": "album", "limit": 10}).json()
            for album in items.get("albums", {}).get("items", []):
                if self._matches(album, artist, title, various):
                    return album["external_urls"]["spotify"], self.album_tracks(album["id"])
        return None, []

    def _matches(self, album, artist, title, various):
        if similar(title_core(album["name"]), title_core(title)) < (0.9 if various else 0.85):
            return False
        if various:
            return True
        wanted = norm(artist)
        names = [norm(a["name"]) for a in album.get("artists", [])]
        return any(similar(n, wanted) >= 0.85 or (n and n in wanted) for n in names)

    def album_tracks(self, album_id):
        data = self.call("GET", f"{API}/albums/{album_id}/tracks", params={"limit": 50}).json()
        return [t["uri"] for t in data.get("items", [])]

    def make_playlist(self, name, description, uris, existing_url=None):
        """Create the week's playlist, or refill an existing one (a redo of the same week)."""
        if existing_url:
            playlist_id = existing_url.rstrip("/").split("/")[-1].split("?")[0]
            url = existing_url
            self.call("PUT", f"{API}/playlists/{playlist_id}/items", json={"uris": uris[:100]})
            rest = uris[100:]
        else:
            resp = self.call("POST", f"{API}/me/playlists",
                             json={"name": name, "description": description, "public": self.cfg["public"]})
            playlist_id, url = resp.json()["id"], resp.json()["external_urls"]["spotify"]
            rest = uris
        for i in range(0, len(rest), 100):
            self.call("POST", f"{API}/playlists/{playlist_id}/items", json={"uris": rest[i:i + 100]})
        log.info("Spotify playlist %s with %d tracks", name, len(uris))
        return url
