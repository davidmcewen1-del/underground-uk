"""Static HTML for GitHub Pages: docs/index.html, docs/digests/<week>.html, docs/archive.html."""
import shutil
from collections import Counter
from html import escape

from .bandcamp import BANDCAMP_GENRES, label_key, site_root
from .discogs import clean_name, genre_name
from .util import DOCS, ROOT, load_json, norm


def save_target(rel):
    """(key, name, url, kind) for the label - or, if self-released, the artist - behind a release."""
    if rel.get("label_url"):
        return label_key(rel["label_url"]), clean_name(rel.get("label")), rel["label_url"], "label"
    if rel.get("discogs_label_id"):
        return (f"dg:{rel['discogs_label_id']}", clean_name(rel.get("label")),
                f"https://www.discogs.com/label/{rel['discogs_label_id']}", "label")
    if rel.get("self_released") and not rel.get("label") and rel.get("bandcamp_url"):
        url = site_root(rel["bandcamp_url"])
        return label_key(url), rel["artist"], url, "artist"
    return None


def label_slug(key):
    return "".join(c if c.isalnum() or c in ".-" else "-" for c in key.lower())


def label_link(rel, prefix):
    """The label name on a card, linking to that label's page when it has one."""
    name = escape(clean_name(rel.get("label")) or "Self-released")
    if rel.get("label") and rel.get("label_key"):
        return f'<a class="label-link" href="{prefix}labels/{label_slug(rel["label_key"])}.html">{name}</a>'
    return name


def _genre(rel):
    tag_genre = next((t for t in rel.get("tags") or [] if t in BANDCAMP_GENRES), None)
    return genre_name(rel.get("genre")) or tag_genre or "other"


def _slug(text):
    return "".join(c if c.isalnum() else "-" for c in text.lower()).strip("-")


def _sections(releases, prefix=""):
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
        f'<div class="grid">{"".join(_card(r, prefix) for r in groups[g])}</div></details>'
        for g in names)
    return jump, sections


def _link(url, text, cls):
    return f'<a class="btn {cls}" href="{escape(url)}" target="_blank" rel="noopener">{text}</a>' if url else ""


def _player_ref(rel):
    """What the player bar should load: Bandcamp's player first, else Spotify's, else nothing."""
    if rel.get("bandcamp_url") and rel["key"].startswith("bc:"):
        kind = "track" if "/track/" in rel["bandcamp_url"] else "album"
        return f"bc:{kind}:{rel['key'][3:]}"
    if rel.get("spotify_url") and "/album/" in rel["spotify_url"]:
        return "sp:album:" + rel["spotify_url"].rstrip("/").split("/")[-1].split("?")[0]
    return None


def _card(rel, prefix=""):
    label = label_link(rel, prefix)
    tags = "".join(f"<li>{escape(t)}</li>" for t in rel.get("tags") or [])
    art = (f'<img src="{escape(rel["artwork"])}" alt="" loading="lazy" referrerpolicy="no-referrer">'
           if rel.get("artwork") else '<div class="noart" aria-hidden="true">♪</div>')
    pick = {"random": '<span class="badge">Random pick</span>',
            "for-you": '<span class="badge fy">For you</span>',
            "followed": '<span class="badge fl">Following</span>'}.get(rel.get("pick"), "")
    player = _player_ref(rel)
    play = (f'<button type="button" class="btn play" data-player="{escape(player)}" '
            f'aria-label="Play {escape(rel["title"])}">▶ Play</button>') if player else ""
    target = save_target(rel)
    save = ""
    if target:
        key, name, url, kind = target
        save = (f'<button type="button" class="save" data-save-key="{escape(key)}" data-save-name="{escape(name)}"'
                f' data-save-url="{escape(url)}" data-save-kind="{kind}" aria-pressed="false">'
                f'<span class="star" aria-hidden="true">☆</span> Save {kind}</button>')
    return f"""<article class="card" data-key="{escape(rel['key'])}"
 data-city="{escape(rel.get('city') or '')}" data-pick="{escape(rel.get('pick') or '')}">
 <div class="art">{art}{pick}</div>
 <div class="body">
  <h3>{escape(rel['title'])}</h3>
  <p class="artist">{escape(rel['artist'])}</p>
  <p class="meta">{label} · {escape(rel.get('city') or 'UK')} · {escape(rel.get('release_date') or '')}</p>
  <ul class="tags">{tags}</ul>
  <div class="links">{play}{_link(rel.get('bandcamp_url'), 'Bandcamp', 'bc')}{_link(rel.get('discogs_url'), 'Discogs', 'dg')}{_link(rel.get('spotify_url'), 'Spotify', 'sp')}</div>
  <div class="vote" role="group" aria-label="Rate this release">
   <button type="button" data-vote="1" aria-label="Thumbs up" aria-pressed="false">👍</button>
   <button type="button" data-vote="-1" aria-label="Thumbs down" aria-pressed="false">👎</button>
  </div>
  {save}
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


PLAYER = """<div id="player" class="player" hidden>
 <div class="player-head">
  <button type="button" id="pl-prev" class="pl-btn" aria-label="Previous release">⏮</button>
  <div class="now"><strong id="pl-title"></strong><span id="pl-artist"></span></div>
  <button type="button" id="pl-up" class="pl-btn" aria-label="Thumbs up" aria-pressed="false">👍</button>
  <button type="button" id="pl-down" class="pl-btn" aria-label="Thumbs down" aria-pressed="false">👎</button>
  <button type="button" id="pl-next" class="pl-btn" aria-label="Next release">⏭</button>
  <button type="button" id="pl-close" class="pl-btn" aria-label="Close player">✕</button>
 </div>
 <div id="pl-frame"></div>
