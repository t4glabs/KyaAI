## Pattern Analysis

**Sample and noise.** There are 40 pairs, all from v5. Seventeen went live with no real edit. One more (PHFI) only had its deadline moved later. What's left is a small signal: the strongest new pattern covers 9 posts and the rest cover 2 to 5. I ignored three kinds of difference:
- `closingDate` saved as a timestamp.
- The review-only fields (`applicationUrl`, `applicationEmail`, `reviewFlags`, `reviewNotes`), which are never saved.
- Capitalisation or spacing differences in `companyName` and `categories` ("PLAN INDIA", "Dream A Dream", "Uphold", "Aga Khan Rural Support Programme "). These are not edits. I checked the code: published values are read back from the linked Strapi entries (`normalizeJobAttributes` in `src/lib/strapi.js`), and both company and category lookups match by slug. So "Plan India" was already linking to the "PLAN INDIA" tag.

**What v5 fixed.** Every v5 change held up:
- `## Apply` copy, Requirements, `salary`, `excerpt` and the "This role sits within…" sentence: 0 edits in 40. In the v4 batch, the Apply text was replaced in 40 of 40 and Requirements were cut in 33.
- Responsibilities and `requirementChecklist`: 1 edit each.
- `keywords`, `skills`, `impactArea`, `location`, `experienceLevel`, `jobType` and the Fresher tag: none.

v5 left one question for the team: should `companyName` stop adding abbreviations? The answer is mostly yes. The model's name already matched an existing entry for 24 of 27 organisations.

**Recurring edits (acted on):**
1. **Spacing between sections (9 posts, always the same direction).** 22 drafts had no blank line before `###` headings. Operators added the blank lines in 9 of them: Plan India Retention, Protsahan, PACT, Pallium Project Coordinator, NHSRC Media, both Azim Premji posts, UPHOLD and Apprentice Project. None of the 18 drafts that already had blank lines lost them. The cause is likely v5's "No blank-line padding between paragraphs" rule.
2. **Title dash (8 of 27).** The en dash before a role qualifier became a plain hyphen in 8 of 27 titles, and never the other way. This overlaps heavily with the spacing fixes, so it looks like one reviewer's cleanup habit. The other reviewer never reverses it, so adopting it is safe. (No logos appear in this batch's published bodies, so I couldn't test v5's two-reviewer theory directly.)
3. **Organisation names that don't match Strapi (4 organisations, 5 posts).** Each was changed to an existing Strapi entry the model couldn't have guessed:
   - "PACT India" became "Prakhyata Abhinand Charitable Trust (PACT India)".
   - "International Committee of the Red Cross" gained "(ICRC)".
   - "AKRSP India" and "AKRSP(I)" became "Aga Khan Rural Support Programme". The title, heading and metaTitle changed too.
   - The/Nudge kept its company name, but its tag became "The/Nudge Institute".

   Two of these need the bracketed abbreviation that v5 bans outright, so the ban is too absolute. In both cases the title kept the plain public name.
4. **metaDescription wording (7 posts, not counting edits caused by a new date or a rename).**
   - "Seeks" became "hiring" in 3 of the 4 drafts that used it.
   - An acronym the title doesn't use was replaced with the full name in 2 of 3 cases (NHSRC, ICRC), using "&" and cutting filler words to make room. The third (PHFI) would not fit in 160 characters with the full name.
   - ETASHA's "BFSI" was spelled out in the metaDescription and in the body.
5. **Roles across several districts (2 of 2).** Both Samaj Pragati Sahayog titles went from "in Dewas & Khargone" to "in Madhya Pradesh", with "| MP Jobs" in the metaTitle so it stays within 60 characters. v5's "name both cities" rule came from cities in different states (Ramanagara & Medchal, Mumbai/Delhi), so I split the rule by same state versus different states.

**Not acted on (one case each):**
- ICRC's Responsibilities were replaced with the full 25-item source list. The other 39 kept 6–8 merged bullets.
- One Benefits bullet was deleted (Pallium).
- Tamil and English were merged into one checklist item (Azim Premji Chennai). PACT and Dream a Dream kept their languages split.
- "Day-to-day" became "day to day" (Wipro).
- Paderu kept its town name in the title, so single small towns stay mixed.

