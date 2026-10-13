"""Spotify: find each release, then build the week's playlist.

Uses the endpoints from Spotify's February 2026 Web API changes
(POST /me/playlists, POST /playlists/{id}/items, search limit <= 10).
"""
import base64
from difflib import SequenceMatcher

from .util import PoliteSession, log, norm

API = "https://api.spotify.com/v1"
VARIOUS = {"various artists", "various", "va"}
EDITION_WORDS = {"ep", "lp", "single", "remixes", "deluxe", "edition", "album"}


def title_core(text):
    return " ".join(w for w in norm(text).split() if w not in EDITION_WORDS)


def similar(a, b):
    return SequenceMatcher(None, a, b).ratio()


class Spotify:
    def __init__(self, cfg, client_id, client_secret, refresh_token):
        self.cfg = cfg
        basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
        token_http = PoliteSession(0)
        resp = token_http.post("https://accounts.spotify.com/api/token",
                               data={"grant_type": "refresh_token", "refresh_token": refresh_token},
                               headers={"Authorization": f"Basic {basic}"})
        self.http = PoliteSession(0.15, {"Authorization": f"Bearer {resp.json()['access_token']}"})

    def find(self, rel):
        """(album URL, [track URIs]) for a release, or (None, []) if no close match."""
        artist, title = rel["artist"], rel["title"]
        various = norm(artist) in VARIOUS
        queries = [f'album:"{title}"' if various else f'album:"{title}" artist:"{artist}"',
                   f"{title} {'' if various else artist}".strip()]
        for q in queries:
            items = self.http.get(f"{API}/search", params={"q": q, "type": "album", "limit": 10}).json()
            for album in items.get("albums", {}).get("items", []):
                if self._matches(album, artist, title, various):
                    return album["external_urls"]["spotify"], self._tracks(album["id"])
        return None, []

    def _matches(self, album, artist, title, various):
        if similar(title_core(album["name"]), title_core(title)) < (0.9 if various else 0.85):
            return False
        if various:
            return True
        wanted = norm(artist)
        names = [norm(a["name"]) for a in album.get("artists", [])]
        return any(similar(n, wanted) >= 0.85 or (n and n in wanted) for n in names)

    def _tracks(self, album_id):
        per = self.cfg["tracks_per_release"]
        data = self.http.get(f"{API}/albums/{album_id}/tracks", params={"limit": 50}).json()
        uris = [t["uri"] for t in data.get("items", [])]
        return uris[:per] if per else uris

    def make_playlist(self, name, description, uris):
        resp = self.http.post(f"{API}/me/playlists",
                              json={"name": name, "description": description, "public": self.cfg["public"]})
        playlist = resp.json()
        for i in range(0, len(uris), 100):
            self.http.post(f"{API}/playlists/{playlist['id']}/items", json={"uris": uris[i:i + 100]})
        log.info("Spotify playlist %s with %d tracks", name, len(uris))
        return playlist["external_urls"]["spotify"]