</div>"""


KINDS = {"labels": "Labels", "self-released": "Self-released"}


def is_label_release(rel):
    return bool(rel.get("label"))


def split_releases(releases):
    return {"labels": [r for r in releases if is_label_release(r)],
            "self-released": [r for r in releases if not is_label_release(r)]}


def digest_page(cfg, week, label, releases, playlists, prefix, kind="labels", pages=None):
    """One of the two digest pages: releases on labels, or self-released ones."""
    names = {"labels": "Labels playlist", "self-released": "Self-released playlist", "liked": "Liked playlist",
             "all": "Spotify playlist"}
    wanted = {kind, "liked", "all"}
    playlist = "".join(f'<a class="btn sp big" href="{escape(url)}" target="_blank" rel="noopener">'
                       f'▶ {names.get(group, "Spotify playlist")}</a>'
                       for group, url in (playlists or {}).items() if url and group in wanted)
    current = ' aria-current="page"'
    tabs = "".join(
        f'<a class="tab" href="{escape(href)}"{current if k == kind else ""}>'
        f'{KINDS[k]} <span class="n">{n}</span></a>'
        for k, (href, n) in (pages or {}).items())
    what = "on small UK labels" if kind == "labels" else "self-released by UK artists"
    jump, sections = _sections(releases, prefix)
    body = f"""<header class="top">
 <div>
  <h1>{escape(cfg['digest']['title'])}</h1>
  <p class="sub">{escape(label)} · {len(releases)} new releases {what}</p>
 </div>
 <nav>{playlist}<a class="btn" href="{prefix}labels.html">Labels</a><a class="btn" href="{prefix}saved.html">My labels</a><a class="btn" href="{prefix}taste.html">My taste</a><a class="btn" href="{prefix}archive.html">Archive</a></nav>
</header>
<nav class="tabs" aria-label="Digest pages">{tabs}</nav>
<nav class="jump" aria-label="Genres">{jump}</nav>
<section class="filters" aria-label="Filters">
 <label>City <select id="f-city"><option value="">All</option>{_options(r.get('city') for r in releases)}</select></label>
 <label>Show <select id="f-show"><option value="unvoted" selected>Not voted yet</option><option value="">Everything</option>
  <option value="followed">Following</option><option value="for-you">For you</option><option value="random">Random picks</option></select></label>
 <div class="view" role="group" aria-label="View">
  <button type="button" data-view="cards" aria-pressed="true">▦ Cards</button><button type="button" data-view="list" aria-pressed="false">☰ List</button>
 </div>
 <span id="vote-status" class="status" role="status"></span>
</section>
<main class="genres">
{sections}
</main>
<p class="empty" hidden>No releases match these filters.</p>
{PLAYER}"""
    return _page(f"{cfg['digest']['title']} {KINDS[kind]} {week}", body, prefix, cfg["votes"]["worker_url"])


def archive_page(cfg, digests):
    def row(w, releases):
        parts = split_releases(releases)
        return (f'<li><strong>{escape(w)}</strong> · <a href="digests/{escape(w)}.html">Labels ({len(parts["labels"])})</a>'
                f' · <a href="digests/{escape(w)}-self-released.html">Self-released ({len(parts["self-released"])})</a></li>')
    rows = "".join(row(w, r) for w, r in sorted(digests.items(), reverse=True))
    body = f"""<header class="top"><div><h1>{escape(cfg['digest']['title'])}</h1>
