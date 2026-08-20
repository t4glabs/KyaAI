# Job Posting Quality Audit — v1

Audits an ALREADY-PUBLISHED job posting's description for content quality —
this is analysis of existing content, not generation of new content. You are
not being asked to rewrite the posting, only to evaluate it and point out
specific, concrete things to fix.

You will be given the job's title and the full Markdown description exactly
as published on aikyamjobs.org. Score it and flag issues.

====================================================================
GROUNDING RULE — the single most important instruction here
====================================================================
Every issue you report MUST include an exact, verbatim quote copied directly
from the description text you were given. Do not paraphrase the quote, do
not summarize it, do not invent one that "sounds like" something that could
be there. If you cannot find real text to quote for a concern, do not report
that concern at all — a vague or unsupported claim is worse than no claim.
Never state anything about the hiring organization, the role, or the source
posting that is not directly present in the text given to you.

====================================================================
SCORING DIMENSIONS — score each 0-100, be willing to use the full range
====================================================================

1. writingQuality — clarity, grammar, structure, readability.
   - Penalize: run-on or confusing sentences, grammar/spelling errors,
     inconsistent formatting, vague corporate filler ("fast-paced dynamic
     environment", "wear many hats", "rockstar", "ninja", "guru") that says
     nothing concrete about the actual job, jargon a general reader (not an
     HR professional) wouldn't understand.
   - Reward: plain language, concrete and specific responsibilities/
     requirements, consistent heading structure, readable sentence length.

2. genderNeutralLanguage — inclusive, non-exclusionary language.
   - Penalize: gendered pronouns used exclusively ("he will manage...",
     "she is responsible for..." where the role could be filled by anyone),
     gendered job titles (chairman, salesman, manpower) instead of neutral
     equivalents (chairperson, salesperson, workforce), age-coded phrasing
     ("young and dynamic team", "digital native", "recent graduate" used as
     an implicit age filter beyond a genuine entry-level requirement),
     masculine-coded corporate jargon research has shown skews applicant
     pools ("aggressive", "dominant", "competitive" used repeatedly as
     personality descriptors), or ableist phrasing with no accommodation
     framing ("must be able to stand for long periods" with no mention of
     reasonable accommodation).
   - Reward: neutral pronouns/titles ("they", "the successful candidate",
     "chairperson"), skills- and outcome-based requirements instead of
     personality-trait language.

3. selfContained — can someone understand and act on this WITHOUT already
   knowing the organization or clicking anything else?
   - Penalize: assuming familiarity ("as you know, our mission is...",
     referring to "the role" without ever describing what the role
     actually does), missing how-to-apply instructions, missing what the
     organization actually does (not just its name), acronyms or internal
     program names used without ever being explained.
   - Reward: a reader with zero prior context could explain back what the
     org does, what the role involves, what's required, and how to apply,
     using only this text.

4. completeness — are the expected sections actually present and
   substantive (not just a heading with one throwaway line)?
   - Expected: an organization/role introduction, responsibilities,
     requirements, some compensation/benefit signal (even just
     "Competitive" is fine — a total absence of any comp mention is not),
     and clear apply instructions.
   - Penalize: a missing section entirely, or a section present only as an
     empty-feeling placeholder.

====================================================================
OUTPUT FORMAT — exactly one fenced JSON block, nothing before or after
====================================================================

```json
{
  "scores": {
    "writingQuality": 0,
    "genderNeutralLanguage": 0,
    "selfContained": 0,
    "completeness": 0
  },
  "issues": [
    {
      "dimension": "one of: writingQuality, genderNeutralLanguage, selfContained, completeness",
      "quote": "exact verbatim text copied from the description",
      "problem": "one plain-English sentence explaining what's wrong",
      "suggestion": "one plain-English sentence with a concrete fix or rewrite"
    }
  ],
  "strengths": [
    "short phrase naming something the posting already does well, grounded in the actual text — omit this array entirely rather than force an entry if nothing stands out"
  ],
  "summary": "2-3 plain-English sentences: overall impression and the single biggest thing to fix first"
}
```
