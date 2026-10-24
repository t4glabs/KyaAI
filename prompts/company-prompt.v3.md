## Pattern Analysis

**The v2 structure works, and most of the description body is now published as written.** In about three-quarters of the 40 pairs, the description changed only where the operator added the logo image, and sometimes a YouTube link. The skeleton (opening, HQ blockquote, Areas of Work, Initiatives, flagship paragraph, Impact, Leadership, closing) survived in nearly every record. Four of the v2 rules are confirmed by this data:

- `metaDescription` was published untouched in 39 of 39 pairs, including "&" and "Explore jobs on aikyamjobs".
- `location: null` held in all 40.
- `size` was never edited.
- The two v2 rules that rested on a single edit each now have 40 pairs behind them.

Two pairs are not real edit signals:

- **The second Akanksha pair:** the published record is the earlier Akanksha profile, word for word. The operator kept the existing version rather than editing the new draft.
- **T4G Impact Tech Foundation:** this is aikyam's own organisation, and the operator filled it in from inside knowledge (e.g. the website).

What's left are smaller, repeated metadata fixes and a few body habits.

**Metadata edits that repeat:**

- **`industry` loses its "Nonprofit" label.** 8 of the 19 drafts that called themselves "Nonprofit / X", "Non-profit / X" or "X nonprofit" had that part removed. Examples: "Nonprofit / Community Development" became "Community Development", and "Education nonprofit" became "Education". The operator never added the label to any other organisation's draft. Everything on the board is social sector, so the label tells a reader nothing. This is the strongest metadata signal in the set.
- **`metaTitle` gets the brand added.** 8 titles were edited. 6 of them added aikyamjobs (`| aikyamjobs`, `at aikyamjobs`, `, aikyamjobs`), and the other 2 only carried a name change through. The brand was never removed from any title. Many unbranded titles were left alone, so this is a preference applied when the operator gets to it, not a hard rejection.
- **`name` was edited 7 times.** The one consistent direction is the name the organisation itself uses:
  - Taglines and parent-institution qualifiers were removed: "Triguna - The Science of Living" became "Triguna", and "NSRCEL, IIM Bangalore" lost the IIM Bangalore part.
  - Legal-form words were added: "Antahin Abha" became "Antahin Abha Foundation", "Kohmorehbee" became "Kohmorehbee Consulting", and Holy Mission got its full registered name.
  - Parenthetical acronyms went both ways (2 removed, 4 kept), so I haven't made a rule for them.

**Gaps in the body that the operator fills in:**

- **Headquarters.** 10 drafts left out the HQ line because v2 said to omit it if it isn't stated. The operator found and added it in 4 of them: Nirmaan, Young Tinker, Girls Not Brides and Lend A Hand. Usually it was a city the model could have found on a contact page or in a footer. For organisations based abroad, the operator wants the India presence shown: Goodera's draft already had "(India office: Bengaluru, Karnataka)", and the operator added "(India: Karnataka)" to Youth Impact.
- **Leadership was fixed twice.**
  - Suryoday's draft wrote a placeholder ("Details available on the organisation's About page.") and the operator replaced it with three names.
  - Himmotthan's draft listed one person and the operator expanded it to four (chair, executive director, treasurer, board member).
  - Both are trusts or societies whose board officers are the leadership.

**Formatting fixes:**

- **The Leadership list's blank lines.** About half the drafts wrote the list tight (no blank line after `**Leadership**` and none between bullets), while every other list in the body has blank lines. The operator fixed this in 3 cases (USIEF, Sohum, CPF). The cause is v2's own template, which shows a tight list and contradicts its own blank-line rule.

**Changes to section structure and prose:**

