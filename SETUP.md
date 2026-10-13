# Setting it up, step by step

You'll create four free accounts, copy a few keys into GitHub, then press "Run".
Allow about an hour. Do steps 1–7 on your **PC**, then step 8 is your **iPad**.


---

## 1. Create a GitHub account

1. Go to <https://github.com/signup> and sign up (the free plan is fine).
2. Confirm your email address when GitHub sends the code.
3. Turn on two-factor login when it asks you to (it will insist within a few weeks anyway).

## 2. Create the repository and upload the code

1. On GitHub, click **+** (top right) → **New repository**.
2. Name: `underground-uk`. Choose **Public**. **Don't** tick "Add a README". Click **Create repository**.
3. On your PC, open **PowerShell** in this folder
   (in File Explorer, open `Documents\Underground_music_discovery`, click the address bar, type `powershell`, press Enter).
4. Paste these lines (the code is already committed for you):

   ```powershell
   git remote add origin https://github.com/davidmcewen1-del/underground-uk.git
   git push -u origin main
   ```

   A window pops up asking you to sign in to GitHub. Choose **Sign in with your browser** and approve.
5. Refresh the GitHub page: you should see the files.

## 3. Get a Discogs token

1. Log in at <https://www.discogs.com> (create a free account if needed).
2. Go to **Settings → Developers** (<https://www.discogs.com/settings/developers>).
3. Click **Generate new token**. Copy it into a notepad for step 6.

## 4. Set up the vote server on Cloudflare

This is what saves your thumbs up/down when you tap them on the iPad.

**Create the account**

1. Go to <https://dash.cloudflare.com/sign-up>, sign up with email and password, and confirm your email.
   You don't need a domain or a paid plan. Skip any "add a site" prompts.

**Create the vote storage**

2. In the left menu: **Storage & databases → Workers KV** → **Create instance** (or "Create namespace").
3. Name it `VOTES` → **Create**.

**Create the Worker**

4. Left menu: **Compute → Workers & Pages** → **Create** → **Start with Hello World!**
5. Name it `underground-votes` → **Deploy**.
6. Click **Edit code**. Delete everything in the editor, then open `worker/worker.js` from this folder
   in Notepad, copy all of it, paste it in. Click **Deploy** (top right).
7. Go back to the Worker's page → **Settings** tab:
   - **Bindings → Add → KV namespace**. Variable name: `VOTES`. Namespace: `VOTES`. **Add binding**.
   - **Variables and Secrets → Add**:
     - Type **Secret**, name `VOTE_KEY`, value: make up a PIN or phrase (at least 8 characters,
       e.g. `bristol-dub-4471`). You'll type this once on the iPad. Note it down. **Deploy/Save**.
     - Type **Text**, name `ALLOWED_ORIGIN`, value `https://davidmcewen1-del.github.io` (no slash at the end). **Save**.
8. On the Worker's overview page, copy its address. It looks like
   `https://underground-votes.something.workers.dev`. Save it for step 6.

## 5. Set up Spotify (for the weekly playlist)

1. Go to <https://developer.spotify.com/dashboard> and log in with your normal Spotify (Premium) account.
   Accept the developer terms if asked.
2. Click **Create app**:
   - App name: `Underground UK digest`
   - App description: `Weekly playlist of new UK releases`
   - Redirect URI: `http://127.0.0.1:8888/callback` → click **Add**
   - Tick **Web API**, tick the terms box → **Save**.
3. Open the app → **Settings**. Copy the **Client ID**, click **View client secret** and copy that too.
4. Back in PowerShell in this folder, run:

   ```powershell
   python scripts/spotify_auth.py
   ```

   Paste the Client ID and Client Secret when it asks. Your browser opens Spotify: click **Agree**.
   The terminal then prints a long **refresh token**. Copy it.

## 6. Put the keys into GitHub

On your repository page: **Settings → Secrets and variables → Actions**.

**Secrets** tab → **New repository secret**, once for each:

| Name | Value |
|---|---|
| `DISCOGS_TOKEN` | token from step 3 |
| `VOTE_KEY` | the PIN from step 4 |
| `SPOTIFY_CLIENT_ID` | from step 5 |
| `SPOTIFY_CLIENT_SECRET` | from step 5 |
| `SPOTIFY_REFRESH_TOKEN` | from step 5 |

**Variables** tab → **New repository variable**:

| Name | Value |
|---|---|
| `WORKER_URL` | the Worker address from step 4 |

Secrets are hidden: nobody (including you) can read them back. Only the weekly job uses them.

## 7. Switch on GitHub Pages and run the first digest

1. **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
2. Go to the **Actions** tab. If asked, click **I understand my workflows, go ahead and enable them**.
3. Click **Weekly digest** (left) → **Run workflow** → **Run workflow**.
4. Wait. The first run takes about 20–30 minutes because it fetches politely, with pauses between requests.
   When it shows a green tick, click the run. The summary lists what it found and the page address.
5. Your digest is at **`https://davidmcewen1-del.github.io/underground-uk/`**.

From now on it runs by itself **every Friday at 7am UK time**, and a new Spotify playlist called
"Underground UK – 2026-W42" (etc.) appears in your Spotify library.

## 8. On the iPad

1. Open the digest address in Safari.
2. Tap the **Share** button → **Add to Home Screen**, so it opens like an app.
3. Tap a 👍 or 👎. The first time, it asks for your PIN from step 4. After that, each tap saves straight away.
   Tap the same thumb again to undo.
4. Use **Show → Not voted yet** to work through the week. **Play this week on Spotify** opens the playlist.

---

## Changing settings later

Open `config.toml` on GitHub, click the pencil icon, edit, and **Commit changes**. For example:
- `size = 200` sets the number of releases per week.
- `random_share = 0.2` makes 20% of each digest random picks.
- `include_self_released = true` includes artists who release without a label (set to `false` for label releases only).
- `tracks_per_release = 1` adds one track per release to the playlist (`0` adds whole releases).
- `max_releases` and `max_avg_have` turn on size limits for labels.
- `always_exclude` and `never_exclude` hold label names you want to force out or in.

## If something goes wrong

- **The Actions run is red.** Click it, then click the failed step, to see the error. A Bandcamp, Discogs or Spotify
  problem on its own doesn't stop the digest; it's noted in the run summary and the rest carries on.
- **"Permission denied" when the job pushes.** Settings → Actions → General → Workflow permissions →
  **Read and write permissions** → Save.
- **The thumbs say "Couldn't reach the vote server".** Check `WORKER_URL` (step 6) and `ALLOWED_ORIGIN` (step 4) match exactly.
- **The Spotify login fails.** Redo step 5.4. If the Spotify Premium lapses, the playlist step stops until it's renewed.
- **The schedule stops.** GitHub pauses schedules after 60 days with no activity. The weekly commit counts as activity,
  so this should only happen if the job keeps failing.
