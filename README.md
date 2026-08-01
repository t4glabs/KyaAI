# Aikyam Jobs Composer

Internal tool for the Aikyam Jobs team. Replaces the "paste JD into Claude.ai
chat, then manually re-create the formatting inside Strapi's rich-text
toolbar" workflow with: paste once, review (and edit) the AI's draft, push it
to Strapi as a Draft, then open Strapi just to proofread and hit Publish.

**Phase 1:** formats a job or company source into structured fields + a
single Markdown description block, checks proposed categories/company
against Strapi, and logs every run to a local SQLite file.

**Phase 2 (this version):** adds a "Push to Strapi as Draft" button — writes
the entry directly via the REST API (in Draft state, never auto-published),
using whatever is currently in the review boxes (so in-tool edits are what
gets sent, not just the raw AI draft) — and a poller that detects when the
entry actually goes live in Strapi and captures those final field values.
That closes the loop: every run now has the AI's original draft, what was
actually pushed, and what was actually published, all in one row.

**Phase 3 (this version):** `npm run suggest-revision -- job` (or
`company`) reads every logged run made on the currently active prompt
version that has a captured final/published snapshot, and asks Claude to
find recurring edit patterns and draft a complete replacement prompt file
addressing them. Jinso never has to draft the revised wording himself — he
reviews the analysis and the full proposed file, and approving it is just a
rename + a one-line pointer update in `promptLoader.js`, not a rewrite.

**Also included:** a Sources tab (`sources.html`) — a daily checklist of
reference links (LinkedIn searches, DevNetJobsIndia, career pages, the
Tally form inbox) with a "start new round" reset, and a duplicate-check
tool that searches our own Strapi data (never the source sites) for
"has this already been posted?" before spending time formatting it. This
never fetches or scrapes content from any third-party site — it only
stores links you add yourself, and only searches data we already own.

Also a Link Check tab (`link-check.html`) — checks whether every published
job's `applicationUrl` still responds, since orgs sometimes remove or
unpublish their own postings without telling us. This only checks that the
URL loads (like a browser would) — it never reads the job posting's
content, so it's not scraping. Runs as a background job (since checking
hundreds of external URLs can take a while) with a live progress bar; flags
non-2xx/timeout results as "worth a human look," not "definitely dead,"
since some sites block automated requests even when the page works fine —
final judgment always stays with Greeshma/Senti. Jobs using
`applicationEmail` instead of a URL aren't checked, since there's nothing
to verify there.

## Requirements

- Node.js 20+
- The `claude` CLI installed and already logged in on this machine (uses your
  Claude subscription — `claude -p` — not a metered API key)
- A Strapi API token from aikyamjobs.org with **write** access to Job,
  Company, and Category (Settings → API Tokens → Full access, or a custom
  token scoped to find/create/update on those three content types)

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```
STRAPI_API_URL=https://aikyamjobs.org/api
STRAPI_API_TOKEN=<paste the token from Strapi admin>
PORT=4100
CLAUDE_BIN=claude
```

## Run

```bash
npm start
```

Open `http://localhost:4100` (in production this is reached via a Cloudflare
Tunnel URL instead — see `MAC_MINI_SETUP.md`). The publish-poller starts
automatically whenever `STRAPI_API_TOKEN` is set, checking every 30 minutes
for pushed drafts that have since been published.

To run the poller once by hand (e.g. from cron, or to check right after
publishing something instead of waiting up to 30 minutes):

```bash
npm run poll
```

## How a push actually works

- **Job push** requires the company to already exist in Strapi. A job
  prompt only extracts a bare company name, not a real profile — creating a
  shell company with no description would be worse than the current manual
  step. If the company doesn't exist yet, the push is refused with a clear
  message: format and push the company profile first.
- **Categories** are auto-created on push if they don't exist yet (name +
  slug only, same convention as the existing `create-missing-categories.js`
  script) — these are low-stakes shared taxonomy, unlike companies.
- **Company push** looks up by slug: if it exists, it's updated in place; if
  not, it's created. Either way it lands as a Draft.
- Nothing is ever auto-published. `publishedAt` is left unset on every
  push — Greeshma's final proofread-and-Publish step in Strapi itself is
  unchanged.

