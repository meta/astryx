---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: the confidence gate works per clause, and a one-mode change never removes a mode.

- A clause that is a question, a "tell me", a "stop …" or a "don't touch …" holds back only itself: "stop making the buttons so round, make them square" makes them square, "don't explain, just set the accent to crimson" sets crimson, "don't touch spacing, just make text larger" changes only the text. A whole question ("can the cards be rounder?", "are buttons too round?!") gets the lookup; "can you make …" is an ask.
- Questions without a question mark ("are my corners too round", "does it use a shadow on cards") are lookups; suggestions ("why not square buttons", "what about a teal accent", "is there a way to …") are asks. Sarcasm ("yeah, because …", "just what I wanted", "…, nice") gets no write.
- "Enough with X", "quit with X", "nobody asked for X", "who needs X", "loathe X", "X 👎" and "❌ X" ask for none of X; "I hate it" after a description leaves the description as the ask.
- "Too airy" is tighter, "headings too thin" bolder, "not bright enough" brighter.
- "Keep the dark mode accent, change only light to violet" sets the light accent; a light-only or dark-only theme only when the ask is about the theme's modes.
- "Links not underlined until hover" removes the underline and adds it on hover.

@josephfarina
