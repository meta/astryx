---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads every list through one list grammar:

- **Variants and states:** a list of any part's variants or states names each item, whether it comes before the part ("blue, teal and red cards"), before "ones", with an Oxford comma, or after "when" ("orange when hovered or pressed"). A variant name in a list is never read as a color to paint.
- **Parts:** a list of parts ("buttons, cards and inputs rounder") gives each part the ask.
- **Excepts and keeps said first:** an except before the ask ("make everything except buttons rounder") and a keep said first ("without changing buttons, make everything rounder") are read as excepts of the ask. The change alone is no longer offered next to an except answer.

Other readings:

- **Parts:** A corners step on a group leaves out the members already at that end (checkboxes rounder leaves out the radios, which are fully round already). "Card titles" and "dialog titles" color their heading. A state that only a part's items take ("side nav selected items") goes to the items. "Outlined in <color>" is a border color. "Padded" is a spacing word, and "less padded" or "less roomy" is tighter. "Drop-down" reads as "dropdown".
- **Corners:** on a pill base, a kept variant keeps the base's pill.
- **Modes:** "in dark mode only" scopes the ask to dark mode, and never makes the theme dark-only.
- **Shadows:** asks how cannot measure get a true reason. A softer shadow on a part the editor has not seen drawn is refused. A one-mode card shadow change says the card draws no shadow of its own at rest.

@josephfarina