<p class="sub">Every weekly digest</p></div><nav><a class="btn" href="index.html">Latest</a></nav></header>
<main class="archive"><ul>{rows}</ul></main>"""
    return _page(f"{cfg['digest']['title']} archive", body, "", cfg["votes"]["worker_url"])


def saved_page(cfg, saved):
    """Catalogue of saved labels and artists. Built weekly; the page script refreshes it live."""
    def rows(kind):
        items = sorted(((k, v) for k, v in saved.items() if v.get("kind") == kind), key=lambda kv: kv[1]["name"].lower())
        return "".join(f'<li data-save-key="{escape(k)}"><a href="{escape(v["url"])}" target="_blank" rel="noopener">'
                       f'{escape(v["name"])}</a> <span class="when">saved {escape((v.get("at") or "")[:10])}</span></li>'
                       for k, v in items) or '<li class="none">Nothing saved yet.</li>'
    body = f"""<header class="top"><div><h1>My labels</h1>
<p class="sub">Labels and artists you've saved. They're checked every week, and their new releases always make the digest.</p></div>
<nav><a class="btn" href="index.html">Latest digest</a><a class="btn" href="archive.html">Archive</a></nav></header>
<main class="archive saved-list">
 <h2>Labels</h2><ul id="saved-label">{rows("label")}</ul>
 <h2>Artists</h2><ul id="saved-artist">{rows("artist")}</ul>
 <p class="status" id="vote-status" role="status"></p>
</main>"""
    return _page("My labels", body, "", cfg["votes"]["worker_url"])


def taste_page(cfg, all_votes, saved, digests):
    """What your votes say: most liked genres, labels and cities, and totals."""
    meta = {r["key"]: r for week in digests.values() for r in week}
    ups = [meta[k] for k, v in all_votes.items() if v["vote"] > 0 and k in meta]
    downs = [meta[k] for k, v in all_votes.items() if v["vote"] < 0 and k in meta]

    def table(title, value):
        up, down = Counter(), Counter()
        for r in ups:
            if value(r):
                up[value(r)] += 1
        for r in downs:
            if value(r):
                down[value(r)] += 1
        names = sorted(set(up) | set(down), key=lambda n: (-(up[n] - down[n]), -up[n], n.lower()))[:15]
        rows = "".join(f"<tr><td>{escape(n)}</td><td>👍 {up[n]}</td><td>👎 {down[n]}</td></tr>" for n in names)             or '<tr><td colspan="3" class="none">No votes yet.</td></tr>'
        return f'<section><h2>{title}</h2><table class="taste">{rows}</table></section>'

    body = f"""<header class="top"><div><h1>My taste</h1>
