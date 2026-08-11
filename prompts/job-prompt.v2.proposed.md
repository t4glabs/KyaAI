## Pattern Analysis

**Caveat first:** 30 examples, one operator, a short window, and a skewed sample — 4 Takshashila course listings, 2 CRY roles, 2 SELCO, 2 The Circle. So "always" below means "in every case I can see," not a statistically settled fact. The strongest signals are the ones that repeat across *different* organisations; I've flagged the weaker ones as tentative.

**The single biggest failure is `applicationUrl`.** In 14 of 30 the AI returned `null` or a generic careers homepage, and in every one of those the human found and pasted the exact posting URL (Greenhouse, Workday, Zoho Recruit, iCIMS, Google Forms, the org's own job page). Worse, when the AI had no link it *invented* apply instructions — "apply through the careers page where you found this listing", "applications are reviewed on a rolling basis, so apply early". The human deleted every one of those lines. This is the field that costs the most manual work and the only one where the AI is actively producing text that gets thrown away.

**Formatting of short fields is mechanically rewritten, the same way, every time.** `title` goes from a bare role name to `[Role] in [City] | [Org]`, with `| ₹X LPA` appended when a monthly figure exists (₹33k–41k became "₹4-5 LPA", ₹60k became "₹7.2 LPA"). `closingDate` goes from prose ("20 August 2026, 11:59 PM IST") to an ISO timestamp. `location` gets normalised to "City, State" — parentheticals, slashes and vague values like "India", "India (multiple states)" and "Hybrid, India" are all replaced, sometimes with a city the AI never mentioned. `companyName` gets the org's registered name ("CRY" → "Child Rights and You - CRY", "WJCF" → "The Clinton Health Access Initiative (CHAI)"), and the leading "The" is dropped from Takshashila. `metaDescription` is rewritten in ~28 of 30 to end with "Apply now" or "Apply by 26 Aug" and to compress units ("2-4 yrs exp", "₹79k-₹100k/m", "₹9.5-12 LPA"). `excerpt` is cut, nearly always by deleting the AI's last sentence — the one repeating experience and salary — down to roughly 150–200 characters.

**`categories` is not the enum the prompt thinks it is.** The published value is a tag bag: the organisation's name, one or two function tags, the job type ("Full Time", "Contract", "Fellowship", "Internship"), often "Fresher", and the state or city (or "Remote"/"Hybrid"). The AI's clean 2-item list is discarded and rebuilt in 28 of 30. The list also has one wrong spelling — the site uses "Monitoring & Evaluation", not "Monitoring and Evaluation". `impactArea` is likewise not a closed list: in about 12 of 30 the human replaced the enum pick with free descriptive text ("School Governance & Education Policy Reform", "Tuberculosis Prevention And Care", "Digital Inclusion, NGO Technology"). It survived unchanged when the enum genuinely fit (Child Rights, Health, Conservation, Livelihoods, Disability) and was replaced when the AI stretched — "Inequality" for two education organisations was rejected both times. `keywords` are kept and then have a location term appended ("Bangalore Jobs", "Patna jobs", "Chhattisgarh jobs", "Remote", "Fresher") in about 25 of 30. `skills` are the AI's best field — copied verbatim almost every time, except where a comma inside a skill string ("Data analysis (R, Power BI, Tableau)") got split into three broken entries by the CMS.

**The description body is restructured identically each time.** "## About [Org]" → "## [Org]"; "## The Role" → "## Role"; Responsibilities/Requirements/Benefits demoted from `##` to `###`. A logo image is inserted right after the opening paragraph in all 29 edited examples — the AI can't supply that, but the tool should expect it. "## How to Apply" with its bullet list is replaced by "## Apply" with one sentence, a markdown link (`[Apply]`, `[Form]`, or `Email: x@y.org`), and a WhatsApp channel line that appears in 29 of 30. Long bullet lists get cut: Quest Alliance went from 28 responsibilities to 10, LLF from 23 to 12. For the course-style listings (Takshashila ×4), the fee, dates and weekly commitment were moved out of Benefits and How-to-Apply into Requirements, and `salary` was set to **null** — the AI had put the participant's ₹42,000 fee in the salary field all four times, which is the one substantive factual error in the set. Two smaller things: the AI's editorial notes about source contradictions ("the job listing header states 4-5 years", "the source states this position depends on the project being commissioned") were deleted from the body, and it stuffed prose sentences into `reviewFlags` where field names belong. `socialCard` and `linkedinPost` appear in no published record at all, so I can't tell whether they're used off-platform or discarded — I've left them in place rather than guess.

---

## Revised Prompt

# Job Description Prompt — v2

Supersedes job-prompt.v1. Revised against 30 real aiDraft/published pairs from aikyamjobs.org (Aug 2026). Purpose is unchanged:
- Be called programmatically (`claude -p`) by the job-composer tool, not pasted into Claude.ai chat by hand.
- Produce output split into a machine-readable metadata block and a single clean Markdown block for the `description` field — the one field that gets pasted into Strapi's rich-text (Markdown) editor.
- Flag which fields were inferred/guessed vs. lifted directly from the source, so the review screen can point Greeshma at the parts that actually need a human decision.

Field mapping note (confirmed): `description` is the only long-form field. Everything else below (`location`, `salary`, `categories`, `impactArea`, `skills`, `keywords`, `excerpt`, `metaTitle`, `metaDescription`, etc.) are separate short Strapi fields — they are NOT woven into the description text. Treat them as independent outputs.

Operator note (not the model's job): the organisation's logo image is inserted by hand directly under the opening paragraph of the description. Do not emit an image or a placeholder for it.

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
- No jargon. No "dive into," "unleash," "game-changing," or similar clichés. Do
  not use em dashes (—) anywhere in any output. An en dash (–) is allowed only
  inside the `title` field, as a separator between a role and its qualifier.
- No blank-line padding between paragraphs. Keep text cohesive, not clipped into
  fragments.
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
- Only include a closing date if one is explicitly given.
- `applicationUrl` matters more than any other extracted field. Find the exact URL
  of this specific job posting — the Greenhouse / Workday / Zoho Recruit / iCIMS /
  Google Form / careers-page permalink. If the source is a URL, that URL is
  usually the answer. Do not substitute an organisation's careers homepage for the
  posting link. If you genuinely cannot find a posting URL and there is no
  application email either, set both to null and put "applicationUrl" in
  `reviewFlags` — a human must find it before this can be published.
- Categorization (`categories`, `impactArea`) and SEO fields (keywords, meta
  fields) are genuine judgment calls the model is making, not extractions.
  List every field in `reviewFlags` where you made a judgment call rather than
  directly lifting a fact from the source. Always include "categories" and
  "impactArea" in reviewFlags. Add others (e.g. "salary", "closingDate",
  "applicationUrl") only if you had to infer, guess, or could not find them.
- `reviewFlags` entries must be field names from the JSON block and nothing else.
  Explanations, conflicts and caveats go in `reviewNotes` as plain prose.

====================================================================
SHORT FIELD FORMATS (these are rewritten by hand when you get them wrong)
====================================================================
title:
  Format: [Role] in [City] | [Org Name]
  If a monthly salary figure is given, append the annualised figure:
  [Role] in [City] | [Org Name] | ₹X LPA
  (₹33,000-41,000/month becomes "₹4-5 LPA"; ₹60,000/month becomes "₹7.2 LPA".)
  For a fully remote role use the role and org only, no city.
  Use an en dash for a role qualifier: "Manager – Programme in Bangalore | ...".

companyName:
  The organisation's full registered name as the org itself writes it, with the
  common abbreviation in the same string where one exists ("Child Rights and You
  - CRY", "The Clinton Health Access Initiative (CHAI)"). Drop a leading "The"
  unless it is part of the registered name. If the source names no organisation,
  identify it from the posting URL or content rather than writing "Not stated".

location:
  "City, State" — e.g. "Bengaluru, Karnataka", "Patna, Bihar", "Raipur,
  Chhattisgarh". No parentheticals, no slashes, no office-day notes, no "India"
  suffix. For several cities, separate with commas. For hybrid roles, give the
  primary city and put the hybrid arrangement in the Markdown body only. For fully
  remote roles or online programmes, `location` is exactly "Remote". Never output
  a vague value like "India", "India (multiple states)" or "Hybrid, India" — find
  the real base city in the source.

salary:
  "₹A - ₹B per month" or "₹A per month" or "Competitive" or null.
  Use a hyphen between figures, not the word "to". Monthly figures only, never LPA
  in this field (LPA belongs in `title`). Null for unpaid or fee-paying listings.

closingDate:
  ISO date only: "YYYY-MM-DD". Null if not explicitly stated.

experienceLevel:
  entry / mid / senior / lead. If the source states no minimum years, or says
  "freshers welcome", "0-1 year", or only requires a degree, the answer is
  "entry" — do not infer seniority from the salary figure.

====================================================================
CATEGORIZATION
====================================================================
`categories` is a tag bag, not a single classification. Build it in this order:
  1. The organisation's name, exactly as in `companyName`.
  2. One or two Job Category tags from the list below.
  3. The job type tag: "Full Time", "Contract", "Internship", or "Fellowship".
  4. "Fresher" — only if freshers or 0-1 year candidates are eligible.
  5. The state (or states) the role sits in: "Karnataka", "Maharashtra", "Delhi",
     "Tamil Nadu", "Assam". For remote or hybrid roles use "Remote" or "Hybrid"
     instead of a state.

Job Category (pick 1, occasionally 2, from this exact list — maps to the site's
Category tags):
Data, Leadership, Digital Marketing, AI and ML, Design, Product Management,
Project Management, Software Engineering, Monitoring & Evaluation,
Communications, IT Consulting, Administration, Operations, Finance & Accounts,
Fundraising & Outreach, Partnerships, Grants Management, Strategy,
Public Policy, Grant/Fund, Human Resources, Social Work, Rehabilitation

Area of Work (this is the `impactArea` field — one value, capitalize the first
letter of each word). Prefer an item from this vocabulary when one genuinely
fits:
Art and Culture, Child Rights, Constitutional Values, Disability, Gender Justice,
Governance, Conservation, Climate, Inequality, Health, Livelihoods, Philanthropy,
WASH, Sustainability, Digital Rights, Incubator, Social Justice, Mental Health,
Education

If no item fits without stretching, write a short descriptive phrase instead of
forcing a near-match — e.g. "School Governance & Education Policy Reform",
"Tuberculosis Prevention and Care", "Digital Inclusion, NGO Technology". Do not
use "Inequality" as a catch-all for education or fundraising roles. Either way,
"impactArea" stays in reviewFlags.

No commas inside any single string in `categories`, `skills`, or `keywords` —
the CMS splits on commas and a value like "Data analysis (R, Power BI, Tableau)"
becomes three broken tags. Write "Data analysis in R / Power BI / Tableau".

`keywords`: 8-12 entries. Include the specific search terms a candidate would
type, and always end with the location terms: "[City] Jobs" and "[State] Jobs",
or "Remote" and "Fresher" where those apply.

====================================================================
OUTPUT FORMAT — produce exactly these two fenced blocks, nothing before or after
====================================================================

```json
{
  "title": "string, format: [Role] in [City] | [Org] (| ₹X LPA if monthly pay given)",
  "companyName": "string, full registered name, for lookup/create against Strapi Company entries",
  "location": "string, 'City, State' or 'Remote'",
  "jobType": "one of: full-time, part-time, contract, internship, fellowship",
  "experienceLevel": "one of: entry, mid, senior, lead",
  "salary": "string, '₹A - ₹B per month' or 'Competitive', or null if unpaid/fee-paying. Never LPA here",
  "closingDate": "string YYYY-MM-DD or null, only if explicitly stated in the source",
  "applicationUrl": "string, the exact posting URL, or null",
  "applicationEmail": "string or null",
  "categories": ["Org Name", "Function tag", "Job type tag", "Fresher if applicable", "State or Remote"],
  "impactArea": "string, from the vocabulary or a short descriptive phrase",
  "skills": ["string", "... 4-5 total, no commas inside a string"],
  "keywords": ["string", "... 8-12, ending with '[City] Jobs' / '[State] Jobs'"],
  "excerpt": "string, max 200 characters, 1-2 sentences, starts with a responsibility verb. Do not repeat salary, years of experience, or the closing date",
  "metaTitle": "string, max 60 characters, format: [Role] at [Org] | [City] Jobs",
  "metaDescription": "string, max 160 characters: org, role, location, experience, salary in compressed form (₹50k/m, 2-4 yrs exp, ₹9.5-12 LPA). Must end with 'Apply now' or 'Apply by [D Mon]'",
  "socialCard": {
    "title": "string, short and punchy for X/Twitter, SEO-friendly",
    "description": "string, short and punchy for X/Twitter, SEO-friendly"
  },
  "linkedinPost": "string, format: [Org] is hiring for [Role]. Role focus: [1-line]. → Location: X → Experience: X → Compensation: X. Apply: [link or 'Details in bio/comments']",
  "reviewFlags": ["categories", "impactArea", "... field names only, no prose"],
  "reviewNotes": "string or null. Source conflicts, conditional postings, missing links — anything a human needs to know that must not appear in the description"
}
```

```markdown
[Full job description body goes here, and ONLY here. Structure as:

## [Organization Name]
Simple, approachable description of mission and impact, 3-5 sentences. End with
one sentence placing the role: "This role sits within [Org]'s [team/function],
which [what it does]." Leave a blank line after this paragraph.

## Role
Crisp, purpose-driven summary, one paragraph. Do not restate the salary, the
closing date, or the number of openings here.

### Responsibilities
- 8 to 12 bullet points using action verbs. If the source lists more, merge the
  overlapping ones and keep the substantive work. Do not pad to match the source.

### Requirements
- 8 to 14 bullets, one unified list, no sub-headings. Cover education,
  years/experience, language, technical skills, soft skills, all as plain bullets.
- For a course or fellowship listing, the programme fee, the cohort dates, the
  weekly time commitment, and any cost the participant bears go here.

### Benefits
- Bullet points: growth, culture, monetary benefits.

## Apply
One sentence, then the link, then the WhatsApp line. Use whichever applies:

  If there is an application URL:
  Interested candidates can apply through the link given below

  [Apply](URL)

  If the URL is a Google Form:
  Interested candidates can apply through the form given below

  [Form](URL)

  If it is an email:
  Interested candidates can send their updated resume to the mail below

  Email: address@org.org

If the source gives a required subject line or attachment, add it to that first
sentence. Then always close with exactly:

Follow our [WhatsApp Channel](https://whatsapp.com/channel/0029Vb8DvZ5CxoAsvj0Oie2C) to get notified about the latest jobs.
]
```
<!-- PROMPT_END -->

## Example of a published job for style reference
https://aikyamjobs.org/jobs/senior-architect-in-bangalore-azim-premji-foundation-azim-premji-foundation

## Example LinkedIn post
Team Everest NGO is hiring for Event Coordinator. Role focus: Organise volunteering events that support education and environmental initiatives while coordinating volunteers, partnerships, and on-ground program operations. → Location: Chromepet, Chennai → Experience: 0–2 years in volunteering, event management, or community engagement → Compensation: Competitive. Details

---

## Changelog vs. job-prompt.v1

- **`applicationUrl` promoted to the most important extraction.** In 14 of 30 pairs the draft returned null or a careers homepage and the human pasted the exact posting link. Added an explicit instruction to find the permalink, a ban on substituting the careers homepage, and a rule to flag it for review when missing.
- **Banned invented apply advice and source commentary.** Every "apply early", "reviewed on a rolling basis", "check the careers page", and every parenthetical about the source contradicting itself was deleted by the operator. Added `reviewNotes` as the place those observations go instead — this is the one addition to the output contract, made because the draft that found a real conflict (YRGCARE) had nowhere legitimate to put it and stuffed prose into `reviewFlags`.
- **`title` given an explicit formula** (`[Role] in [City] | [Org]`, plus `| ₹X LPA`). The draft's bare role name was rewritten in 29 of 30. The LPA suffix is derived from the monthly figure and is the only place LPA is allowed.
- **`salary` must be null for fee-paying programmes.** All four Takshashila course listings put the participant's ₹42,000 fee in `salary`; all four were nulled. Fee, dates and time commitment now go into Requirements, matching where the operator moved them.
- **`location` normalised to "City, State" or "Remote".** "India", "India (multiple states)", "Hybrid, India", "New Delhi / Bangalore / Mumbai (Hybrid)" and office-day parentheticals were all rewritten; two were replaced with a city the draft never named.
- **`closingDate` switched to ISO `YYYY-MM-DD`** — prose dates were converted every time.
- **`companyName` rule added**: registered name with abbreviation, drop leading "The", never "Not stated in source" (the Wildlife Trust of India draft left it blank and the human researched it).
- **`categories` redefined as a tag bag** (org, function, job type, Fresher, state) — the draft's clean 2-item list was rebuilt in 28 of 30. Corrected "Monitoring and Evaluation" to "Monitoring & Evaluation", which is the spelling the site actually uses.
- **`impactArea` opened up.** Roughly 12 of 30 were replaced with free descriptive text; the enum was only kept when it genuinely fit. Added "Education" to the vocabulary and banned "Inequality" as a catch-all, which was rejected twice.
- **Comma ban inside array strings.** "Data analysis (R, Power BI, Tableau)" and "Data collection, analysis and visualisation" were split into broken tags by the CMS — the only defects in `skills`, which is otherwise the draft's most reliable field.
- **`keywords` must end with location terms** ("Bangalore Jobs", "Patna jobs", "Remote", "Fresher") — appended by hand in ~25 of 30.
- **`excerpt` cut from 300 to 200 characters, 1-2 sentences**, with an explicit ban on repeating salary/experience/deadline — that trailing sentence was the thing the operator cut nearly every time.
- **`metaDescription` must end "Apply now" or "Apply by [date]"** and use compressed units — rewritten this way in ~28 of 30. **`metaTitle`** re-specified as `[Role] at [Org] | [City] Jobs`, the form the operator moved toward (weaker signal, about half the sample).
- **`experienceLevel` defaults to entry** when no years are stated. Two drafts inferred "mid" from a salary figure and were corrected to "entry".
- **Description headings changed to match published output**: `## [Org]` (not "About"), `## Role` (not "The Role"), and Responsibilities/Requirements/Benefits demoted to `###`. This was done in all 29 edited examples.
- **"How to Apply" replaced with "## Apply"** using the exact three templates (link / form / email) plus the WhatsApp channel line, which appears in 29 of 30 published descriptions and was added by hand each time.
- **Bullet caps added** (8-12 responsibilities, 8-14 requirements) — the operator cut Quest Alliance from 28 bullets to 10 and LLF from 23 to 12.
- **Added the "This role sits within..." closing sentence** to the org paragraph, which the operator wrote in for CRY, SELCO, Khan Academy, CSF, WRI and Peepul.
- **Left unchanged:** the two-fence output contract, `skills`, `socialCard`, `linkedinPost`, `jobType`, tone rules, and the example links. `socialCard` and `linkedinPost` appear in none of the 30 published records, so there is no evidence either way about whether they are used — I kept them rather than remove a field the operator may be using outside Strapi. The org logo image, added by hand under the first paragraph in all 29 edited examples, is deliberately not emitted; the model has no way to know the uploaded filename, and a placeholder risks shipping a broken image.
