---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: named CSS properties, typed values kept whole, and parts it cannot name.

- A CSS property named in the question is set as named, with its value checked against the property's grammar: `caret-color`, `outline-offset`, `text-shadow`, `accent-color`, `text-underline-offset`, `font-variant-numeric`, `text-wrap`, `transition`, `padding-block`, any property `set` accepts. It is never swapped for another property.
- Typed values are kept whole: `clamp()`, `calc()`, `color-mix()`, a four-value radius, `line-height: normal`. A font size of 0 is refused by name.
- "Modal" names the dialog again; "carrd" and "caard" are corrected to card, and "lines" is no longer corrected to "links".
- A typed color is the target: "too bright, use #b91c1c" sets #b91c1c.
- Gray stops are read ("gray-50", "zinc-900", "slate 100", "neutral-200"); "subtle gray" is a light gray; "charcoal text instead of black" sets a charcoal.
- Fonts any machine has (Arial, Menlo, Times New Roman, Helvetica Neue, SF Pro) and typed names (Plus Jakarta Sans, Noto Sans, Fira Code) are set as named; "the default Mac font" is the system font.
- "menu", "select", "list", "divider" and "footer" name their parts, and so do "combobox" (the complex selector) and "accordion" (the collapsible). A part word how cannot name ("image") gets the closest parts and a lookup, never a whole-theme change.
- "too shadowy" is softer. "On focus" reaches the next clause; "night mode" is dark mode; "dark by default" is a dark-only theme; "lift it with a bigger shadow" is the hover shadow only; "ON: CARD" names the part; "the cards and the dialogs both" answers both.
- A picture whose name has spaces, as macOS names screenshots, is read as a picture.
- Questions about the tool get the command that answers them: help, "list every dial", "which token sets the page background?", "explain text-size", "how do I see my changes", "difference between corners and border-radius".
- The corners lookup's example is a token whose change shows.

@josephfarina
