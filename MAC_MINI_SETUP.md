# Production deployment — Aikyam Jobs Composer

> **Current host (since 2026-10-24):** the office MacBook (`aikyam` user),
> not the Mac Mini. The Mac Mini became unreachable, so production was
> moved over from a backup zip. The filename is kept for existing links.
> Everything below works on any Mac. The paths assume the repo is cloned
> to `~/Desktop/KyaAI`.
>
> **If the host is a laptop:** it only serves while it is awake and the
> user is logged in. Turn on System Settings → Battery → Options →
> "Prevent automatic sleeping on power adapter when the display is off",
> and keep it plugged in. If the host sleeps or logs out, the URL shows a
> Cloudflare error page.

This is the **one production instance** of this tool. Greeshma, Senti, and
Jinso all use it by opening a normal HTTPS URL in their browser — nobody
installs anything or runs their own local copy for real work. See
`README.md` for what the tool actually does; this file is just the "get it
running here, permanently, and reachable by the team" checklist.

Access is via a **Cloudflare Tunnel**, not Tailscale/VPN — the whole point
is that Greeshma and Senti never install a client app. They just bookmark a
URL, the same way they already bookmark the Strapi admin. (This machine may
still run Tailscale separately for Jinso's own remote admin access — that's
unrelated and untouched by this setup.)

## Prerequisites on this machine

- Node.js 20+ (production currently runs 22 LTS). Check with
  `node --version`. If it's missing or the wrong version, use `nvm`, which this
  team already uses for the aikyamjobs project: `nvm install 22 && nvm alias default 22`.
  If the machine has no nvm (and no Homebrew), install nvm with its
  official script from https://github.com/nvm-sh/nvm (pin a release tag,
  e.g. `v0.40.3`). It needs no admin rights.
- The `claude` CLI installed and **already logged in as this team's Claude
  subscription** on this machine. This is not optional — every format call
  shells out to `claude -p` locally, using whatever account is logged in
  here. Check with `claude --version` and `claude -p "say ok"`.
- Git access to `https://github.com/t4glabs/KyaAI`.
- A Cloudflare account with the team's domain (e.g. `aikyamjobs.org` or
  whichever is actually on Cloudflare's nameservers) already added — it
  already is, since Cloudflare is the existing DNS/CDN for that domain.

## 1. Clone

```bash
cd ~/Desktop
git clone https://github.com/t4glabs/KyaAI.git
cd KyaAI
npm install
```

On the current Mac Mini this is cloned to `~/Desktop/KyaAI`, not `~/KyaAI`
— every path below assumes wherever you actually cloned it, so adjust if
you put it somewhere else.

## 2. Configure the real environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```
STRAPI_API_URL=https://aikyamjobs.org/api
STRAPI_API_TOKEN=<the real token>
PORT=4100
CLAUDE_BIN=claude
```

**Jinso enters the real Strapi API token himself.** If an AI agent is doing
this setup, it should stop and ask a human to type the token in — it should
not be asked to generate, fetch, or store the token on the agent's behalf.

This `.env` is the one real one. It must never be pointed at a mock/test
server, and never reset — see "What not to do" below.

**Moving production to a new machine** (instead of a fresh setup): clone as
in step 1, then copy **only** `.env` and `data/composer.sqlite` over from
the old host or its backup zip. Don't extract a backup zip over the clone,
because its code is older than `main`. Check that `.env` has all four keys
without printing it (`grep -c '^STRAPI_API_TOKEN=' .env`, etc.). Also check
that the copied `composer.sqlite` is several MB: that's the real log, not an
empty fresh one.

## 3. Verify it works, in the foreground, before wiring up auto-start

```bash
npm start
```

You must see:

```
job-composer running at http://localhost:4100
```

and you must **not** see `[poller] STRAPI_API_TOKEN not set` — if you do,
`.env` isn't being read (confirm you're running this from inside the
`KyaAI` directory and that `.env` actually has the token in it).

Open `http://localhost:4100` in a browser on this machine and confirm the
Composer page loads. Ctrl+C to stop once confirmed — the foreground check
was just to catch config mistakes before making it permanent.

## 4. Set up `launchd` so the Composer app runs 24/7 and survives reboots

Find the real node binary path first — launchd does **not** source your
shell profile, so `nvm`'s `node` won't be found by a bare `node` command:

```bash
which node
# e.g. /Users/<username>/.nvm/versions/node/v20.20.2/bin/node — copy this exact path
```

Create the logs folder and the launchd plist (replace `<username>`,
`<node-path>`, and the clone path below with the real values):

```bash
mkdir -p ~/Desktop/KyaAI/logs
mkdir -p ~/Library/LaunchAgents
```

`~/Library/LaunchAgents/space.aikyam.job-composer.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>space.aikyam.job-composer</string>
  <key>ProgramArguments</key>
  <array>
    <string><node-path></string>
    <string>/Users/<username>/Desktop/KyaAI/src/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/<username>/Desktop/KyaAI</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/Users/<username>/.local/bin:<node-bin-dir>:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key>
    <string>/Users/<username></string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/<username>/Desktop/KyaAI/logs/out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/<username>/Desktop/KyaAI/logs/err.log</string>
</dict>
</plist>
```

