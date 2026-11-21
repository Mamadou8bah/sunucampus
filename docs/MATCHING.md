# Smart matching

SunuCampus recommends students using a **weighted scoring algorithm** over profile data, as described in
section 6 of the proposal. It needs no machine-learning model, and every score can be explained.

Implementation: [`backend/src/utils/matching.js`](../backend/src/utils/matching.js). Unit tests:
[`backend/tests/matching.test.js`](../backend/tests/matching.test.js).

## When a student can be matched

A profile needs at least one **connection goal** plus at least one **interest or skill**. Until then the Matches page
asks the student to complete their profile.

## The five factors

Each factor produces a value from 0 to 1.

| Factor | Weight | How it is measured |
|---|---|---|
| Connection goals | 30% | **Overlap coefficient**: shared goals ÷ the smaller number of goals. A student with one goal is not penalised for choosing fewer. |
| Interests | 30% | **Jaccard similarity**: shared interests ÷ all distinct interests of both students. Rewards closely aligned interests, not just one in common. |
| Skills | 15% | Overlap coefficient of skills. When both students want **project collaboration**, complementary skills also count: the share of the other student's skills that I don't have, × 0.8. The higher of the two values is used. |
| Programme | 15% | 1 if both study the same programme (case-insensitive), otherwise 0. |
| Year of study | 10% | Normally `1 − gap ÷ 3` (same year = 1, three or more years apart = 0). When both want **mentorship**, a gap of 1–3 years scores 1, because mentors are usually further along. |

```
score = round(100 × (0.30·goals + 0.30·interests + 0.15·skills + 0.15·programme + 0.10·year))
```

Tags are normalised (lower case, trimmed, single spaces) when a profile is saved, so "Web  Design" and "web design" match.

## Worked example

| | Awa (viewer) | Lamin |
|---|---|---|
| Goals | study partner, friendship | study partner |
| Interests | football, music, technology | football, technology, reading |
| Skills | python | python, excel |
| Programme | Computer Science | Computer Science |
| Year | 2 | 3 |

- Goals: 1 shared ÷ min(2, 1) = **1.00**
- Interests: 2 shared ÷ 4 distinct = **0.50**
- Skills: 1 shared ÷ min(1, 2) = **1.00**
- Programme: same = **1.00**
- Year: 1 − 1/3 = **0.67**

Score = 100 × (0.30 + 0.15 + 0.15 + 0.15 + 0.067) = **82**

Reasons shown: "Both looking for a study partner", "Shared interests: football, technology", "Shared skills: python",
"Also studies Computer Science".

## Producing the recommendations

1. **Candidate pool:** active students and moderators (never admins, suspended or banned accounts) who share at least
   one goal, interest, skill or the programme. Students the viewer is already connected to, or has a pending or
   declined request with, are excluded. Up to 500 of the most recently active candidates are loaded.
2. **Scoring:** each candidate is scored in memory with the formula above.
3. **Ranking:** candidates below 15 are dropped, the rest are sorted by score (ties by name), and the top 20 are returned.

The same score appears on Discover cards and on profile pages, with the reasons, so students can judge a
recommendation for themselves.

## Measuring how well it works

The reporting module tracks the **share of connection requests sent from the Matches page** ("From smart matching") and
the **acceptance rate**. A rising matching share with a steady acceptance rate suggests the recommendations are useful.
Because the weights are constants in one file, they are easy to tune against these figures.
