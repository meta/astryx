---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: right way round, whole font names, and the app's themes from any folder.

- Polarity: "flat cards" removes the cards' shadow ("too flat" adds one); "not round enough" is rounder; "nothing rounded except avatars" is square with round avatars; "shadows too strong" is softer; "borders too dark" is fainter and "too light" stronger, per mode; "not so much padding" is less.
- "Border radius" in two words is the radius, never the border width. A rem or em radius for the whole theme is set in pixels (0.75rem is 12px), and a `%` radius keeps its `%`. "button padding 8" is 8px.
- Font names of several words are kept: shipped fonts by their full name (DM Sans, IBM Plex Sans, Geist Mono, JetBrains Mono), and other names as typed (Roboto Mono, Source Sans 3). "Sans-serif" is never read as serif.
- "Off-white" is #fafafa. "Headings too big" changes the heading scale. "#e5e5e5 not pure white" sets #e5e5e5.
- "1) … 2) …" markers and "Feedback round 2" are not values. `primary=#7c3aed radius=10 font=Geist` reads each pair. "Body text 16px" is the text size.
- A link's color is `--color-text-accent`, the token a link reads; the answer says it also colors other accent text, and that a link has no color of its own per state.
- Parts: table cells, menu items, radio buttons, text areas, selects, skeletons and popovers. A variant word before a part ("success badge") adds `--when variant:success`. "Card and Dialog" answers both. "Match the header to the sidebar" changes the header. A shadow ask after "serif headings" is for the theme, and a tab's text color is on the tab.
- "What does spacing more do" is a lookup. Light and dark values in one question set each mode. "I hate the purple, make it orange" sets the accent.
- A typed text color that one mode's page would make unreadable is set for the other mode only, unless the question asks for every mode or sets the page too. A sequence never gives the page the color it gives the text.
- `how` from a subfolder of the app finds the app's themes, like the other editor commands; a picture named from there still opens.

@josephfarina