**Don't skip the `PATH` entry.** `.env` sets `CLAUDE_BIN=claude` as a bare
name, and launchd's default PATH (`/usr/bin:/bin:/usr/sbin:/sbin`) doesn't
include where the Claude CLI lives (`which claude`, usually
`~/.local/bin`). Without it the server boots and the page loads fine, but
every format call fails. `<node-bin-dir>` is the folder from `which node`.

Load it:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/space.aikyam.job-composer.plist
```

(`bootstrap`/`bootout` are the current forms of `load`/`unload`.)

Verify:

```bash
launchctl list | grep job-composer
curl -s http://localhost:4100 -o /dev/null -w "HTTP %{http_code}\n"
tail -20 ~/Desktop/KyaAI/logs/out.log
```

The log should show the startup line and should **not** show the
poller-disabled warning. Don't move on until this is solid — the tunnel in
the next step just exposes whatever's on `localhost:4100`, so it needs to
already be correct.

Also confirm Claude works **from inside launchd**. A terminal test doesn't
prove it, because launchd gives the process a much smaller environment.
The quickest real check is to compose one test job through the UI and see
that a draft comes back. A one-off launchd job that runs `/bin/sh` is
**not** a valid test: macOS privacy protection blocks `sh` from reading
`~/Desktop` under launchd ("Operation not permitted"), but `node` is
allowed, so the server itself works.

## 5. Expose it via a Cloudflare Tunnel (no VPN, no client app for anyone)

This works on Cloudflare's **free plan** — the only requirement is that the
domain you're routing from already has its nameservers on Cloudflare, which
yours already does. As of 2026 Cloudflare's default flow is dashboard-first
rather than CLI-first, so most of this happens in the browser.

1. Go to **one.dash.cloudflare.com → Networks → Tunnels → Create a tunnel**.
2. Choose connector type **Cloudflared**, name it (e.g. `aikyam-composer`).
3. The dashboard gives you a one-line install command for macOS — copy and
   run it on the Mac Mini. This installs the `cloudflared` binary **and**
   registers/starts it as a background service (a launchd agent named
   `com.cloudflare.cloudflared`) in one step — you don't hand-write a plist
   for this part, unlike step 4 above.
4. Still in the dashboard, on that tunnel's **Public Hostname** tab, add a
   hostname:
   - Subdomain: something like `compose` (so the URL becomes
     `compose.aikyamjobs.org` — pick whatever subdomain makes sense on
     whichever domain is on your Cloudflare account)
   - Service type: `HTTP`
   - URL: `localhost:4100`
5. Save, then check the tunnel's status in the dashboard — it should show
   **Healthy** (green) within a few seconds.
6. From a **different device**, visit `https://compose.<your-domain>` and
   confirm the Composer page loads — no app, no login prompt yet (that's
   the next step), just the page.

### 5b. Moving the existing tunnel to a new host (what was done 2026-10-24)

`compose.aikyamjobs.org` already has a tunnel, a DNS record and an Access
app. When production moves machines, **don't create a new tunnel**. Run a
connector for the existing one on the new host:

1. **Lock the old host out first.** Two connectors on one tunnel are
   load-balanced, so traffic would be split between two servers with two
   different databases. If you can reach the old host, run
   `sudo cloudflared service uninstall` there. If you can't, go to the
   tunnel in the dashboard → **Configure** → rotate the tunnel token. The
   old host's token then stops working.
2. Get the (new) token: tunnel → **Add a replica** → macOS shows a command
   ending in `--token eyJ…`. Save just the token without pasting it
   anywhere else:
   ```bash
   mkdir -p ~/.cloudflared && chmod 700 ~/.cloudflared
   pbpaste | grep -o 'eyJ[A-Za-z0-9_=.-]*' | head -1 > ~/.cloudflared/composer.token
   chmod 600 ~/.cloudflared/composer.token
   ```
3. **No Homebrew or sudo needed:** download `cloudflared-darwin-arm64.tgz`
   (or `-amd64` on Intel) from
   https://github.com/cloudflare/cloudflared/releases. Check that it's
   signed by Cloudflare (`codesign -dv cloudflared` should show
   `TeamIdentifier=68WVV388M8`), then `install -m 755 cloudflared ~/.local/bin/`.
4. Run it as a user LaunchAgent,
   `~/Library/LaunchAgents/space.aikyam.cloudflared.plist`. It's the same
   shape as step 4, with RunAtLoad and KeepAlive, and logs in
   `~/Library/Logs/cloudflared/`. `ProgramArguments` is:
   ```
   /Users/<username>/.local/bin/cloudflared --no-autoupdate tunnel run
     --token-file /Users/<username>/.cloudflared/composer.token
   ```
   `--token-file` keeps the token out of the plist and out of `ps`.
   Because auto-update is off, update `cloudflared` by hand now and then.
5. Check the log for 4× `Registered tunnel connection` and an
   `Updated to new configuration` line listing `compose.aikyamjobs.org →
   http://localhost:4100`. The routing comes from the dashboard, so no
   local config file is needed. In the dashboard, only the new host should
   be listed as a connected replica.