## Where the log lives

Every run is a row in `data/composer.sqlite` (gitignored — local operational
data, not code):

- `ai_metadata` / `ai_description` — Claude's original draft, untouched
- `pushed_metadata` / `pushed_description` — what was actually sent to Strapi
  (reflects any edits made in the review boxes before pushing)
- `final_metadata` / `final_description` — the field values at the moment
  the poller detected the entry went live (reflects any further edits made
  in Strapi's admin before publishing)

This three-point history (AI draft → what she pushed → what she published)
is the dataset Phase 3 will mine. Nothing needs to be done to "start"
logging — it happens automatically on every format, push, and detected
publish.

## Prompts

Live in `prompts/job-prompt.v1.md` and `prompts/company-prompt.v1.md`. These
are the actual instructions sent to Claude — not just documentation — via
the `<!-- PROMPT_START -->` / `<!-- PROMPT_END -->` markers that
`src/lib/promptLoader.js` extracts. Bump the filename version (`v2`, `v3`...)
when revising, rather than editing in place, so old log entries stay
attributable to the prompt version that produced them.

## Improving the prompts from real usage (Phase 3)

```bash
npm run suggest-revision -- job      # or: company
```

Reads every logged run on the *currently active* prompt version that has a
captured final/published snapshot (older runs from a since-revised prompt
aren't a fair signal for what's wrong with today's prompt), and writes a
proposal to `prompts/job-prompt.v2.proposed.md` — an analysis of recurring
edit patterns, followed by a complete replacement prompt file in the same
structure. This never touches the active prompt.

There's nothing to analyze until there's real accumulated usage — if
nothing's been pushed and published yet, it says so and exits.

To approve a proposal: read it, and if it looks right, remove the
`.proposed` suffix from the filename and update `PROMPT_FILES` in
`src/lib/promptLoader.js` to point at it. That's the entire "improve the
prompt" workflow — drafting the revision is Claude's job, approving it is
Jinso's, and there's no manual prompt-writing in between.

## Seeing what's actually happening (Insights page)

`http://localhost:4100/insights.html` (linked from the Composer page) shows,
for Job and Company separately:

- **Activity counts** — total runs logged, how many pushed to Strapi, how
  many confirmed published.
- **Field-level edit-frequency** — for every captured run, how often each
  field differs between the AI's original draft and what actually got
  published (e.g. "excerpt changed in 8 of 12 runs"). This is a plain JSON
  comparison computed in code — **no Claude call happens when you load this
  page**, so it's free to check as often as you like.
- **The current active prompt's own changelog**, read straight from its
  file.
- **Any pending `suggest-revision` proposal**, if one exists and hasn't been
  approved or dismissed yet, with its pattern-analysis section shown inline.

This page is read-only by design — it doesn't let you approve a prompt
proposal from the browser. That stays a deliberate file-rename step (see
above): infrequent, high-stakes, and meant to be read carefully rather than
clicked through.

## Running it 24/7 on the Mac Mini

See `MAC_MINI_SETUP.md` for the full checklist — `launchd` to keep the
process running, and a Cloudflare Tunnel (not Tailscale/VPN) so Greeshma and
Senti just open a normal HTTPS URL with nothing installed on their end.

## Testing without touching the real site

`dev/mock-strapi.js` is a small fake of the Strapi endpoints this tool uses
(not part of the shipped tool). Useful for trying changes without creating
real entries on aikyamjobs.org:

```bash
node dev/mock-strapi.js 4321
# in another terminal, point the tool at it:
# STRAPI_API_URL=http://localhost:4321 in .env, then npm start
```

It also exposes `POST /_test/publish/:collection/:id` and
`POST /_test/unpublish/:collection/:id` to simulate hitting Publish/Unpublish
in the Strapi admin, and `POST /_test/edit/:collection/:id` to simulate
editing fields directly there — useful for testing the poller's full
publish → unpublish → edit → republish cycle.

Set `COMPOSER_DATA_DIR=/some/scratch/path` to point the SQLite log at a
throwaway location instead of the real `data/` folder. **Always do this for
local testing** — the real `data/` folder and `.env` hold real operational
history once this is in daily use, and testing against them directly risks
wiping real logged runs (this happened once already during development).
