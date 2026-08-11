I read the current prompt file, `job-prompt.v2.md` (which sets the house format for this kind of revision), and `promptLoader.js` — the revised file below is a drop-in replacement for `prompts/company-prompt.v1.md`, with the `<!-- PROMPT_START -->` / `<!-- PROMPT_END -->` markers the loader needs.

## Pattern Analysis

**Caveat first: this is two examples, one operator.** Any pattern that shows up once is a hint, not a finding. I've marked which is which. The two pairs are also very different organisations (a think tank and a CSR agency), which helps — a pattern that repeats across both is more credible than the raw count suggests.

**The short JSON fields are almost perfect.** `name`, `website`, `industry`, `excerpt`, `metaTitle` and `size` were published untouched in both. Only two metadata edits happened at all. First, `location`: the draft filled in "Bengaluru, Karnataka, India" and the operator blanked the field, then wrote the same fact into the description body as a blockquote (`>Headquaters: Bengaluru, Karnataka, India`) directly under the logo image. The other company had no location either way. So it looks like the Company `location` field simply isn't used, and headquarters belongs in the body — but that's one deletion, so it's the weakest instruction in my revision. Second, `metaDescription` for Synergie was rewritten to swap "and" for "&", drop "since 2009", and end with "Explore jobs on aikyamjobs". The other one was kept verbatim, so on this data alone it's 1 of 2 — but it matches the "Apply now" CTA convention the job prompt found in ~28 of 30, which makes me fairly confident it's a house rule rather than a one-off.

**The real problem is the description body, and it's structural.** The current prompt explicitly says "write this as one flowing profile, not as a rigid section-by-section form." The operator rebuilt both drafts into exactly the rigid section-by-section form the prompt forbids, and used the same skeleton for both: opening paragraph (kept verbatim in both — the draft's best work), logo image, HQ blockquote, `### Major Areas of Work` as `- Label: sentence` bullets, `### Major Initiatives and Programmes` as `- Name: sentence` bullets, `**Impact**` as a bold label with a paragraph under it, `**Leadership**` as a bold label with `- Name, Title` bullets, then the closing "why work here" paragraph. Note that Impact and Leadership are bold labels, not `###` headings, in both. The prose facts the draft wrote were mostly correct; they were being re-cut into bullets by hand.

**Leadership is the field that gets thrown away and rewritten from scratch.** The draft wrote biography paragraphs — degrees, prior employers, book titles, accreditations — and for Takshashila it hedged in the body: "Their specific titles are not stated on the source page." The operator deleted all of it and wrote four bullets of name and job title, including the exact titles the draft claimed weren't available (Co-Founder and Director, COO, Deputy Director). The draft had also picked people by how often their names appeared in research output rather than by who runs the organisation, so two of its four names weren't officers at all. Same story on Synergie: two dense founder-bio paragraphs became two bullets.

**Two other deletions repeat.** The draft filled space with dated news — a March 2026 conference, a named NASA speaker at a roundtable, a Munich side event, a list of recent papers — and all of it was cut; a company profile is evergreen, a job seeker reading it in six months doesn't want an events calendar. And the standalone "Partners on recent convenings: ..." line disappeared as its own section, folded into the Impact paragraph as one clause instead. On the flip side, the operator went *back to the source* for named programmes with concrete specs (GCPP as a 12-week programme, PGP as 48 weeks, OpenTakshashila; Synergie's Impact Assessment vertical, WASH partnerships, Tech for Good platform) — content the draft never surfaced. So the draft is over-reporting news and under-reporting the actual programme catalogue.

**One mechanical bug worth calling out.** The Synergie draft separated its paragraphs with a single newline, not a blank line, which in Markdown renders as one undifferentiated blob. The Takshashila draft used blank lines. The difference traces to the prompt's own "No blank-line padding between paragraphs" instruction, which reads as "don't use blank lines" — the operator added them back throughout. Finally, Impact numbers in the published text are attributed ("Synergie states it has...", "its own site cites...") and the operator openly reconciled two conflicting figures rather than picking one, which is the opposite of what the draft did.

---

## Revised Prompt

# Company Profile Prompt — v2

Supersedes company-prompt.v1. Revised against 2 real aiDraft/published pairs from
aikyamjobs.org (Aug 2026). Small sample: the description-structure changes below
repeat across both pairs and are solid; the `location` and `metaDescription`
changes rest on a single edit each and should be re-checked once more pairs exist.

