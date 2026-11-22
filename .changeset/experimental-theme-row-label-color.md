---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set … color <value> --on <part>`: a text color on a row drawn more than once inside another part that draws no text itself, whose label is its own component's part drawn inside it (a select's option row, whose label and description are those of the Item drawn inside it as the select's option), now reaches the text tokens that label reads, so `color #fff --on option-rows --state hover` beside a dark fill gives every option row readable text, its description included. A part that is no such row (a table, a markdown block) keeps the color on itself, so content an app puts inside it keeps its own color.

@josephfarina