<p class="sub">From {len(ups) + len(downs)} votes: 👍 {len(ups)} · 👎 {len(downs)} · {len(saved)} saved labels and artists.
Updated every Friday.</p></div>
<nav><a class="btn" href="index.html">Latest digest</a><a class="btn" href="saved.html">My labels</a></nav></header>
<main class="archive taste-page">
{table("Genres", lambda r: None if _genre(r) == "other" else _genre(r))}
{table("Labels", lambda r: clean_name(r.get("label")) or None)}
{table("Cities", lambda r: (r.get("city") or "").split(",")[0] if r.get("city") not in (None, "", "UK") else None)}
</main>"""
    return _page("My taste", body, "", cfg["votes"]["worker_url"])


def write_site(cfg, week, label, releases, playlists, digests, saved=None, all_votes=None, labels=None):
    (DOCS / "digests").mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT / "static", DOCS / "assets", dirs_exist_ok=True)
    parts = split_releases(releases)
    for prefix, folder, names in (("", DOCS, {"labels": "index.html", "self-released": "self-released.html"}),
                                  ("../", DOCS / "digests", {"labels": f"{week}.html",
                                                             "self-released": f"{week}-self-released.html"})):
        pages = {k: (names[k], len(parts[k])) for k in KINDS}
        for kind in KINDS:
            (folder / names[kind]).write_text(
                digest_page(cfg, week, label, parts[kind], playlists, prefix, kind, pages), encoding="utf-8")
    (DOCS / "archive.html").write_text(archive_page(cfg, digests), encoding="utf-8")
    (DOCS / "saved.html").write_text(saved_page(cfg, saved or {}), encoding="utf-8")
    (DOCS / "taste.html").write_text(taste_page(cfg, all_votes or {}, saved or {}, digests), encoding="utf-8")
    write_labels(cfg, load_json("labels.json", {}) if labels is None else labels, digests, saved or {}, all_votes or {})
    (DOCS / ".nojekyll").write_text("", encoding="utf-8")


# --- Label pages ---------------------------------------------------------
def _catalogue_tile(item):
    art = (f'<img src="{escape(item["art"])}" alt="" loading="lazy" referrerpolicy="no-referrer">'
           if item.get("art") else '<div class="noart" aria-hidden="true">♪</div>')
    play = (f'<button type="button" class="btn play" data-player="{escape(item["player"])}" '
            f'aria-label="Play {escape(item["title"])}">▶ Play</button>') if item.get("player") else ""
    where = "Discogs" if "discogs.com" in item["url"] else "Bandcamp"
    meta = " · ".join(str(x) for x in (item.get("year"), item.get("catno")) if x)
    meta = f'<p class="meta">{escape(meta)}</p>' if meta else ""
    return f"""<article class="card cat-item" data-key="cat:{escape(item['url'])}">
 <div class="art">{art}</div>
 <div class="body">
  <h3>{escape(item['title'])}</h3>
  <p class="artist">{escape(item.get('artist') or '')}</p>
  {meta}
  <div class="links">{play}{_link(item['url'], where, 'bc' if where == 'Bandcamp' else 'dg')}</div>
 </div>
</article>"""


def _label_url(entry):
    if entry.get("url"):
        return entry["url"]
    return f"https://www.discogs.com/label/{entry['discogs_id']}" if entry.get("discogs_id") else ""


def label_page(cfg, key, entry, releases, featured):
    name = clean_name(entry.get("name")) or key
    profile = entry.get("profile") or {}
    kind = entry.get("kind", "label")
    url = _label_url(entry)
    links = "".join(_link(w["url"], escape(w.get("text") or w["url"]), "") for w in profile.get("websites", []))
    discogs = f"https://www.discogs.com/label/{entry['discogs_id']}" if entry.get("discogs_id") else None
    home = _link(entry.get("url"), "Bandcamp", "bc") + _link(discogs, "Discogs", "dg")
    save = (f'<button type="button" class="save" data-save-key="{escape(key)}" data-save-name="{escape(name)}"'
            f' data-save-url="{escape(url)}" data-save-kind="{kind}" aria-pressed="false">'
            f'<span class="star" aria-hidden="true">☆</span> Save {kind}</button>') if url else ""
    city = profile.get("location") or entry.get("city") or "UK"
    image = (f'<img class="label-pic" src="{escape(profile["image"])}" alt="" loading="lazy" referrerpolicy="no-referrer">'
             if profile.get("image") else "")
    bio = f'<p class="bio">{escape(profile["bio"])}</p>' if profile.get("bio") else ""
    about = f'<section class="label-about">{image}<div>{bio}<div class="links">{home}{links}</div>{save}</div></section>'
    digest_part = ""
    if releases:
        cards = "".join(_card(r, "../") for r in releases)
        digest_part = f'<h2>In your digests <span class="count">{len(releases)}</span></h2><div class="grid">{cards}</div>'
    catalogue = entry.get("catalogue") if key in featured else None
    if catalogue:
        tiles = "".join(_catalogue_tile(c) for c in catalogue)
        cat_part = (f'<h2>Back catalogue <span class="count">{len(catalogue)}</span></h2>'
                    f'<div class="grid cat">{tiles}</div>')
    elif key in featured:
        cat_part = '<p class="hint">Their back catalogue appears here after the next Friday update.</p>'
    else:
        cat_part = ('<p class="hint">Tap ☆ Save (or give one of their releases a 👍) and this page will show their '
                    'whole back catalogue after the next Friday update.</p>')
    n = len(releases)
    sub = f"{escape(city)} · {n} release{'' if n == 1 else 's'} in your digests"
    body = f"""<header class="top"><div><p class="crumb"><a href="../labels.html">← All labels</a></p>
