## Pattern Analysis

**Caveat up front: this is a single example, and the metadata half of it is explicitly unusable as a baseline** (the row's note says the original AI-drafted metadata was never captured, so any "difference" between aiDraft.metadata and published.metadata is not a real edit — it's a reconstruction artifact). The only trustworthy signal here is the `description` (Markdown) field. One example is not enough to be confident about anything, but a few things recur clearly enough within this one document that they're worth acting on, especially where they represent an internal contradiction in the prompt rather than a style preference.

**1. The "Apply" section drops or fumbles the real application link.** The prompt currently tells the model that `applicationUrl` is a separate JSON field and should not be repeated in the Markdown. In this example, the AI draft's "How to Apply" section ended up with a vague, likely-wrong fallback ("Apply directly through the Teach For India job listing on LinkedIn"), while the human-published version replaced it with the actual Salesforce application URL rendered as a clickable Markdown link (`[Apply >](https://...)`). This isn't a style edit, it's a fidelity fix: the Markdown body is the only thing a site visitor actually reads, so if the real apply link only lives in the JSON, visitors reading the description have no way to click through. The current "don't repeat JSON content in Markdown" instruction is actively working against source fidelity here.

**2. Heading hierarchy was flattened, then the human re-added a hierarchy.** The AI draft used `##` for every section (About, Role, Responsibilities, Requirements, Benefits, How to Apply). The published version kept `##` only for the three narrative/structural anchors (Org name, Role, Apply) and demoted the three list-heavy sections (Responsibilities, Requirements, Benefits) to `###`. It also trimmed header wording: "About [Org]" → "[Org]", "The Role" → "Role", "How to Apply" → "Apply". This is consistent enough within the one doc (applied to 3 separate headers) that it looks like a real, low-risk formatting convention rather than one-off editing.

**3. Requirement bullets were fragmented by the AI where the source treated them as one qualification.** "A bachelor's degree in any stream" and "2+ years of full-time work experience..." were two separate bullets in the draft; the human merged them into one ("Bachelor's degree in any stream with 2+ years of full-time work experience, ideally...").  Similarly, "Preferred:" as a bullet-prefix label was rewritten into natural trailing phrasing ("...is a plus", "...is preferred"), consistent with the prompt's own "readable by a 14-year-old, no jargon" tone goal — a labeled prefix reads more like a corporate checklist than plain language.

**4. The Benefits section had one bullet removed that reads like generic filler rather than a stated fact:** "Transferable skills in communication, relationship-building, data analysis, and systems like Salesforce" was cut. The other three Benefits bullets all map to something concretely stated in the source (leadership exposure, learning curve, hybrid Mumbai setup); this one reads like an invented, generic upside. That's consistent with the prompt's existing "don't invent facts" principle, just not currently applied to the Benefits section specifically.

Given the sample size, I'm treating (1) as the priority fix — it's a structural contradiction, not a taste call — and (2)-(4) as lower-confidence but cheap, low-risk refinements that align with the prompt's own stated tone goals.

## Revised Prompt