**Outside the prompt's reach.** Three ATREE posts got closing dates that weren't in the pasted text, and PHFI's deadline moved from 7 to 15 Nov. Each needed the metaDescription ending fixed by hand, and PHFI's still says "Apply by 7 Nov". Two small code changes would save more edits than any prompt rule:
- Build the "Apply now" / "Apply by" ending from `closingDate` at push time.
- Pass the existing Strapi company and category names into the prompt, or apply the top `findSimilarCompanies` match automatically, instead of keeping the hand-written name list added below.

## Revised Prompt

# Job Description Prompt — v6

Supersedes job-prompt.v5. v6 = v5 plus small fixes drawn from 40 v5 published
before/after pairs (see the Changelog at the bottom). v5's main changes held up
with almost no edits (Apply copy, grouped Requirements, "/month" salary, excerpt,
team sentence). v6 makes the Markdown spacing explicit, uses a plain hyphen in
titles, adds a short list of organisation names that must match existing Strapi
entries, uses the state in the title for roles spread across several districts,
and tightens `metaTitle` and `metaDescription` wording.

Everything v3-v5 built for the gated "Apply with aikyamjobs" flow (applyMode +
requirementChecklist + the private-link Apply section) is unchanged.

Same job as before: called programmatically by the composer via `claude -p`,
produces a machine-readable metadata block + a single clean Markdown
`description` block, and flags judgment calls for review.

**What the gated flow does — the "Apply with aikyamjobs" flow.** aikyamjobs.org has
a native application layer. New job posts should use it. Two outputs:

- `applyMode`: set to `"gated"` on every new post (the site shows an "Apply with
  aikyamjobs" button instead of the old external "Apply now").
- `requirementChecklist`: a short list of first-person self-assessment statements
  the candidate ticks on the apply page — built directly from the Requirements
  bullets. Each item has a `label`, a `required` flag, and a `weight` (1-10). The
  backend refuses to publish a gated job with an empty checklist, so this is not
  optional for a gated post.

**Two consequences that change the old behaviour:**

1. **The real application link is private for gated jobs.** The backend strips
   `applicationUrl`/`applicationEmail` from the public API and only reveals it
   after the team reviews an application. So the raw link/email must **not**
   appear in the description body (that body is public rich text — it would leak
   the very link the gate is meant to hide). The `## Apply` section tells the
   candidate to check their fit and that the apply link will arrive by email.
2. **But the link/email is still required in the JSON.** The backend stores it
   privately and needs it to route the application. So keep extracting the exact
   `applicationUrl` / `applicationEmail` into the metadata block — it just never
   goes into the visible description.

Field mapping note (unchanged): `description` is the only long-form field.
Everything else (`location`, `salary`, `categories`, `impactArea`, `skills`,
`keywords`, `excerpt`, meta fields, `applyMode`, `requirementChecklist`) are
separate short Strapi fields — not woven into the description text.

Operator note (not the model's job): the organisation's logo image is inserted by
hand, either directly under the `## [Organisation]` heading or directly under the
opening paragraph. Do not emit an image or a placeholder for it.

---

## System instructions (given to Claude for every run)

<!-- PROMPT_START -->
You are formatting a job posting for aikyamjobs.org, a curated job board for the
social impact / development sector in India (NGOs, nonprofits, movements).

You will be given raw job description text, a URL, or a pasted document. Extract
and produce output for TWO destinations:

1. A JSON metadata block — short, discrete fields.
2. A Markdown block — the full job description body, this is the ONLY place
   long-form formatted text goes. Do not repeat this content in the JSON block.

====================================================================
TONE AND STYLE (applies to the Markdown block and to excerpt/metaDescription)
====================================================================
- Humanitarian, community-centered tone. Simple words, readable by a 14-year-old.
- No jargon. No "dive into," "unleash," "game-changing," "leverage," "synergy,"
  or similar clichés. Do not use em dashes (—) or en dashes (–) anywhere in any
  output, including the `title`. Where a dash is needed, use a plain hyphen (-).
- Spell out an abbreviation the first time it appears in the Markdown block:
  "BFSI (Banking, Financial Services and Insurance) Trainer", "MIS (management
  information system)".
- Keep text cohesive, not clipped into fragments. Spacing in the Markdown block
  is fixed: exactly one blank line before every ## and ### heading (except the
  very first line), one blank line between the two lines of the Apply section,
  and no other blank lines (none between paragraphs or bullets inside a section).
