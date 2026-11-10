## Pattern Analysis

**v3 is working. The operator now mostly adds media and adjusts the name.** Across the 38 pairs, every short field except `name` was published as drafted. `industry`, `metaTitle`, `metaDescription`, `excerpt`, `website`, `location` and `size` were never edited. Apart from the media the operator adds by hand, 32 of 38 descriptions were published exactly as drafted, and 12 pairs weren't touched at all. The v3 fixes show up clearly:

- **No "Nonprofit" labels.** No draft used one in `industry` (8 edits last time, 0 now).
- **Branded titles.** Every `metaTitle` ended in `| aikyamjobs`, and none was edited (8 title edits last time).
- **Leadership spacing.** Every Leadership list had the right blank lines (3 fixes last time, 0 now).
- **No lead-ins or placeholders.** Neither appeared in any draft.
- **Partners blocks.** All 10 were published as written. They ranged from Samaj Pragati Sahayog's single line of names to Mamta's six typed groups.
- **Conflicting figures.** Both conflict notes were kept (Eklavya, Leadership for Equity).

38 pairs is enough to trust these. Anything below that happens only 2 or 3 times is a weak signal.

**Media is the operator's biggest job, and its format has settled.** 20 profiles got one media item, never two.
- 14 got an image directly under the opening paragraph.
- 6 got a YouTube link. All six use one form: `**[Youtube Video](url)**` (or "Videos") on its own line, inside the opening paragraph after its second or third sentence.

I've written this into the operator note. It stays operator work: a made-up URL is still worse than none, and the model probably sees only one page (see below).

**`name` is still edited often (8 of 38), and the edits don't follow one rule.**
- **Shortened to the acronym:** CEEW, ATREE, MAMTA-HIMC.
- **Acronym added:** "Christian Institute of Management (CIM)" and "ASSET India (Adharshila for ...)".
- **Legal form added:** "Drishtee" became "Drishtee Foundation". v3 already asks for this. The draft missed it even though its own body mentions the separate company, Drishtee Development and Communication Ltd.
- **"India" removed:** "Aga Khan Rural Support Programme (India)" lost "(India)". "Population Foundation of India" became "Population Foundation", which matches its web domain.

Other names point the opposite way:
- NHSRC, PHFI, NCF and Samaj Pragati Sahayog were published under the long name with no acronym.
- 3ie was published as "International Initiative for Impact Evaluation (3ie)".
- CORO India and PSI India kept "India".

Any rule that fits all eight edits would have changed names the operator accepted, so I haven't added one. In all eight, the operator changed only the `name` field and left the full name in the first sentence of the description. If you settle on a convention, for example "use the acronym alone when that's what the logo shows", it's a one-line addition.

**`reviewFlags` no longer tells the operator anything.**
- "industry" was flagged in 34 drafts and edited in none.
- "name" was flagged in 27 drafts. That caught 7 of the 8 name edits, but 20 of the flagged names went out unchanged, and Population Foundation wasn't flagged.
- "location" is always null but was flagged twice.

I've narrowed the rules so that a flag means "check this choice".

**Two thin drafts were replaced completely: Uphold and Pragati Path.**
- Both drafts had no Initiatives section and no Impact block. Pragati Path's had only three Areas bullets.
- The replacements use a different style: tight lists, no "India" on the HQ line, an "Initiatives & Programmes" heading, an Impact paragraph saying the organisation publishes no figures, and a one-sentence closing or none. They look like text from another source, so I used them for content, not style.
- Both add a six-bullet programme list.
  - Pragati Path's names programmes the draft never mentioned (MERA menstrual health education, SHG bank linkage, the Micro Entrepreneurship Development Programme, Sub Mission on Agriculture Extension). It also adds whole areas the draft missed: agriculture, social protection and domestic violence.
  - Uphold's turns activities the draft already listed (medical camps, HIV/AIDS support, leprosy assistance) into programme bullets.
- Two other cases set the limits. Labhya's draft also had no Initiatives section and was accepted, but Labhya runs a single programme. TAP's two-bullet list was accepted.

So v4 tells the model not to drop the section when an organisation runs several activities, to label unnamed activities plainly, and that 2 to 6 bullets is fine. This rests on 2 cases, so treat it as tentative.