Purpose is unchanged: called programmatically by the job-composer tool, output
split into a metadata block and a single Markdown block for the `description`
field.

Field mapping: Company has one long-form field (`description`) and several
short fields (`website`, `location`, `size`, `industry`, `excerpt`,
`metaTitle`, `metaDescription`). Everything narrative belongs inside the single
`description` Markdown block.

Operator note (not the model's job): the organisation's logo image is inserted by
hand directly under the opening paragraph. Do not emit an image or a placeholder.

---

## System instructions (given to Claude for every run)

<!-- PROMPT_START -->
You are formatting a company profile for aikyamjobs.org, a curated job board
for the social impact / development sector in India.

You will be given a company's website URL, LinkedIn page, or pasted text about
them. Produce output for TWO destinations:

1. A JSON metadata block — short, discrete fields.
2. A Markdown block — the full company profile narrative. This is the ONLY
   place long-form text goes.

====================================================================
TONE AND STYLE
====================================================================
- Factual, neutral, direct, no-fluff. Simple language. No em dashes (—).
- Separate every paragraph, heading and bullet list with one blank line. This is
  required for the CMS to render them correctly. Do not run paragraphs together
  with single line breaks. "No padding" means no filler text, not no blank lines.
- No horizontal rules between sections.
- Never write about the source document inside the profile. No "the source does
  not state", "their titles are not listed on the page", "no partners were
  named". If a fact is missing, look for it elsewhere on the organisation's site
  (About, Team, Leadership, Annual Report pages) or leave it out silently.
- Keep the profile evergreen. Do not include dated news items: upcoming
  conferences, one-off roundtables, named guest speakers, recent article titles,
  or "in March 2026" events. A job seeker may read this a year from now.

====================================================================
SOURCE FIDELITY
====================================================================
- Only include a section if there's real, specific content for it — do not pad
  with generic filler. Skip the Impact block entirely if the source gives you no
  specific numbers or outcomes.
- Attribute impact numbers to the organisation: "X states it has reached...",
  "its own site cites...". Do not assert them as verified fact.
- If the source gives two conflicting figures, report both with their sources
  rather than silently picking one.
- List any field in `reviewFlags` where you made a judgment call (e.g.
  "industry" if it wasn't explicitly stated, "size" if estimated) rather than
  reading it directly from the source. Entries must be field names from the JSON
  block below and nothing else — not section names, not prose.

====================================================================
SHORT FIELD NOTES
====================================================================
location:
  Leave this null. Headquarters goes in the description body as a blockquote
  line, not in this field.

size:
  Only if explicitly stated. Do not estimate from staff-page headcounts.

metaDescription:
  Max 160 characters. Use "&" rather than "and" to save space. Drop founding
  years and other detail that doesn't help a searcher. Must end with
  "Explore jobs on aikyamjobs".

====================================================================
OUTPUT FORMAT — produce exactly these two fenced blocks, nothing before or after
====================================================================

```json
{
  "name": "string",
  "website": "string or null",
  "location": null,
  "size": "string or null, e.g. '50-200 employees', only if stated or clearly listed",
  "industry": "string",
  "excerpt": "string, short, for the company card/listing",
  "metaTitle": "string, max 60 characters",
  "metaDescription": "string, max 160 characters, ending 'Explore jobs on aikyamjobs'",
  "reviewFlags": ["... field names only, no prose"]
}
```

```markdown
[Full company profile goes here, and ONLY here. Use this exact structure:

An opening paragraph, 4-6 sentences: what the organisation is, what it stands
for, and how it describes its own approach. No heading above it.

>Headquarters: City, State, India
(One blockquote line, only if a headquarters is stated. Omit the line entirely
if it isn't.)

### Major Areas of Work

- 4-5 bullets, each written as "Label: one sentence of what the work covers."
  These are thematic domains, not individual projects.

### Major Initiatives and Programmes

- 4-5 bullets, each written as "Programme name: one sentence describing it."
  Use the organisation's own names for its programmes and include concrete specs
  where stated (duration, certification, who it serves). Look through the site's
  programme, course and work pages for these; do not settle for the summary on
  the homepage.

If one programme is clearly the flagship and needs more than a bullet, add a
short paragraph after the list explaining it.

**Impact**

One short paragraph. Specific reach numbers attributed to the organisation, plus
notable partners named in the same paragraph as a clause ("maintains partnerships
with X, Y and Z"). Do not give partners their own section or their own line. Omit
this whole block if there is nothing specific to say.

**Leadership**
- Name, Title
- Name, Title
- 2-4 bullets, name and current role only. No biographies, no degrees, no prior
  employers, no book titles. List the people who actually run the organisation
  (founders, directors, C-level, deputy directors), not the people whose names
  appear most often in its publications. Find titles on the About, Team or
  Leadership page.

A closing paragraph: why someone would want to work there — the nature of the
work, what exposure it gives, who it suits. No heading above it.]
```
<!-- PROMPT_END -->

## Example of a published company profile for style reference
https://aikyamjobs.org/companies/a-pag-air-pollution-action-group

---

## Changelog vs. company-prompt.v1

- **Reversed the "one flowing profile" instruction into a fixed skeleton.** v1 said "write this as one flowing profile, not as a rigid section-by-section form"; the operator rebuilt both drafts into the identical rigid form. The Markdown block now specifies that exact skeleton: opening paragraph, HQ blockquote, `### Major Areas of Work`, `### Major Initiatives and Programmes`, `**Impact**`, `**Leadership**`, closing paragraph. Impact and Leadership are bold labels rather than `###` headings, matching both published records.
- **Areas of Work and Initiatives are now bulleted, not prose.** Both drafts wrote these as flowing paragraphs and both were re-cut by hand into `- Label: sentence` bullets.
- **Leadership rewritten as name-and-title bullets only.** This is the single most-edited part of the body. Both drafts wrote biography paragraphs (degrees, prior employers, books) and all of it was deleted. Added the instruction to look for titles on the About/Team page, because the Takshashila draft wrote "their specific titles are not stated" while the operator found four titles; and the instruction to list actual officers, because that draft ranked people by publication frequency and named two who hold no leadership role.
- **Banned commentary about the source, in the same terms as job-prompt.v2.** The "not stated on the source page" hedge was deleted from the body.
- **Banned dated news items.** A March 2026 conference, a named NASA speaker, a Munich side event and a list of recent papers were all cut. A company profile is read months after it is written.
- **Partners demoted from a section to a clause inside Impact.** The draft's standalone "Partners on recent convenings: ..." line was removed and the partners reappeared as one clause in the operator's Impact paragraph.
- **Impact numbers must be attributed, and conflicts reported.** The published Synergie text says "Synergie states it has directly impacted over 40 lakh" and "its own site cites a broader reach of over 22 lakh" — two conflicting figures kept side by side with attribution, where the draft asserted one figure flatly.
- **Programme discovery strengthened.** The operator added named programmes with concrete specs (GCPP 12 weeks, PGP 48 weeks, OpenTakshashila, Synergie's Impact Assessment vertical, WASH partnerships, Tech for Good platform) that neither draft found. Added an instruction to search the site's programme pages rather than summarising the homepage.
- **Fixed the blank-line bug.** v1's "No blank-line padding between paragraphs" caused the Synergie draft to join every paragraph with a single newline, which renders as one blob; the operator re-inserted blank lines throughout. Reworded to require one blank line between blocks.
- **`location` is now always null,** with headquarters written into the body as a `>Headquarters: ...` blockquote under the opening paragraph. **Based on a single edit** — the one draft that filled the field had it blanked and the fact moved into the body. Worth re-checking against the next batch.
- **`metaDescription` must end "Explore jobs on aikyamjobs"** and use "&" for "and". Changed in 1 of 2 here, but it mirrors the "Apply now" CTA rule that held in ~28 of 30 job pairs.
- **`reviewFlags` restricted to field names.** One draft flagged "leadership", which is not a JSON field. (Both published records have no `reviewFlags` at all — that is the review pipeline stripping them before save, not a signal about their content.)
- **Left unchanged:** the two-fence output contract, `name`, `website`, `industry`, `excerpt`, `metaTitle`, `size`, the tone rules, the em-dash ban, the "only include a section if there's real content" rule, and the closing "why work there" paragraph — all published untouched or near-untouched in both pairs. The opening paragraph was published verbatim in both and is the draft's strongest output; I have not touched its instructions. One thing I noticed but did not act on: the operator's own prose drops hyphens from compound modifiers ("on ground projects", "real time updates", "15 plus years") while leaving the draft's hyphenated words alone, so it reads as personal habit rather than a house rule.

Want me to save this as `prompts/company-prompt.v2.md` and point the loader at it, or leave v1 active until more pairs come in?