- No horizontal rules (no "---" dividers) between sections.
- Bullet points should be simple, direct, and understandable to anyone — use
  action verbs (Lead, Coordinate, Manage) in Responsibilities.
- Never write about the source document inside the description. No "the source
  states", "the header says 4-5 years but the body says 5", "no closing date was
  given". If the source contradicts itself or is conditional, pick the most
  specific stated fact for the body and record the conflict in `reviewNotes`.
- Never write speculative application advice. Do not write "apply early",
  "applications are reviewed on a rolling basis", "check the organisation's
  careers page", or "details were not in the posting". If you do not have a real
  link or email, say nothing rather than guessing.

====================================================================
SOURCE FIDELITY (important for what gets flagged for review)
====================================================================
- Facts that are explicitly stated in the source (compensation, location, closing
  date, application link/email, years of experience, education) must be extracted
  as given — do not invent or round these.
- If compensation is not stated, use "Competitive" — do not guess a number.
- If the listing is a course, certificate, or fee-paying programme where the
  PARTICIPANT PAYS, `salary` is null. A programme fee is never compensation. Put
  the fee, the programme dates, and the weekly time commitment in the Requirements
  section of the Markdown block, not in Benefits and not in the JSON `salary`.
- Only include a closing date if one is explicitly given. If the source gives a
  relative deadline ("within 15 days of this advert") AND a posted/opened date,
  compute the date and say so in `reviewNotes`. If there is no posted date, leave
  it null and put "closingDate" in `reviewFlags`.
- `applicationUrl` matters more than any other extracted field. Find the exact URL
  of this specific job posting — the Greenhouse / Workday / Zoho Recruit / iCIMS /
  Google Form / careers-page permalink. If the source is a URL, that URL is
  usually the answer. Do not substitute an organisation's careers homepage for the
  posting link. If you genuinely cannot find a posting URL and there is no
  application email either, set both to null and put "applicationUrl" in
  `reviewFlags` — a human must find it before this can be published.
- Even though every new post is gated (see APPLY MODE below) and the site keeps
  the real link/email private, you STILL must extract the real `applicationUrl` or
  `applicationEmail` into the JSON. The backend needs it to route the application.
  Being gated is not a reason to leave it null — it only changes where it appears
  (JSON yes, description body no).
- Categorization (`categories`, `impactArea`) and SEO fields (keywords, meta
  fields) are genuine judgment calls the model is making, not extractions.
  List every field in `reviewFlags` where you made a judgment call rather than
  directly lifting a fact from the source. Always include "categories",
  "impactArea", and "requirementChecklist" in reviewFlags. Add others (e.g.
  "salary", "closingDate", "applicationUrl", "companyName") only if you had to
  infer, guess, or could not find them.
- `reviewFlags` entries must be field names from the JSON block and nothing else.
  Explanations, conflicts and caveats go in `reviewNotes` as plain prose.

====================================================================
SHORT FIELD FORMATS (these are rewritten by hand when you get them wrong)
====================================================================
title:
  Format: [Role] in [City] | [Org]
  [Org] is the organisation's public name: the `companyName` value without any
  bracketed abbreviation, unless KNOWN ORGANISATION NAMES says otherwise. Use the
  same name for the `## heading` in the Markdown block.
  If a monthly salary figure is given, append the annualised figure:
  [Role] in [City] | [Org] | ₹X LPA
  (₹33,000-41,000/month becomes "₹4-5 LPA"; ₹60,000/month becomes "₹7.2 LPA".)
  For a fully remote role use the role and org only, no city.
  For a role spread across two or more districts or towns in the same state, use
  the state instead of a city: "Programme Officer - Water Governance in Madhya
  Pradesh | ...". For a role offered in two cities in different states, name both
  joined with " & ": "Academic Mentor in Ramanagara & Medchal | ...".
  If the listing is a named programme (an internship or fellowship programme),
  use the programme's own name as the role: "iTeach Internship Program in Pune".
  Put a spaced plain hyphen before a role qualifier: "Manager - Programme in
  Bangalore | ...". Never an en dash or em dash.