## 6. Recommended: gate access with Cloudflare Access (still free, still no app to install)

Without this, anyone who discovers the URL can push jobs/companies and use
your Claude subscription's usage. Cloudflare Access solves this without a
shared password (which gets copy-pasted around and never rotated) — instead
each person logs in with their own email, free for up to 50 users:

1. In the Cloudflare **Zero Trust** dashboard → **Access → Applications →
   Add an application → Self-hosted**.
2. Set the application domain to the same hostname from step 5
   (`compose.<your-domain>`).
3. Add a policy: **Allow**, rule type **Emails**, and list the exact
   addresses that should have access (Greeshma's, Senti's, Jinso's).
4. Set the session duration long (e.g. 30 days) so this is a rare
   once-a-month prompt, not a daily one.
5. Save. Now visiting the URL asks for an email address, sends a one-time
   code to that inbox, and after entering it, the person is in — nothing to
   install, nothing to remember, and only the allowlisted emails can ever
   reach the tool.

If you'd rather skip this for now and add it later, that's fine too — steps
1-5 alone give you a working, reachable tool; this step is what keeps it
from being open to the entire internet.

(This is already in place for `compose.aikyamjobs.org`, under the Zero
Trust team `jinsoraj2000`. Moving hosts doesn't affect it.)

## 7. Daily database backups

`data/composer.sqlite` is the only copy of the production log. `npm run
backup` (`src/backup-db.js`) snapshots it to
`~/Backups/KyaAI/composer-YYYY-MM-DD.sqlite`:
- It uses SQLite's online backup, so it's safe while the server is running.
- It runs an integrity check before keeping the file.
- It keeps the newest 30 days and deletes older ones.

You can override the defaults with `COMPOSER_BACKUP_DIR` and
`COMPOSER_BACKUP_KEEP`.

A LaunchAgent, `~/Library/LaunchAgents/space.aikyam.composer-backup.plist`,
runs it daily. It uses the same node path as step 4, runs
`src/backup-db.js` from `WorkingDirectory` `~/Desktop/KyaAI`, and has
`StartCalendarInterval` Hour 13 / Minute 0. Its output goes to
`logs/backup.log`. If the Mac is asleep at 13:00, launchd runs it on wake.
To run it now and check:

```bash
launchctl kickstart gui/$(id -u)/space.aikyam.composer-backup
tail -3 ~/Desktop/KyaAI/logs/backup.log   # "backup ok: … (N runs, … MB …)"
```

These backups are on the same disk, so they protect against a deleted or
corrupted DB, **not** against losing the machine. Now and then, also copy
the latest snapshot somewhere off the machine.

To restore: stop the server (`launchctl bootout gui/$(id -u)/space.aikyam.job-composer`),
copy a snapshot over `data/composer.sqlite`, then bootstrap it again.

## Deploying an update

`git pull` alone is **not enough** — static files (`public/*.html`, `*.js`,
`*.css`) are read fresh from disk on every request, so those update
immediately, but Express only registers server-side routes once at startup.
If a new feature added a new API route and you only `git pull` without
restarting, the page will load fine but any new endpoint will 404 with
`Cannot POST/GET ...` — that's the exact symptom, and it means the running
process is still the old one. And if `package.json` changed (a new
dependency was added), skipping `npm install` fails differently — the
server won't even start, crashing on `Cannot find module '...'` in
`logs/err.log`. Every update needs all three steps (the third is a no-op,
and fast, when nothing actually changed):

```bash
cd ~/Desktop/KyaAI
git pull
npm install
launchctl kickstart -k gui/$(id -u)/space.aikyam.job-composer
```

(`kickstart -k` kills the running server and starts it again straight
away. If you change the plist itself, you need
`launchctl bootout gui/$(id -u)/space.aikyam.job-composer` and then
`bootstrap` again.)

If Node is upgraded through nvm, the hardcoded node path in **both**
`space.aikyam.job-composer.plist` and `space.aikyam.composer-backup.plist`
has to be updated.

Verify the same way as initial setup: `tail -20 ~/Desktop/KyaAI/logs/out.log`
should show a fresh startup line.

## What NOT to do on this machine

- Don't run `npm run poll` manually as a "test," don't run
  `dev/mock-strapi.js`, and don't point this `.env` at anything other than
  the real aikyamjobs.org Strapi. This is the one production copy, not a
  dev/test sandbox.
- Don't delete or reset `data/composer.sqlite` here. It's the one shared
  log every operator's formatting/push/edit activity feeds into — this
  already happened once by accident during development and cost us a
  real logged example.
- Code changes/experiments belong on a separate dev copy (or use
  `COMPOSER_DATA_DIR=/tmp/...` overrides there), never on this deployment.

## After this is confirmed working

Tell Greeshma and Senti to stop running any local copy of their own and
just bookmark `https://compose.<your-domain>`. If either of them has real
logged runs sitting in a local `data/composer.sqlite` from before this was
centralized, flag that back to Jinso — those rows should be merged into
this central database before the local copies are abandoned, or that
history is lost the same way job #440's original draft was.