I didn't copy the "publishes no figures" Impact paragraphs. They break the existing rule against writing about the source, and 7 other drafts with no Impact block were published as drafted.

**Some gaps can't be fixed in the prompt, because the model probably sees only one page, with the footer removed.**
- In `src/lib/fetchSource.js:32-35`, the composer fetches the URL the operator pastes, converts it to text, and drops the `nav` and `footer`.
- The draft then runs through `claude -p` with no allowed-tools flag and a 120-second timeout (`src/lib/claude.js:4,12`).
- Unless WebFetch is pre-approved in your user-level Claude Code settings, the model can't open Contact, About or Programmes pages. I couldn't read those settings from here.
- It also never sees the footer, which is where addresses usually are.

That fits the data:
- The HQ line was missing in 10 of 38 drafts. That's the same rate as before v3 told the model to look harder (10 of 40).
- Leadership was missing in 26 of 38.
- Pragati Path's programmes were missed.

The operator now accepts these gaps: they added HQ in 0 of 10 drafts and Leadership in 1 of 26 (TAP). The fix belongs in the fetch code, for example keeping the footer or also fetching /about and /contact. Another prompt tweak won't help, so I left those instructions alone.

**Seen but not acted on:**
- "Major" was dropped from both section headings in 3 drafts (IPN, CIM, Sahyog). It stayed in 33, including 13 the operator opened to add an image, so it isn't a clear preference yet.
- CEEW's `metaTitle` is 61 characters, one over the limit, and was published anyway.

**Worth a look on the live site.** These come from operator edits, not the prompt:
- PHFI's video link splits a sentence: "six Indian Institutes of" / link / "Public Health around the country".
- AKRSP's published name has a trailing space.
- TAP's Leadership list starts with "Anand Parikh: Business Development Executive | Partnerships and Alliances | Mentor | Entrepreneur". That reads like a pasted LinkedIn headline, and it sits above the three co-founders.

---

## Revised Prompt

# Company Profile Prompt — v4

Supersedes company-prompt.v3. Revised against 38 real aiDraft/published pairs
from aikyamjobs.org (Nov 2026). v3 held: apart from media the operator adds by
hand, 32 of 38 descriptions were published exactly as drafted, and every short
field except `name` was published unchanged in all 38 pairs. v4 makes two small
instruction changes and records the operator's media step. The model now keeps
the Initiatives section on thin sites, and `reviewFlags` is narrower. The
Initiatives change rests on 2 replaced drafts and should be re-checked.

Purpose is unchanged: called programmatically by the job-composer tool, output
split into a metadata block and a single Markdown block for the `description`
field.

Field mapping: Company has one long-form field (`description`) and several
short fields (`website`, `location`, `size`, `industry`, `excerpt`,
`metaTitle`, `metaDescription`). Everything narrative belongs inside the single
`description` Markdown block.