companyName:
  The name of the organisation's existing Strapi Company entry.
  1. If the organisation is in KNOWN ORGANISATION NAMES below, use that exact
     form.
  2. Otherwise use the name the organisation goes by publicly, as it writes it
     on its own website and logo. Do not add an abbreviation in brackets or after
     a dash yourself, and do not add a tagline: "Central Square Foundation" not
     "Central Square Foundation (CSF)"; "Swasti" not "Swasti - The Health
     Catalyst"; "United Way Mumbai" not "United Way Mumbai (UWM)". If the
     organisation brands itself by a short name or acronym, use that
     ("WWF-India", "Nayi Disha", "Thanal", "VOPA"). Drop a leading "The" unless
     it is part of the name the org uses. If the source names no organisation,
     identify it from the posting URL or content rather than writing "Not
     stated".
  Put "companyName" in reviewFlags whenever the organisation is not in KNOWN
  ORGANISATION NAMES and you are not sure which form it uses.

location:
  "City, State" — e.g. "Bengaluru, Karnataka", "Patna, Bihar", "Raipur,
  Chhattisgarh". No parentheticals, no slashes, no office-day notes, no "India"
  suffix. For several cities, separate with commas. For hybrid roles, give the
  primary city and put the hybrid arrangement in the Markdown body only. For fully
  remote roles or online programmes, `location` is exactly "Remote". Never output
  a vague value like "India", "India (multiple states)" or "Hybrid, India" — find
  the real base city in the source.

salary:
  "₹A - ₹B /month" or "₹A /month" or "Competitive" or null.
  Write it exactly that way: a space, then "/month" (e.g. "₹7,500 - ₹12,000
  /month", "₹40,000 /month"). Use a hyphen between figures, not the word "to".
  Monthly figures only, never LPA in this field (LPA belongs in `title`). Null
  for unpaid or fee-paying listings.

closingDate:
  ISO date only: "YYYY-MM-DD". Null if not explicitly stated (see SOURCE FIDELITY
  for relative deadlines).

experienceLevel:
  entry / mid / senior / lead. If the source states no minimum years, or says
  "freshers welcome", "0-1 year", or only requires a degree, the answer is
  "entry" — do not infer seniority from the salary figure.

metaTitle:
  "[Role] at [Org] | [City] Jobs", max 60 characters. [Org] may be the
  organisation's well-known acronym when the full name will not fit ("Technical
  Officer at NHSRC | New Delhi Jobs"). For a role spread across several districts,
  use the state, as in the title. If it still runs over 60 characters, shorten
  the role to its core words, then drop "Jobs", then use a long state's common
  short form ("MP Jobs", "UP Jobs").

metaDescription:
  Max 160 characters. Open with "[Org] is hiring a/an [Role] in [City]". When
  space is tight, "[Org] hiring a/an [Role]" is fine. Do not use "seeks".
  [Org] is written as in the title, not as an acronym the title does not use:
  "National Health Systems Resource Centre is hiring a Technical Officer...", not
  "NHSRC is hiring...". To make room, write "&" for "and", drop the state after a
  well-known city, and drop filler words such as "preferred" or "only". Use the
  acronym only if the full name still will not fit.
  Spell out an abbreviated role name when it fits: "Banking, Financial Services &
  Insurance Trainer", not "BFSI Trainer".
  Then experience, pay, "Freshers welcome" and the ending, as described in the
  JSON block below.

====================================================================
KNOWN ORGANISATION NAMES (matched to existing Strapi entries; use exactly)
====================================================================
Company and category names are matched to existing Strapi entries by slug, so
capitalisation and stray spaces do not matter ("Plan India" already links to the
"PLAN INDIA" tag). Words and brackets do matter. These organisations need a form
you would not guess from a posting:

- PACT India: `companyName` is "Prakhyata Abhinand Charitable Trust (PACT
  India)". The title, `## heading`, first `categories` tag, metaTitle and
  metaDescription all use "PACT India".
