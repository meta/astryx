---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` now decides one way, for every clause in an ask, which part it changes, in which state, and in which mode:

- **Part:** a clause that names no part changes the part before it only when it adds to that part. That covers "with a 2px border", the part's own colon list ("cards: white background, 1px border"), "and darker", a state of the part ("; when focused a 2px ring"), and the part's own text color ("buttons blue, white text"). A font, text size, spacing or "surfaces" clause, a new sentence, or a comma item with its own look ("big buttons, thick borders") changes the whole theme. A page's text is the theme's text.
- **State:** "when off" on a switch changes its resting look and keeps the checked one, instead of changing every state.
- **Mode:** "in dark mode:" at the start of a sentence covers every clause in it. A mode said at the end of a run covers the run. Light/dark pairs never reach across a sentence.
- **Light and dark colors:** on a theme with both modes, a color that one mode can't carry is not written to that mode. This applies to a light fill whose dark-mode text would not read on it (cards, a button variant, a banner, a selected row), a dark card, and a light border. A color word said for dark mode ("subtle gray in dark mode") becomes that color's dark tone. Each answer says so.
- **Wording fixes:**
  - "green text on a black page" now sets the page black and the text green.
  - "muted text" and link colors that the dark page can't read go to light mode.
  - "navy buttons" leaves alone the variants whose text would vanish.
  - "softer corners" now means rounder.
- **Show's missed list:** a suggestion from show's missed list never contradicts the ask, and it comes after the ask's own answer.

@josephfarina
