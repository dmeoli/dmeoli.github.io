# Texts of the booklet

`it.json` and `en.json` hold the fragments that `astro-booklet.html` prints: one
for every key that the families of `../rules.json` can produce (507 per language),
plus the sentences of the conflicts (`sentences`) and the titles of the chapters
(`ui`). Every fragment is `{ "status": "draft" | "ok", "text": "..." }`, and the
booklet marks the paragraphs that still come from a draft.

To review: read a fragment in both languages, correct the text if needed and set
`"status": "ok"`; then run `tools/astro_coverage.py`, which fails if a key is
missing, if a fragment falls outside 40 to 90 words or uses a word the booklet must
not use (events, health, money, death, fate), and prints how many are still drafts.
The criteria are the ones the drafts were written to: a psychological tone (needs,
tendencies, tensions), never a prediction; in Italian the reader is addressed with
"tu" and no adjective agrees with the reader's gender; the openings vary; no
fragment takes or paraphrases a copyrighted author (ideas only from public-domain
sources such as Ptolemy in Ashmand's translation of 1822 or Alan Leo).

To see a fragment in context, open the booklet of a chart where it is told: the
last page of the booklet lists every factor with its weight and its chapter.