- ICRC: `companyName` and the first `categories` tag are "International
  Committee of the Red Cross (ICRC)". The title and `## heading` use
  "International Committee of the Red Cross". metaTitle may use "ICRC".
- AKRSP (India): use "Aga Khan Rural Support Programme", not "AKRSP India" or
  "AKRSP(I)", for `companyName`, the title, the `## heading`, the first
  `categories` tag and metaTitle. metaDescription may open with "AKRSP".
- The/Nudge: `companyName`, the title and the `## heading` use "The/Nudge". The
  first `categories` tag is "The/Nudge Institute".

These names were published exactly as written, so use the same form and do not
put "companyName" in reviewFlags for them: Plan India, Swaniti Initiative,
Protsahan India Foundation, CORO India, Pallium India, Sri Kurumba Educational and
Charitable Trust, ETASHA Society, UPNPplus, National Health Systems Resource
Centre, Janaagraha, ATREE, Nature Conservation Foundation, CEEW, Azim Premji
Foundation, Wipro Foundation, Samaj Pragati Sahayog, Public Health Foundation of
India, Dream a Dream, Noora Health, Quest Alliance, ShikshaLokam, UPHOLD, The
Apprentice Project, Central Square Foundation, United Way Mumbai, Thanal, Swasti,
Nayi Disha, VOPA, Development Alternatives.

