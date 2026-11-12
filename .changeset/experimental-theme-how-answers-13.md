---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: mode phrases, questions about what is set, the focus ring, and changes by an amount.

- "The same accent in light and dark" sets both modes, and a trailing "and dark mode only" still makes the theme dark-only.
- A step that cannot move (badges already fully round) says so, with no command that would be refused.
- Questions about what is set now or the choices ("how round are the cards now?", "what are the available corner values") get `show` and the lookup, never a change.
- "Remove the focus outline" sets its width to 0 and says what that costs; "outline offset" and "focus ring offset" set `--focus-outline-offset`.
- "Decrease the radius by 2px" moves the corners from the theme's own radius now (its corners setting applied); a change by an amount on a part points to its current value instead of setting the amount.
- "Caret color" sets `caret-color`; placeholder text and the selection highlight say they have no setting.
- Screen-size, print and device conditions ("below 600px", "on tablets", "the print version") say the editor has no such conditions, instead of reading "600px" as a radius or "tablets" as tables.
- "Text less black" lightens the text.
- Each item of a list keeps its own values: "headings 32px bold, body 16px regular, captions 12px" sets the headings and the body as asked, with no contradiction, and "captions" (no part) takes nothing from its neighbors.

@josephfarina