<h1>{escape(name)}</h1><p class="sub">{sub}</p></div>
<nav><a class="btn" href="../index.html">Latest digest</a><a class="btn" href="../saved.html">My labels</a></nav></header>
<main class="label-page">
{about}
<p class="status" id="vote-status" role="status"></p>
{digest_part}
{cat_part}
</main>
{PLAYER}"""
    return _page(name, body, "../", cfg["votes"]["worker_url"])


def labels_index(cfg, rows, featured):
    def li(key, entry, n):
        name = escape(clean_name(entry.get("name")) or key)
        city = escape((entry.get("profile") or {}).get("location") or entry.get("city") or "UK")
        count = f" · {n} in digests" if n else ""
        return (f'<li data-name="{name.lower()}"><a href="labels/{label_slug(key)}.html">{name}</a>'
                f' <span class="when">{city}{count}</span></li>')

    saved = [r for r in rows if r[1].get("followed")]
    liked = [r for r in rows if r[0] in featured and not r[1].get("followed")]
    others = [r for r in rows if r[0] not in featured and r[1].get("kind", "label") == "label"]

    def block(title, items, note=""):
        inner = "".join(li(*r) for r in items) or f'<li class="none">{note}</li>'
        return f'<section><h2>{title} <span class="count">{len(items)}</span></h2><ul class="label-list">{inner}</ul></section>'

    body = f"""<header class="top"><div><h1>Labels</h1>
<p class="sub">Every label found so far. Saved and liked labels get their whole back catalogue on their page.</p></div>
<nav><a class="btn" href="index.html">Latest digest</a><a class="btn" href="saved.html">My labels</a></nav></header>
<main class="archive saved-list labels-index">
 <input type="search" id="label-search" placeholder="Find a label…" aria-label="Find a label">
 {block("★ Saved", saved, "Nothing saved yet. Tap ☆ Save label on any release.")}
 {block("👍 Liked", liked, "Give a release a 👍 and its label appears here.")}
 {block("All labels", others)}
</main>"""
    return _page("Labels", body, "", cfg["votes"]["worker_url"])


def _merged(keys, labels, featured):
    """One label found on both Bandcamp and Discogs: fill each entry's gaps from the other."""
    order = sorted(keys, key=lambda k: (not labels[k].get("followed"), not k.startswith("bc:"), k))
    merged = {}
    for k in order:
        for field, value in labels[k].items():
            if field == "catalogue" and k not in featured:
                continue
            if merged.get(field) in (None, "", "UK", [], {}):
                merged[field] = value
    return order[0], merged


def write_labels(cfg, labels, digests, saved, all_votes):
    """docs/labels.html plus one page per label in docs/labels/ (Bandcamp and Discogs twins share a page)."""
    by_label, seen = {}, set()
    for week in sorted(digests, reverse=True):
        for rel in digests[week]:
            if rel.get("label_key") and rel["key"] not in seen:
                seen.add(rel["key"])
                by_label.setdefault(rel["label_key"], []).append(rel)
    meta = {r["key"]: r for week in digests.values() for r in week}
    featured = {k for k, v in labels.items() if v.get("followed") or k in saved}
    featured |= {(meta.get(k) or {}).get("label_key") for k, v in all_votes.items() if v.get("vote", 0) > 0}
    groups = {}
    for key, entry in labels.items():
        if entry.get("excluded") and key not in by_label:
            continue
        groups.setdefault(norm(clean_name(entry.get("name"))) or key, []).append(key)
    folder = DOCS / "labels"
    folder.mkdir(parents=True, exist_ok=True)
    rows, index_featured = [], set()
    for keys in groups.values():
        main_key, merged = _merged(keys, labels, featured)
        releases = sorted((r for k in keys for r in by_label.get(k, [])),
                          key=lambda r: r.get("release_date") or "", reverse=True)
        is_featured = featured & set(keys)
        for key in keys:
            entry = dict(merged, followed=labels[key].get("followed") or merged.get("followed"))
            page = label_page(cfg, key, entry, releases, {key} if is_featured else set())
            (folder / f"{label_slug(key)}.html").write_text(page, encoding="utf-8")
        rows.append((main_key, merged, len(releases)))
        if is_featured:
            index_featured.add(main_key)
    rows.sort(key=lambda r: (clean_name(r[1].get("name")) or r[0]).lower())
    (DOCS / "labels.html").write_text(labels_index(cfg, rows, index_featured), encoding="utf-8")