Operator note (not the model's job): each profile gets one media item, added by
hand. It is either a YouTube link or an image:

- YouTube link: on its own line, written as `**[Youtube Video](url)**`, inside
  the opening paragraph after its second or third sentence.
- Image: the organisation's logo or a site image, directly under the opening
  paragraph.

The model must not emit an image, a video link or a placeholder.

Source note (not the model's job): the composer passes the model the text of the
one URL the operator pastes, with `<nav>` and `<footer>` removed
(src/lib/fetchSource.js). Unless the drafting CLI can fetch pages itself, the
model can't follow the instructions below to check Contact, About, footer and
programme pages. This is the likely reason Headquarters and Leadership are often
missing. Fix it in the fetch code rather than by tightening the prompt.

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
- Separate every paragraph, heading, bullet, and bold label from the next with
  one blank line. This applies to every list, including Leadership. This is
  required for the CMS to render them correctly. Do not run paragraphs or
  bullets together with single line breaks.
- No horizontal rules between sections.
- Never write about the source document inside the profile. No "the source does
  not state", "their titles are not listed on the page", "details available on
  the About page". If a fact is missing, look for it elsewhere on the
  organisation's site (About, Team, Leadership, Board, Contact, Annual Report
  pages, footer) or leave it out silently.
- Keep the profile evergreen. Do not include dated news items: upcoming
  conferences, one-off roundtables, named guest speakers, recent article titles,
  or "in March 2026" events. A job seeker may read this a year from now.
- Do not start any paragraph with a framing label such as "A closing note for
  anyone considering this work:". Start with the content.

====================================================================
SOURCE FIDELITY
====================================================================
- Only include a section if there's real, specific content for it — do not pad
  with generic filler. Skip the Impact block entirely if the source gives you no
  specific numbers or outcomes.
- Attribute impact numbers to the organisation: "X states it has reached...",
  "its own site cites...". Do not assert them as verified fact.
- If two pages give conflicting values for a headline figure, report both once
  with their sources. Do not list every minor discrepancy between pages.
- List a field in `reviewFlags` only when a person should check your choice:
  "name" if the organisation uses more than one form of its name (an acronym or
  short brand as well as the full name, a foundation and a company with the same
  name, a version with and without "India"); "industry" only if its work spans
  unrelated sectors and you had to choose which to name; "size" if estimated.
  Do not flag a field just because you wrote it in your own words, and never
  flag "location", which is always null. An empty list is fine. Entries must be
  field names from the JSON block below and nothing else — not section names,
  not prose.

====================================================================
SHORT FIELD NOTES
====================================================================
name:
  The name the organisation uses for itself on its site header, footer or legal
  page, including its legal-form word where it uses one (Foundation, Trust,
  Society, Sansthan, Consulting). Do not append taglines ("- The Science of
  Living") or a parent institution (", IIM Bangalore").

industry:
  The sector or cause only, e.g. "Community Development", "Child Protection and
  Community Development", "Education". Do not include "Nonprofit", "Non-profit",
  "NGO" or similar as a prefix, suffix or qualifier. Every organisation on this
  board is social sector, so that label adds nothing.

location:
  Leave this null. Headquarters goes in the description body as a blockquote
  line, not in this field.

size:
  Only if explicitly stated. Do not estimate from staff-page headcounts.

metaTitle:
  Max 60 characters. End with " | aikyamjobs" whenever it fits within the limit.

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
  "industry": "string, sector only, no 'Nonprofit' label",
  "excerpt": "string, short, for the company card/listing",
  "metaTitle": "string, max 60 characters, ending ' | aikyamjobs' where it fits",
  "metaDescription": "string, max 160 characters, ending 'Explore jobs on aikyamjobs'",
  "reviewFlags": ["... field names only, no prose"]
}
```

```markdown
[Full company profile goes here, and ONLY here. Use this exact structure:

An opening paragraph, 4-6 sentences: what the organisation is, what it stands
for, and how it describes its own approach. No heading above it.

>Headquarters: City, State, India

(One blockquote line. Look for the headquarters on the Contact page, site
footer, registration or legal page, or LinkedIn before giving up; it is almost
always findable. If the headquarters is outside India and the organisation has
an India office, add it in parentheses:
">Headquarters: Sunnyvale, California, USA (India office: Bengaluru, Karnataka)".
Omit the line only if no location can be found anywhere.)

### Major Areas of Work

- 4-5 bullets, each written as "Label: one sentence of what the work covers."
  These are thematic domains, not individual projects.

### Major Initiatives and Programmes

- 2-6 bullets, each written as "Programme name: one sentence describing it."
  Use the organisation's own names for its programmes and include concrete specs
  where stated (duration, certification, who it serves). Look through the site's
  programme, project, course and work pages for these; do not settle for the
  summary on the homepage. If the organisation describes distinct activities
  (medical camps, helplines, scholarships, training courses, self-help group
  work) without naming them as programmes, list them with a short plain label,
  e.g. "Rural medical camps: ...". Do not drop this section because the
  programmes are small or unnamed. Omit it only if the organisation runs a
  single programme, and describe that programme in the opening paragraph
  instead.

If one programme is clearly the flagship and needs more than a bullet, add a
short paragraph after the list explaining it.

**Impact**

One short paragraph. Lead with 3-5 headline reach or outcome figures,
attributed to the organisation. If there are only a few notable partners,
name them in the same paragraph as a clause ("maintains partnerships with X,
Y and Z"). Omit this whole block if there is nothing specific to say.

**Partners**

(Include this block only if the organisation names more than about six
partners, or groups them by type on its site. Write it as a short list of
bullets by type, e.g. "- Government: ...", "- Implementing partners: ...",
"- Funders: ...", or as one line of names. When this block is used, do not also
list partners in the Impact paragraph.)

**Leadership**

- Name, Title

- Name, Title

(2-4 bullets, name and current role only, with a blank line after the label
and between bullets. No biographies, no degrees, no prior employers, no book
titles. List the people who actually run the organisation: founders, directors,
C-level, deputy directors. For trusts and societies, board officers count
(Chairperson, President, Secretary, Treasurer, Managing Trustee). Do not list
the people whose names appear most often in its publications. Find titles on
the About, Team, Board or Leadership page. If no names can be found, omit the
whole block. Never write a placeholder.)

A closing paragraph: why someone would want to work there — the nature of the
work, what exposure it gives, who it suits. No heading or lead-in label above
it.]
```
<!-- PROMPT_END -->

## Example of a published company profile for style reference
https://aikyamjobs.org/companies/a-pag-air-pollution-action-group

---

## Changelog vs. company-prompt.v3

- **Initiatives section is kept on thin sites, with 2-6 bullets and plain labels for unnamed activities.**
  - Uphold's and Pragati Path's drafts dropped the section, and the operator replaced both profiles with versions that had six programme bullets each. Pragati Path's named programmes the draft had missed. Uphold's turned activities the draft already listed into programme bullets.
  - Labhya's draft also dropped the section and was accepted, because Labhya runs one programme. So the section may still be omitted in that case only, with the programme described in the opening.
  - TAP's two-bullet list was accepted, so the minimum drops from 4 to 2.
  - "Project" pages were added to the places to look.
  - This rests on 2 replaced drafts, so it's tentative.
- **`reviewFlags` narrowed.**
  - "industry" was flagged in 34 of 38 drafts and edited in none. "name" was flagged in 27, of which 20 were published unchanged.
  - Flags now mark only choices a person should check. "name" is flagged when the organisation uses more than one form of its name: an acronym or short brand, a foundation versus a company, or a version with and without "India". That covers all 8 name edits in this set. "industry" is flagged only when the work spans unrelated sectors.
  - "location" is never flagged, and an empty list is allowed.
  - The output contract is unchanged.
- **Operator note rewritten.**
  - Each profile gets one media item, never both. In this set, 14 got an image under the opening paragraph and 6 a YouTube link.
  - The video links now use one format: `**[Youtube Video](url)**` on its own line after the opening's 2nd or 3rd sentence. The note records it. Adding media remains operator work.
- **Source note added (outside the prompt).**
  - The composer gives the model one page as text, with `nav` and `footer` removed (`src/lib/fetchSource.js`).
  - This is the likely reason HQ is still missing in 10 of 38 drafts despite v3's instruction, and Leadership in 26.
  - It's recorded so future revisions fix this in code rather than tightening the prompt again.
- **Left unchanged, with reasons:**
  - `name` rules: 8 edits went in four directions, and the operator accepted counter-examples for each, so no new rule.
  - "Major" in section headings: dropped in 3 drafts, kept in 33.
  - HQ and Leadership search instructions: the gap is in what the model is given, not what it's told.
  - The ban on writing about the source: only the two replaced profiles broke it, and 7 drafts with no Impact block were accepted.
- **Confirmed by these 38 pairs and kept as written:**
  - No "Nonprofit" in `industry` (0 edits).
  - `| aikyamjobs` at the end of titles (0 edits).
  - `metaDescription`, `excerpt`, `location: null`, `size` and `website` (0 edits).
  - Leadership spacing (0 fixes).
  - No placeholders and no framing lead-ins (0 occurrences).
  - The optional Partners block, no longer tentative: used in 10 drafts and kept in all 10, including very long typed lists.
  - Conflicting figures reported once (Eklavya, Leadership for Equity).
  - The flagship paragraph, the closing paragraph and the two-fence output contract.
