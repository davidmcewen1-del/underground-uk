"""Static HTML for GitHub Pages: docs/index.html, docs/digests/<week>.html, docs/archive.html."""
import shutil
from collections import Counter
from html import escape

from .discogs import clean_name, genre_name
from .util import DOCS, ROOT


def _genre(rel):
    return genre_name(rel.get("genre")) or "other"


def _slug(text):
    return "".join(c if c.isalnum() else "-" for c in text.lower()).strip("-")


def _sections(releases):
    """One folded <details> section per genre, alphabetical, with "other" last."""
    groups = {}
    for rel in releases:
        groups.setdefault(_genre(rel), []).append(rel)
    names = sorted(groups, key=lambda g: (g == "other", g))
    jump = "".join(f'<a class="chip" href="#g-{_slug(g)}" data-target="g-{_slug(g)}">{escape(g)} '
                   f'<span class="n">{len(groups[g])}</span></a>' for g in names)
    sections = "".join(
        f'<details class="genre" id="g-{_slug(g)}"><summary><h2>{escape(g)}</h2>'
        f'<span class="count">{len(groups[g])}</span></summary>'
        f'<div class="grid">{"".join(_card(r) for r in groups[g])}</div></details>'
        for g in names)
    return jump, sections


def _link(url, text, cls):
    return f'<a class="btn {cls}" href="{escape(url)}" target="_blank" rel="noopener">{text}</a>' if url else ""


def _card(rel):
    label = escape(clean_name(rel.get("label")) or "Self-released")
    tags = "".join(f"<li>{escape(t)}</li>" for t in rel.get("tags") or [])
    art = (f'<img src="{escape(rel["artwork"])}" alt="" loading="lazy" referrerpolicy="no-referrer">'
           if rel.get("artwork") else '<div class="noart" aria-hidden="true">♪</div>')
    pick = '<span class="badge">Random pick</span>' if rel.get("pick") == "random" else \
           '<span class="badge fy">For you</span>' if rel.get("pick") == "for-you" else ""
    return f"""<article class="card" data-key="{escape(rel['key'])}"
 data-city="{escape(rel.get('city') or '')}" data-pick="{escape(rel.get('pick') or '')}">
 <div class="art">{art}{pick}</div>
 <div class="body">
  <h3>{escape(rel['title'])}</h3>
  <p class="artist">{escape(rel['artist'])}</p>
  <p class="meta">{label} · {escape(rel.get('city') or 'UK')} · {escape(rel.get('release_date') or '')}</p>
  <ul class="tags">{tags}</ul>
  <div class="links">{_link(rel.get('bandcamp_url'), 'Bandcamp', 'bc')}{_link(rel.get('discogs_url'), 'Discogs', 'dg')}{_link(rel.get('spotify_url'), 'Spotify', 'sp')}</div>
  <div class="vote" role="group" aria-label="Rate this release">
   <button type="button" data-vote="1" aria-label="Thumbs up" aria-pressed="false">👍</button>
   <button type="button" data-vote="-1" aria-label="Thumbs down" aria-pressed="false">👎</button>
  </div>
 </div>
</article>"""


def _options(values):
    return "".join(f'<option value="{escape(v)}">{escape(v)} ({n})</option>'
                   for v, n in sorted(Counter(v for v in values if v).items()))


def _page(title, body, prefix, worker_url):
    return f"""<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}</title>
<link rel="stylesheet" href="{prefix}assets/style.css">
</head>
<body data-worker="{escape(worker_url)}">
{body}
<script src="{prefix}assets/app.js"></script>
</body>
</html>
"""


def digest_page(cfg, week, label, releases, playlist_url, prefix):
    playlist = (f'<a class="btn sp big" href="{escape(playlist_url)}" target="_blank" rel="noopener">'
                f'Play this week on Spotify</a>') if playlist_url else ""
    jump, sections = _sections(releases)
    body = f"""<header class="top">
 <div>
  <h1>{escape(cfg['digest']['title'])}</h1>
  <p class="sub">{escape(label)} · {len(releases)} new releases from small UK labels</p>
 </div>
 <nav>{playlist}<a class="btn" href="{prefix}archive.html">Archive</a></nav>
</header>
<nav class="jump" aria-label="Genres">{jump}</nav>
<section class="filters" aria-label="Filters">
 <label>City <select id="f-city"><option value="">All</option>{_options(r.get('city') for r in releases)}</select></label>
 <label>Show <select id="f-show"><option value="">Everything</option><option value="unvoted">Not voted yet</option>
  <option value="for-you">For you</option><option value="random">Random picks</option></select></label>
 <span id="vote-status" class="status" role="status"></span>
</section>
<main class="genres">
{sections}
</main>
<p class="empty" hidden>No releases match these filters.</p>"""
    return _page(f"{cfg['digest']['title']} {week}", body, prefix, cfg["votes"]["worker_url"])


def archive_page(cfg, digests):
    rows = "".join(f'<li><a href="digests/{escape(w)}.html">{escape(w)}</a> · {len(r)} releases</li>'
                   for w, r in sorted(digests.items(), reverse=True))
    body = f"""<header class="top"><div><h1>{escape(cfg['digest']['title'])}</h1>
<p class="sub">Every weekly digest</p></div><nav><a class="btn" href="index.html">Latest</a></nav></header>
<main class="archive"><ul>{rows}</ul></main>"""
    return _page(f"{cfg['digest']['title']} archive", body, "", cfg["votes"]["worker_url"])


def write_site(cfg, week, label, releases, playlist_url, digests):
    (DOCS / "digests").mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT / "static", DOCS / "assets", dirs_exist_ok=True)
    (DOCS / "digests" / f"{week}.html").write_text(
        digest_page(cfg, week, label, releases, playlist_url, "../"), encoding="utf-8")
    (DOCS / "index.html").write_text(digest_page(cfg, week, label, releases, playlist_url, ""), encoding="utf-8")
    (DOCS / "archive.html").write_text(archive_page(cfg, digests), encoding="utf-8")
    (DOCS / ".nojekyll").write_text("", encoding="utf-8")
