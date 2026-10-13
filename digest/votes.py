"""Thumbs up/down: syncing from the Cloudflare Worker and turning votes into picks."""
import random
from collections import Counter

from .util import PoliteSession, load_json, log, norm, save_json


def sync(worker_url, vote_key, digests):
    """Pull every vote from the Worker into data/votes.json, adding label/tags from past digests."""
    votes = load_json("votes.json", {})
    if not worker_url or not vote_key:
        log.info("Votes: no Worker configured, using %d saved votes", len(votes))
        return votes
    try:
        remote = PoliteSession(0).get(worker_url.rstrip("/") + "/votes",
                                      headers={"Authorization": f"Bearer {vote_key}"}).json()
    except Exception as exc:
        log.warning("Votes: could not reach the Worker (%s), using saved votes", exc)
        return votes
    meta = {r["key"]: r for releases in digests.values() for r in releases}
    for key, v in remote.items():
        rel = meta.get(key, {})
        votes[key] = {"vote": v["vote"], "at": v.get("at"),
                      "label": rel.get("label") or (votes.get(key) or {}).get("label"),
                      "tags": rel.get("tags") or (votes.get(key) or {}).get("tags", [])}
    for key in [k for k in votes if k not in remote]:
        del votes[key]  # vote was cleared on the page
    save_json("votes.json", votes)
    log.info("Votes: %d synced", len(votes))
    return votes


def sync_saved(worker_url, vote_key):
    """Saved labels/artists from the Worker, kept in data/saved.json (also used if the Worker is down)."""
    saved = load_json("saved.json", {})
    if not worker_url or not vote_key:
        return saved
    try:
        saved = PoliteSession(0).get(worker_url.rstrip("/") + "/saved",
                                     headers={"Authorization": f"Bearer {vote_key}"}).json()
    except Exception as exc:
        log.warning("Saved labels: could not reach the Worker (%s), using saved copy", exc)
        return saved
    save_json("saved.json", saved)
    log.info("Saved labels/artists: %d", len(saved))
    return saved


def preference_model(votes):
    labels, tags = Counter(), Counter()
    for v in votes.values():
        if v.get("label"):
            labels[norm(v["label"])] += v["vote"]
        for t in v.get("tags") or []:
            tags[norm(t)] += v["vote"]
    return labels, tags


def score(rel, labels, tags):
    label_score = labels.get(norm(rel.get("label") or ""), 0)
    tag_scores = [tags.get(norm(t), 0) for t in rel.get("tags") or []]
    return 2 * label_score + (sum(tag_scores) / len(tag_scores) if tag_scores else 0)


def choose(candidates, votes, size, random_share, max_per_label, rng=random):
    """Pick `size` releases: most by preference score, `random_share` purely at random."""
    labels, tags = preference_model(votes)
    pool = list(candidates)
    rng.shuffle(pool)  # random order breaks ties (and is the whole order before any votes)
    per_label = Counter()

    def allowed(rel):
        return per_label[norm(rel.get("label") or rel["artist"])] < max_per_label

    def take(rel, why):
        rel["pick"] = why
        per_label[norm(rel.get("label") or rel["artist"])] += 1
        chosen.append(rel)

    chosen = []
    n_random = round(size * random_share)
    for rel in sorted(pool, key=lambda r: score(r, labels, tags), reverse=True):
        if len(chosen) >= size - n_random:
            break
        s = score(rel, labels, tags)
        if allowed(rel) and s >= 0:
            take(rel, "for-you" if s > 0 else "random")
    taken = {r["key"] for r in chosen}
    rest = [r for r in pool if r["key"] not in taken]
    for rel in rest:
        if len(chosen) >= size:
            break
        if allowed(rel):
            take(rel, "random")
    return chosen
