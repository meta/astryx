---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` contrast checks judge what the page draws, and every fix line fixes its problem without making another:

- A fix line keeps the scope of the change it answers: after a setting with `--only`, its line carries `--only`, so following it changes the part named alone.
- The text typed in an input (its value, or its placeholder) is measured on the input's fill like any other text, with a fix line.
- Text that sits on a part whose variants draw different grounds (a heading on the app's header) is measured on each variant's ground, and its fix line names that variant, so a fix for one leaves the others readable. A new problem on another ground is named as new.
- A base theme's own text color on a part (butter's nav item) is what is measured, before a text token set on the part around it; a line that would change nothing on the page is not offered, and a problem no single line can fix (the same text on grounds that need opposite colors) shows with no line.
- `show`'s `missed` list offers only lines set takes: a part whose filled variants set cannot name is left out, never given a question.

@josephfarina
