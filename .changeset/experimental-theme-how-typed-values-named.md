---
'@astryxdesign/cli': patch
---

[experimental] More fixes in `astryx experimental theme editor how`:

- A value typed in the ask (a hex or a length) that no line writes or names is now named in a "not used" line in the user's own words, even when a reader folded its clause away ("…, hover #0055CC, pressed #09326C", "… #E9E9EA when off"). A mode the other lines carry ("in dark mode, …") is no longer named.
- What a look turns into in a state, said of one side ("a 1px bottom border that turns accent and 2px when focused"), stays on that side: one bottom border at rest and one in focus, never all four sides.
- "checkboxes 18px, 4px corners" reads the 18px as the checkbox's size, as the with-form does.
- "translucent" said of a part with a fill ("nav bar translucent white", "a translucent nav bar") makes that fill partly see-through. It is no longer dropped.
- A bare length said of a text style ("footnotes 13px", "captions 13px") is its text size.
- A status color said after part clauses ("…, bolder headings, and a green success color") is the theme's success, warning or danger color, never the part's color.
- Text after a list of several parts ("page #202020, cards #2D2D2D and text #FFFFFF") is the theme's text, not the cards'.

@josephfarina
