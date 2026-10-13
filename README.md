# Underground UK

A weekly digest of new releases from small UK labels, any genre. It runs every Friday
at 7am UK time on GitHub Actions and is published to GitHub Pages, with a matching
private Spotify playlist.

Setup: see [SETUP.md](SETUP.md). Settings: [config.toml](config.toml).

## How it works

1. **Votes.** Pulls your 👍/👎 from the Cloudflare Worker (`worker/worker.js`) into `data/votes.json`.
2. **Bandcamp.**
   - Reads the Discover feed for each city in `config.toml`.
   - Checks the `/music` page of every label it has found before (oldest-checked first, up to 150 a week).
   - Bandcamp's robots.txt allows the Discover endpoint, and there's a 2 second pause between requests.
3. **Discogs.**
   - Searches UK releases from the current year that were added since the last run. Reissues, represses and remasters are skipped.
   - Checks labels it has found before for new releases.
   - Follows each label's parent labels to spot ones owned by Universal, Sony or Warner.
4. **Filtering.**
   - Removes anything shown in an earlier digest (matched by ID and by artist plus title).
   - Removes releases on major labels and any `always_exclude` names.
   - Applies the optional size limits.
   - Pre-orders are parked in `data/pending.json` until their release date.
5. **Picking.**
   - 80% of each digest is ranked by your votes: liked labels count double, then liked tags and genres.
   - The other 20% is random.
   - No label gets more than 4 releases a week.
6. **Spotify.** Matches each release by artist and title. It makes a new private playlist each week, with the first track of each match.
7. **Output.** Writes `docs/index.html`, `docs/digests/<week>.html` and `docs/archive.html`, then commits `data/` and `docs/`.

## Running it on your own computer

```powershell
pip install -r requirements.txt
python -m digest.main --dry-run --cities 2 --size 30   # quick test: saves nothing, makes no playlist
```

Keys can go in a `.env` file (see `.env.example`). It's ignored by git.