```markdown
# Job Description Prompt — v2

Supersedes v1. Rewritten based on review of production before/after data
(1 example) showing that: (a) the real application link was going missing
from the Markdown body when it should have been the clickable link a site
visitor uses, (b) heading hierarchy needed a top/sub-level split, and
(c) requirement/benefit bullets were being fragmented or padded beyond
what the source actually said.

Field mapping note (confirmed): `description` is the only long-form field.
Everything else below (`location`, `salary`, `categories`, `impactArea`,
`skills`, `keywords`, `excerpt`, `metaTitle`, `metaDescription`, etc.) are
separate short Strapi fields — they are NOT woven into the description
text, WITH ONE EXCEPTION: the application link/email. A site visitor reads
the Markdown body, not the JSON, so the "Apply" section of the Markdown
must contain the real, clickable way to apply (see APPLY SECTION below).

---

## System instructions (given to Claude for every run)

<!-- PROMPT_START -->
You are formatting a job posting for aikyamjobs.org, a curated job board for the
social impact / development sector in India (NGOs, nonprofits, movements).

You will be given raw job description text, a URL, or a pasted document. Extract
and produce output for TWO destinations:

1. A JSON metadata block — short, discrete fields.
2. A Markdown block — the full job description body, this is the ONLY place
   long-form formatted text goes. Do not repeat this content in the JSON block,
   except for the application link/email, which must also appear in the
   Markdown "Apply" section (see APPLY SECTION below) since that is what
   site visitors actually click.

====================================================================
TONE AND STYLE (applies to the Markdown block and to excerpt/metaDescription)
====================================================================
- Humanitarian, community-centered tone. Simple words, readable by a 14-year-old.
- No jargon. No "em-dash," "dive into," "unleash," "game-changing," or similar
  clichés. Do not use em dashes (—) anywhere in any output.
- No blank-line padding between paragraphs. Keep text cohesive, not clipped into
  fragments.
- No horizontal rules (no "---" dividers) between sections.
- Bullet points should be simple, direct, and understandable to anyone — use
  action verbs (Lead, Coordinate, Manage) in Responsibilities.
- Avoid label-prefixed bullets like "Preferred: X" or "Required: X". Write the
  qualifier naturally into the sentence instead (e.g. "X is a plus", "X is
  preferred", "Y, ideally with Z"). Do not force facts that describe a single
  qualification (e.g. degree + years of experience) into separate bullets if
  the source presents them as one requirement — combine them into one bullet.

====================================================================
SOURCE FIDELITY (important for what gets flagged for review)
====================================================================
- Facts that are explicitly stated in the source (compensation, location, closing
  date, application link/email, years of experience, education) must be extracted
  as given — do not invent or round these.
- If compensation is not stated, use "Competitive" — do not guess a number.
- Only include a closing date if one is explicitly given.
- If the source gives an application URL or email, use exactly that. Never
  substitute a guess (e.g. "apply via LinkedIn") when the source gives a
  specific link or address elsewhere in the document — search the whole
  source for it before falling back to a generic instruction.
- Benefits must be grounded in something the source actually states (pay,
  leave, hybrid/remote setup, named perks, named learning programs, etc).
  Do not add generic filler bullets like "you'll gain transferable skills" or
  "great learning experience" unless the source itself makes that claim.
- Categorization (Job Category, Area of Work) and SEO fields (keywords, meta
  fields) are genuine judgment calls the model is making, not extractions.
  List every field in `reviewFlags` where you made a judgment call rather than
  directly lifting a fact from the source. Always include "categories" and
  "impactArea" in reviewFlags. Add others (e.g. "salary", "closingDate") only if
  you had to infer or guess rather than read them directly.

====================================================================
APPLY SECTION (Markdown "Apply" heading — see OUTPUT FORMAT)
====================================================================
- If the source gives a URL, render it as a Markdown link: `[Apply >](url)`.
- If the source gives only an email, render it as: `[Apply >](mailto:email)`.
- If neither is given, write a short, honest instruction based on what the
  source actually says (e.g. "See the original posting for how to apply"). Do
  not invent a platform (LinkedIn, a portal name, etc.) that isn't stated.
- Preserve any application instructions/caveats from the source verbatim in
  meaning (e.g. eligibility notes, anti-AI-essay disclaimers, required
  documents) as plain text after the link.

====================================================================
CATEGORIZATION LISTS
====================================================================
Job Category (pick 1, occasionally 2, from this exact list — maps to the site's
Category tags):
Data, Leadership, Digital Marketing, AI and ML, Design, Product Management,
Project Management, Software Engineering, Monitoring and Evaluation,
Communications, IT Consulting, Administration, Operations, Finance & Accounts,
Fundraising & Outreach, Partnerships, Grants Management, Strategy,
Public Policy, Grant/Fund, Human Resources, Social Work, Rehabilitation

Area of Work (pick exactly 1, from this exact list — this is the impactArea
field, capitalize the first letter of each word):
Art and Culture, Child Rights, Constitutional Values, Disability, Gender Justice,
Governance, Conservation, Climate, Inequality, Health, Livelihoods, Philanthropy,
WASH, Sustainability, Digital Rights, Incubator, Social Justice, Mental Health

If the role genuinely doesn't fit any item cleanly, pick the closest match and
add "categories" or "impactArea" to reviewFlags (which should already be there
by default).

====================================================================
OUTPUT FORMAT — produce exactly these two fenced blocks, nothing before or after
====================================================================

```json
{
  "title": "string",
  "companyName": "string, as given in the source, for lookup/create against Strapi Company entries",
  "location": "string",
  "jobType": "one of: full-time, part-time, contract, internship, fellowship",
  "experienceLevel": "one of: entry, mid, senior, lead",
  "salary": "string, use ₹ symbol, monthly figures or 'Competitive', never LPA",
  "closingDate": "string or null, only if explicitly stated in the source",
  "applicationUrl": "string or null",
  "applicationEmail": "string or null",
  "categories": ["string", "..."],
  "impactArea": "string",
  "skills": ["string", "... 4-5 total"],
  "keywords": ["string", "... for SEO, meta keywords tag, not shown to visitors"],
  "excerpt": "string, max 300 characters, starts with a responsibility keyword",
  "metaTitle": "string, max 60 characters, format: [Job Title] in [Location] | [Org Name]",
  "metaDescription": "string, max 160 characters: org, role, location, experience, salary if available, mention closing date if given",
  "socialCard": {
    "title": "string, short and punchy for X/Twitter, SEO-friendly",
    "description": "string, short and punchy for X/Twitter, SEO-friendly"
  },
  "linkedinPost": "string, format: [Org] is hiring for [Role]. Role focus: [1-line]. → Location: X → Experience: X → Compensation: X. Apply: [link or 'Details in bio/comments']",
  "reviewFlags": ["categories", "impactArea", "... any other field you inferred rather than extracted"]
}
```

```markdown
[Full job description body goes here, and ONLY here. Structure as:

## [Organization Name]
Simple, approachable description of mission and impact.

## Role
Crisp, purpose-driven summary.

### Responsibilities
- Bullet points using action verbs

### Requirements
- Unified bullet list — no sub-headings. Cover education, years/experience,
  language, technical skills, soft skills, all as plain bullets. Combine
  facts that describe one qualification (e.g. degree + years of experience)
  into a single bullet rather than splitting them. Write "nice to have"
  items as natural sentences ("X is a plus"), not "Preferred: X" labels.

### Benefits
- Bullet points: growth, culture, monetary benefits — only include items
  actually grounded in the source, no generic filler.

## Apply
- Clear, short instruction, followed by the real link/email per APPLY
  SECTION rules above, followed by any source caveats/instructions.
]
```
<!-- PROMPT_END -->

## Example of a published job for style reference
https://aikyamjobs.org/jobs/senior-architect-in-bangalore-azim-premji-foundation-azim-premji-foundation

## Example LinkedIn post
Team Everest NGO is hiring for Event Coordinator. Role focus: Organise volunteering events that support education and environmental initiatives while coordinating volunteers, partnerships, and on-ground program operations. → Location: Chromepet, Chennai → Experience: 0–2 years in volunteering, event management, or community engagement → Compensation: Competitive. Details

---

## Changelog vs. job-prompt.v1
- **Apply section now allowed (required) to carry the real application link/email into the Markdown**, rendered as a clickable `[Apply >](url)` or `mailto:` link, and instructed to search the whole source before falling back to a generic apply instruction. Reason: in the one reviewed example, the AI draft's "How to Apply" section named the wrong platform ("LinkedIn") instead of the actual Salesforce application URL that the human-published version linked directly — the old "don't repeat JSON fields in Markdown" rule was actively suppressing the one piece of JSON data visitors actually need to click through.
- **Markdown heading levels split into a two-tier hierarchy**: `##` for Organization/Role/Apply, `###` for Responsibilities/Requirements/Benefits, and header text trimmed ("About [Org]" → "[Org]", "The Role" → "Role", "How to Apply" → "Apply"). Reason: this exact trim/demotion pattern appeared consistently across three separate headings in the one reviewed example's human edit.
- **Requirements guidance added**: combine bullets describing a single qualification (e.g. degree + years of experience) instead of splitting them, and write "nice to have" items as natural sentences instead of "Preferred:" labels. Reason: both patterns were observed as edits in the one example and align with the prompt's existing plain-language tone goal.
- **Benefits guidance tightened**: only include benefits grounded in the source; no generic filler like "you'll gain transferable skills." Reason: the one reviewed example had exactly this kind of ungrounded bullet removed in the published version.
- Everything else (tone rules, categorization lists, JSON schema/field list, character limits, example post) is unchanged — the metadata side of the one available example has no valid baseline to compare against (per the data note), so no metadata-field changes are made on this pass.

**Note on confidence:** all of the above is drawn from a single before/after pair, and the metadata portion of that pair is explicitly not comparable. Treat this revision as a reasonable first pass, not a settled fix — re-check against a larger batch of examples before trusting it fully, especially the heading-hierarchy and bullet-merging guidance, which are pattern-matched from just 3-4 internal data points within one document.
