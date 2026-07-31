# Mac Mini deployment — Aikyam Jobs Composer

This is the **one production instance** of this tool. Greeshma, Senti, and
Jinso all use it by pointing a browser at this machine over Tailscale —
nobody runs their own local copy for real work. See `README.md` for what the
tool actually does; this file is just the "get it running here, permanently"
checklist.

## Prerequisites on this machine

- Node.js 20+. Check with `node --version`. If missing/wrong version, this
  team already uses `nvm` for the aikyamjobs project — `nvm install 20 && nvm use 20`.
- The `claude` CLI installed and **already logged in as this team's Claude
  subscription** on this machine. This is not optional — every format call
  shells out to `claude -p` locally, using whatever account is logged in
  here. Check with `claude --version` and `claude -p "say ok"`.
- Tailscale already running on this machine (it already hosts Listmonk this
  way — same pattern).
- Git access to `https://github.com/t4glabs/KyaAI`.

## 1. Clone

```bash
cd ~
git clone https://github.com/t4glabs/KyaAI.git
cd KyaAI
npm install
```

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

## 4. Set up `launchd` so it runs 24/7 and survives reboots

Find the real node binary path first — launchd does **not** source your
shell profile, so `nvm`'s `node` won't be found by a bare `node` command:

```bash
which node
# e.g. /Users/<username>/.nvm/versions/node/v20.20.2/bin/node — copy this exact path
```

Create the logs folder and the launchd plist (replace `<username>`,
`<node-path>`, and the clone path below with the real values):

```bash
mkdir -p ~/KyaAI/logs
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
    <string>/Users/<username>/KyaAI/src/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/<username>/KyaAI</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/<username>/KyaAI/logs/out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/<username>/KyaAI/logs/err.log</string>
</dict>
</plist>
```

Load it:

```bash
launchctl load ~/Library/LaunchAgents/space.aikyam.job-composer.plist
```

## 5. Verify it's actually running as a service

```bash
launchctl list | grep job-composer
curl -s http://localhost:4100 -o /dev/null -w "HTTP %{http_code}\n"
tail -20 ~/KyaAI/logs/out.log
```

The log should show the startup line and should **not** show the
poller-disabled warning.

## 6. Find the address the rest of the team will use

```bash
tailscale status
```

Or check this machine's name in the Tailscale admin console. The URL
everyone bookmarks is:

```
http://<mac-mini-tailscale-name>:4100
```

Confirm it loads from a **different** device on the tailnet before telling
anyone to switch over.

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
just bookmark `http://<mac-mini-tailscale-name>:4100`. If either of them has
real logged runs sitting in a local `data/composer.sqlite` from before this
was centralized, flag that back to Jinso — those rows should be merged into
this central database before the local copies are abandoned, or that
history is lost the same way job #440's original draft was.
