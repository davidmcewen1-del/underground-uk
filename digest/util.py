import json
import logging
import re
import time
import unicodedata
from pathlib import Path

import requests

log = logging.getLogger("digest")

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DOCS = ROOT / "docs"
USER_AGENT = "UndergroundUKDigest/1.0 (personal weekly music digest)"


def norm(text):
    """Lower-case, accent-free, punctuation-free text for comparing names."""
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    text = re.sub(r"\(.*?\)|\[.*?\]|\*", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def load_json(name, default):
    path = DATA / name
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(name, obj):
    path = DATA / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=1, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


class PoliteSession:
    """requests.Session with a minimum gap between calls and retry on 429/5xx."""

    def __init__(self, delay, headers=None):
        self.delay = delay
        self.last = 0.0
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        if headers:
            self.session.headers.update(headers)

    def request(self, method, url, **kw):
        kw.setdefault("timeout", 30)
        for attempt in range(5):
            wait = self.last + self.delay - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self.last = time.monotonic()
            try:
                resp = self.session.request(method, url, **kw)
            except requests.RequestException as exc:
                log.warning("%s %s failed (%s), retrying", method, url, exc)
                time.sleep(5 * 2 ** attempt)
                continue
            if resp.status_code == 429 or resp.status_code >= 500:
                retry_after = resp.headers.get("Retry-After", "")
                pause = float(retry_after) if retry_after.isdigit() else 5 * 2 ** attempt
                log.warning("%s %s -> %s, waiting %.0fs", method, url, resp.status_code, pause)
                time.sleep(min(pause, 120))
                continue
            resp.raise_for_status()
            return resp
        raise RuntimeError(f"Giving up on {url}")

    def get(self, url, **kw):
        return self.request("GET", url, **kw)

    def post(self, url, **kw):
        return self.request("POST", url, **kw)