- **A separate Partners block came back.** In 5 pairs the operator pulled partners out of the Impact paragraph into their own `**Partners**` block between Impact and Leadership: Bharti Airtel, Anugraha, Need Base, Triguna and Himmotthan.
  - These were the cases with long partner lists, or lists that fall naturally into types (Himmotthan's Technical, Implementing and Supporting partners).
  - Short partner clauses were left inside Impact in about 30 other pairs.
  - v2's "never give partners their own section" rule was based on one edit, and this data mostly overturns it. The trigger I've written (a long or typed list) is my reading of those 5 cases, so treat it as tentative.
- **Overloaded Impact paragraphs got rewritten.** Bharti Airtel's Impact paragraph listed every page's conflicting figures. The operator replaced it with a few consolidated headline numbers. Triguna got the same treatment. Shorter conflict notes (Akanksha, Goodera, WeDoGood, ESAF) were kept. So reporting a conflict is fine; listing every discrepancy isn't. This rests on 2 cases.
- **Closing lead-in removed.** "A closing note for anyone considering this work:" was cut in 2 of the 3 drafts that used it.
- **Plainer openings.** One flowery opening (Navothan: "structural response to systemic socioeconomic gaps", "borderless") was rewritten in plain language. The existing tone rule already covers this, so I made no change for it.

**Operator work I deliberately did not hand to the model.**

- **YouTube links.** Video links were added in 8 pairs, but in three different formats and placements, sometimes splitting the opening paragraph to fit them. A made-up URL is worse than no link, so I left this out of the prompt. If you want it automated, it needs a fixed format and a rule that the link must appear on the organisation's own site.
- **Programme bullet count.** v2 asked for 4-5 programme bullets. 6 were accepted many times and Bharti was expanded to 7, so I loosened the cap to 4-6.

---

## Revised Prompt

# Company Profile Prompt — v3

Supersedes company-prompt.v2. Revised against 40 real aiDraft/published pairs
from aikyamjobs.org (Oct 2026). v2's structure held: roughly three-quarters of
bodies were published with no prose edits, and `metaDescription` and `location`
were untouched in every pair. v3 makes targeted fixes to the fields and sections
the operator still edits. The Partners-block and Impact-density changes rest on
5 and 2 edits respectively and should be re-checked.

Purpose is unchanged: called programmatically by the job-composer tool, output
split into a metadata block and a single Markdown block for the `description`
field.

Field mapping: Company has one long-form field (`description`) and several
short fields (`website`, `location`, `size`, `industry`, `excerpt`,
`metaTitle`, `metaDescription`). Everything narrative belongs inside the single
`description` Markdown block.

Operator note (not the model's job): the organisation's logo or a site image is
inserted by hand directly under the opening paragraph, and a YouTube link is
added by hand where the organisation has one. Do not emit an image, a video link
or a placeholder.

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
- List any field in `reviewFlags` where you made a judgment call (e.g.
  "industry" if it wasn't explicitly stated, "size" if estimated, "name" if the
  site uses more than one form of the name) rather than reading it directly from
  the source. Entries must be field names from the JSON block below and nothing
  else — not section names, not prose.

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

- 4-6 bullets, each written as "Programme name: one sentence describing it."
  Use the organisation's own names for its programmes and include concrete specs
  where stated (duration, certification, who it serves). Look through the site's
  programme, course and work pages for these; do not settle for the summary on
  the homepage.

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

## Changelog vs. company-prompt.v2

- **`industry`: "Nonprofit" labels banned.** 8 of the 19 drafts that carried "Nonprofit / X", "Non-profit / X" or "X nonprofit" had the label removed (Holy Mission, Sohum, Navothan, Anugraha, Need Base, Triguna, Samarpan, Lok Astha). The operator never added the label to any other organisation's draft; T4G, aikyam's own organisation, is the one exception. This is the most frequent metadata edit in the set.
- **`metaTitle` ends with " | aikyamjobs" when it fits.** 6 of the 8 title edits added aikyamjobs branding (U&I, ESAF, Wipro, Triguna, Samarpan, Lok Astha), and branding was never removed. The 60-character limit is unchanged. I used `| aikyamjobs` because it is the most common form among published titles.
- **New `name` guidance.** 7 names were edited. The rule covers the consistent parts: keep the organisation's own legal-form word (Antahin Abha → Antahin Abha Foundation, Kohmorehbee → Kohmorehbee Consulting, Holy Mission → full registered name), and drop taglines and parent qualifiers (Triguna's tagline, ", IIM Bangalore"). Parenthetical acronyms were dropped in 2 cases and kept in 4, so no rule for those. "name" was added as an example reviewFlag for cases where the site uses more than one form of the name.
- **Headquarters is no longer given up easily.** v2's "omit if not stated" led 10 drafts to drop the HQ line, and the operator added it back in 4 (Nirmaan, Young Tinker, Girls Not Brides, Lend A Hand). The prompt now lists where to look (Contact page, footer, registration page, LinkedIn). Added the "(India office: ...)" form for organisations based abroad, following Goodera's accepted draft and the operator's Youth Impact edit.
- **Leadership list formatting fixed in the template itself.** v2's template showed a tight bullet list, which contradicted its own blank-line rule. About half the drafts copied the tight form, and the operator added blank lines in 3 (USIEF, Sohum, CPF). The template now shows a blank line after the label and between bullets, and the tone rule says it applies to every list.
- **Leadership: no placeholders, and board officers count.** Suryoday's draft wrote "Details available on the organisation's About page", and the operator replaced it with three names. Himmotthan's single name was expanded to four board and executive officers. Added trust and society officer titles to the list of people who count, a Board page to the places to look, and "omit the block entirely" as the only fallback. Also added the placeholder phrasing to the source-commentary ban.
- **Optional `**Partners**` block reinstated.** This reverses v2's single-edit rule. The operator created a separate Partners block between Impact and Leadership in 5 pairs (Bharti Airtel, Anugraha, Need Base, Triguna, Himmotthan), always for long or typed partner lists. Short partner clauses inside Impact were kept in about 30 others, so the block applies only above about six partners or when the site groups them by type. Tentative.
- **Impact limited to headline figures; conflicts reported once.** Bharti Airtel's paragraph, which listed every page's conflicting figures, and Triguna's were rewritten into a few consolidated numbers. Single conflict notes were accepted elsewhere (Akanksha, Goodera, WeDoGood, ESAF). Based on 2 rewrites, so tentative.
- **Banned framing lead-ins on paragraphs.** "A closing note for anyone considering this work:" was deleted in 2 of the 3 drafts that used it (Girls Not Brides, Kosi Lok Manch).
- **Programme bullets loosened from 4-5 to 4-6.** Six bullets were accepted repeatedly (Holy Mission, Shakti Shalini, Need Base, WASSAN, SVYM), and Bharti Airtel was expanded to seven.
- **Operator note extended to cover YouTube links.** The operator added video links in 8 pairs, in three different formats and positions. I kept this as an operator task rather than a model instruction: there is no agreed format, and a made-up URL is worse than none.
- **Left unchanged, now confirmed by 40 pairs:** `metaDescription` rules (39/39 untouched, excluding the Akanksha re-run), `location: null` (40/40), `size`, `website`, `excerpt`, the opening paragraph instructions, Areas of Work, the flagship paragraph, attribution of numbers, the evergreen rule, the em-dash ban, and the two-fence output contract. The second Akanksha pair and the T4G pair were not used as evidence: the first is the operator keeping the earlier published version, and the second is the operator's own organisation, filled in from inside knowledge.