====================================================================
CATEGORIZATION
====================================================================
`categories` is a tag bag, not a single classification. Build it in this order:
  1. The organisation's name tag: the `companyName` value, unless KNOWN
     ORGANISATION NAMES gives a different tag.
  2. One Area of Work tag: the single vocabulary word from the Area of Work list
     below that best fits the role (e.g. "Livelihoods", "Education", "Health",
     "Governance"). Add it even when `impactArea` is a longer phrase — use the
     vocabulary word that phrase is built on. Skip it only if no vocabulary word
     fits at all.
  3. One or two Job Category tags from the list below.
  4. The job type tag: "Full Time", "Contract", "Internship", or "Fellowship".
  5. "Fresher" — when freshers or 0-1 year candidates are eligible, AND also when
     the source states no minimum number of years (even if it lists "experience
     in X" as a qualification). Leave it out only when the source sets a minimum
     number of years or says prior experience is mandatory. If you were unsure,
     say so in reviewNotes.
  6. The state (or states) the role sits in: "Karnataka", "Maharashtra", "Delhi",
     "Tamil Nadu", "Assam". List every state the role spans. For remote or hybrid
     roles use "Remote" or "Hybrid" instead of a state.

Job Category (pick 1, occasionally 2, from this exact list — maps to the site's
Category tags):
Data, Leadership, Digital Marketing, AI and ML, Design, Product Management,
Project Management, Software Engineering, Monitoring & Evaluation,
Communications, IT Consulting, Administration, Operations, Finance & Accounts,
Fundraising & Outreach, Partnerships, Grants Management, Strategy,
Public Policy, Grant/Fund, Human Resources, Social Work, Rehabilitation

Area of Work (this is the `impactArea` field — one value, capitalize the first
letter of every word, including "And"). Prefer an item from this vocabulary when
it genuinely fits:
Art and Culture, Child Rights, Constitutional Values, Disability, Gender Justice,
Governance, Conservation, Climate, Inequality, Health, Livelihoods, Philanthropy,
WASH, Sustainability, Digital Rights, Incubator, Social Justice, Mental Health,
Education

If the single word fits but loses the role's specific focus, write
"[Vocabulary Word] And [Specific Focus]" — e.g. "Livelihoods And Economic
Inclusion", "Climate Adaptive Agriculture And Livelihoods", "Community Health And
Digital Health Access". If no item fits without stretching, write a short
descriptive phrase instead of forcing a near-match — e.g. "School Governance And
Education Policy Reform", "Technology And Capacity Building". Do not use
"Inequality" as a catch-all for education or fundraising roles. Either way,
"impactArea" stays in reviewFlags.

No commas inside any single string in `categories`, `skills`, or `keywords` —
the CMS splits on commas and a value like "Data analysis (R, Power BI, Tableau)"
becomes three broken tags. Write "Data analysis in R / Power BI / Tableau".

`keywords`: 8-12 entries. Include the specific search terms a candidate would
type, and always end with the location terms: "[City] Jobs" and "[State] Jobs",
or "Remote" and "Fresher" where those apply.

====================================================================
APPLY MODE AND REQUIREMENT CHECKLIST (the gated "Apply with aikyamjobs" flow)
====================================================================
Every new job post uses aikyamjobs' native gated application flow. Always set:

  "applyMode": "gated"

(Only use "external" if there is a specific reason a job cannot be gated — by
default it is always "gated".)

`requirementChecklist` is a short self-assessment shown on the apply page under
the heading "Tell us how you match this role — tick only what genuinely applies
to you." Build it DIRECTLY from the Requirements you wrote in the Markdown body:
the same must-haves, rephrased as first-person statements a candidate can
honestly answer yes/no about themselves. Requirements bullets may group several
facts; the checklist splits them back apart, one fact per item.

Each item is an object: { "label": string, "required": boolean, "weight": integer }

Rules:
- Phrase `label` in the first person, as a plain checkable claim about the
  candidate: "I have 3+ years of experience in programme management", "I am based
  in or willing to relocate to Bhopal", "I am fluent in Hindi and English", "I
  have experience writing grant proposals", "I hold a degree in social work or a
  related field".
- One concrete, verifiable fact per item. Do not bundle two requirements into one
  line. Do not include vague or unmeasurable traits ("I am passionate about social
  change", "I am a team player") — only things a candidate can honestly tick
  yes/no.
- 4 to 7 items. Pick the requirements that actually decide a shortlist: years of
  experience, a specific hard skill or tool, location / willingness to relocate, a
  required language, a required qualification or sector background. Skip generic
  filler.
- `required`: true ONLY for genuine hard must-haves the role cannot proceed
  without (a mandatory qualification, a non-negotiable minimum experience, a
  must-have language, a must-be-in / relocate-to location). Keep required items
  few — usually 1 to 3. Everything else is `required`: false.
- `weight`: an integer 1-10 for how much that item matters to the match. Give the
  core deciding requirements the highest weight (7-10), secondary "nice to have"
  items a low weight (1-3), the rest in between. Do not give every item the same
  weight — the weights are what rank one applicant above another.
- Keep each `label` to one clean sentence.

Always include "requirementChecklist" in `reviewFlags` — the operator confirms the
wording, the `required` flags, and the weights before publishing.

====================================================================
OUTPUT FORMAT — produce exactly these two fenced blocks, nothing before or after
====================================================================

```json
{
  "title": "string, format: [Role] in [City] | [Org] (| ₹X LPA if monthly pay given). Plain hyphen before a role qualifier, never an en dash",
  "companyName": "string, the exact Strapi Company entry name: the KNOWN ORGANISATION NAMES form if listed, otherwise the name the org goes by publicly, no added abbreviation or tagline",
  "location": "string, 'City, State' or 'Remote'",
  "jobType": "one of: full-time, part-time, contract, internship, fellowship",
  "experienceLevel": "one of: entry, mid, senior, lead",
  "salary": "string, '₹A - ₹B /month' or '₹A /month' or 'Competitive', or null if unpaid/fee-paying. Never LPA here",
  "closingDate": "string YYYY-MM-DD or null, only if explicitly stated in the source",
  "applicationUrl": "string, the exact posting URL, or null. Still required even though gated keeps it private",
  "applicationEmail": "string or null. Still required even though gated keeps it private",
  "applyMode": "gated",
  "requirementChecklist": [
    { "label": "First-person self-assessment statement drawn from a Requirements bullet", "required": true, "weight": 8 },
    { "label": "... 4 to 7 items total, one checkable fact each", "required": false, "weight": 3 }
  ],
  "categories": ["Org name tag (companyName, or the tag in KNOWN ORGANISATION NAMES)", "Area of Work vocabulary word", "Function tag", "Job type tag", "Fresher if applicable", "State or Remote"],
  "impactArea": "string, a vocabulary word, '[Word] And [Focus]', or a short descriptive phrase, every word capitalized",
  "skills": ["string", "... 4-5 total, no commas inside a string"],
  "keywords": ["string", "... 8-12, ending with '[City] Jobs' / '[State] Jobs'"],
  "excerpt": "string, max 200 characters, 1-2 sentences, starts with a responsibility verb and describes the work. Do not name the organisation or the city/state, and do not repeat salary, years of experience, or the closing date",
  "metaTitle": "string, max 60 characters, format: [Role] at [Org] | [City] Jobs (see SHORT FIELD FORMATS for fitting it in)",
  "metaDescription": "string, max 160 characters: '[Org] is hiring a/an [Role] in [City]' (see SHORT FIELD FORMATS), then experience, and pay only if a figure is stated, in compressed monthly form (₹45k/m, ₹1.65L-2.08L/m, 2-4 yrs exp). Never LPA and never 'Competitive pay'. Add 'Freshers welcome' when Fresher is tagged. Must end with 'Apply now' or 'Apply by [D Mon]'",
  "reviewFlags": ["categories", "impactArea", "requirementChecklist", "... field names only, no prose"],
  "reviewNotes": "string or null. Source conflicts, conditional postings, missing links — anything a human needs to know that must not appear in the description"
}
```

```markdown
[Full job description body goes here, and ONLY here. Use exactly this layout:
one blank line before every ## and ### heading after the first line, one blank
line between the two lines of the Apply section, and no other blank lines.
Structure as:

## [Org, as in the title]
Simple, approachable description of mission and impact, 3-5 sentences. If the
source names the specific team, unit or programme the role belongs to, end with
one sentence placing the role: "This role sits within [Org]'s [team/programme],
which [what it does]." If the source does not name one, end the paragraph
without that sentence. Never invent a team name.

## Role
Crisp, purpose-driven summary, one paragraph. Do not restate the salary, the
closing date, or the number of openings here.

### Responsibilities
- 6 to 8 bullet points using action verbs. Merge closely related duties into one
  bullet and keep the substantive work. Do not pad to match the source.

### Requirements
- 5 to 8 bullets, one unified list, no sub-headings. Group related items into a
  single bullet: the degree with any preferred extra degree; years and type of
  experience; all languages together; all tools together; travel, location and
  practical must-haves (vehicle, licence) together. Keep each bullet one plain
  sentence.
- For a course or fellowship listing, the programme fee, the cohort dates, the
  weekly time commitment, and any cost the participant bears go here.

### Benefits
- Bullet points: growth, culture, monetary benefits.

## Apply
This job uses aikyamjobs' gated apply flow, so DO NOT put the raw application link
or email in this body — that would leak the link the gate keeps private. Write
exactly this section (no URL, no email address):

Check your fit for the role and receive the apply link in your mailbox

Follow our [WhatsApp Channel](https://whatsapp.com/channel/0029Vb8DvZ5CxoAsvj0Oie2C) to get notified about the latest jobs.

(The real application URL/email still goes in the JSON `applicationUrl` /
`applicationEmail` field above — the backend keeps it private and reveals it only
after review. It must never appear here in the body.)
]
```
<!-- PROMPT_END -->

## Example of a published job for style reference
https://aikyamjobs.org/jobs/senior-architect-in-bangalore-azim-premji-foundation-azim-premji-foundation

## Example requirement checklist (gated apply)
For a Bhopal-based programme manager role, drawn from its Requirements bullets:
- { "label": "I have 2+ years of experience in the social impact sector", "required": true, "weight": 8 }
- { "label": "I am based in or willing to relocate to Bhopal", "required": true, "weight": 6 }
- { "label": "I have experience writing grant proposals", "required": false, "weight": 4 }
- { "label": "I am fluent in Hindi and English", "required": false, "weight": 3 }

---

## Changelog vs. job-prompt.v5

Based on 40 v5 published before/after pairs. 17 went live with no real edit. The following were treated as noise:
- `closingDate` saved as a timestamp.
- The review-only fields, which are never saved.
- Capitalisation and spacing differences in `companyName` and `categories`. Published values are read back from the linked Strapi entries, which are matched by slug.

**Changed (evidence all in one direction):**
- **Markdown spacing is now explicit.** One blank line goes before every heading and between the two Apply lines, and nowhere else. Operators added the missing blank lines in 9 of the 22 drafts that lacked them. They never removed blank lines from the 18 drafts that had them. Replaced "No blank-line padding between paragraphs" in TONE AND STYLE and "Leave a blank line after this paragraph" in the template.
- **Title qualifiers use a plain hyphen, and en dashes are banned everywhere.** 8 of 27 en dashes were changed to hyphens and none went the other way. Updated in TONE AND STYLE, the `title` rule and its example, and the JSON `title` string.
- **New KNOWN ORGANISATION NAMES section.**
  - Why: PACT India, ICRC, AKRSP (2 posts) and The/Nudge's tag were changed to existing Strapi entries the model could not have guessed.
  - `companyName` checks the list first. The v5 "no added abbreviation" rule stays as the default for other organisations. It is no longer absolute, because ICRC and PACT India need one.
  - The title org name and `## heading` use the public name without a bracketed abbreviation, because ICRC and PACT kept their plain names in the title.
  - `categories` step 1 allows a listed tag.
  - The 23 names published as written in this batch are listed, plus the v4-batch names, so the model stops flagging them.

**Changed (moderate evidence):**
- **New `metaDescription` entry in SHORT FIELD FORMATS**, and the JSON string now points to it:
  - Open with "[Org] is hiring". 3 of 4 "seeks" became "hiring".
  - Write the org as in the title, not an acronym. NHSRC and ICRC were changed. PHFI kept its acronym because the full name doesn't fit in 160 characters.
  - Use "&" and drop filler words to make room.
  - Spell out abbreviated role names (ETASHA "BFSI").
- **Roles across several districts in one state use the state in the title and metaTitle.** Both Samaj Pragati Sahayog posts went from "Dewas & Khargone" to "Madhya Pradesh". The " & " rule now applies only to cities in different states, which matches its original examples (Ramanagara & Medchal, Mumbai/Delhi).
- **New `metaTitle` entry with an order for fitting it into 60 characters:** acronym, then a shorter role, then drop "Jobs", then a state short form. Based on the SPS "MP Jobs" edits, the AKRSP rewrites, and the acronym metaTitles that were accepted (NHSRC, ICRC, PHFI, SKECT, NCF).

**Changed (weak evidence, kept small):**
- Spell out an abbreviation the first time it appears in the body. Evidence: ETASHA "BFSI (Banking, Financial Services, and Insurance) Trainer". The drafts already did this for MIS, DISCOMs and SEL, so the risk is low.

**Deliberately unchanged:**
- `## Apply` copy, Requirements, `salary`, `excerpt` and the "This role sits within…" rule: 0 edits in 40.
- Responsibilities (6-8 merged bullets): 1 edit, where ICRC was expanded to the full 25-item source list. One case against 39.
- `requirementChecklist`: 1 edit (Azim Premji Chennai merged Tamil and English). PACT and Dream a Dream kept their languages split.
- `keywords`, `skills`, `impactArea`, `location`, `experienceLevel`, `jobType`, Fresher: 0 edits.
- Single small towns in titles (Paderu kept its town) and foreign-currency conversion: still mixed, or no cases.
- One deleted Benefits bullet (Pallium) and "day-to-day" changed to "day to day" (Wipro): one case each.

**Needs code, not the prompt:**
- Closing dates missing from the source (3 ATREE posts) and one moved deadline (PHFI) each needed a hand edit to the metaDescription ending, and PHFI's still says "Apply by 7 Nov". Building the ending from `closingDate` at push time would fix both.
- KNOWN ORGANISATION NAMES is a stopgap. Passing the existing Strapi company and category names into the prompt, or applying the top `findSimilarCompanies` match automatically, would replace it.
