---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` writes nothing for more kinds of messages that don't ask for a change:

- **Tag questions:** "spacing is compact, isn't that so".
- **A question about how the theme looks now, beside a look it names:** "cards no border. is the shadow still there?".
- **A question about what a dial does:** "what does spacing less do". The answer lists the examples in its text instead of offering them to run.
- **Sarcasm shown by emphasis or a "yes because" reply:** "yes because neon green links are SO professional".
- **A past hypothetical:** "had we gone with serif headings".
- **A change timed to a later event:** "after the review, square the buttons".
- **An ask that takes back a setting the theme doesn't have:** "accent red; also undo the corners" with no corners set. The answer says so, and asks for the rest on its own.

Other fixes:

- In a sequence ("make it compact, then make it roomy"), the later step now decides where it ends, instead of the two being offered as a contradiction.
- "badges: no fill" now makes the badge see-through, including every variant the theme fills itself. It no longer takes back those fills, which brought back the base theme's solid fill.
- A screen named by what it shows ("a records table view") no longer counts as that part.
- A real word is no longer read as a typo of another word that differs at its first letter ("stable" is not "table").
- "no shadows" after a part that draws no shadow ("visible focus ring, no shadows") now applies to the whole theme.
- `set … buttons outline` (or `soft`) no longer claims that an exact text color on the button's plain rule wins on the primary button. The primary label is now measured on the fill an exact property gives that variant.

The answer to a list of looks for a part now reads each item as part of that list:

- A subject how doesn't know ("flurbles: subtle gray background") writes nothing and names the word. It never falls back to changing the whole theme.
- Other design systems' names for a part now resolve to that part: a snackbar is a toast, a lozenge is a badge, and form controls are the inputs.
- A length and a color after the part's line ("inputs: 1px border #79747e, 2px #6750a4 when focused") are that line in that state, not a fill.
- A color word with its value after a text ask ("uppercase 12px text, gray #6b7280") is the text color.
- A day in the date picker ("date picker: today's date circled") is the calendar's day, and gets the calendar answer instead of filling the field.
- A state at the end of a with-item ("red background with white text on hover") applies to the whole look, so it no longer contradicts the resting fill.
- A text color for every button keeps per-variant lines when only a hover fill comes with it.
- A part label with padding ("dialogs: no border, 16px padding") writes the padding on that part.
- Corners on some sides ("4px top corners and square bottom corners", "4px corners on top only") change only those corners. A step on some sides asks for a size.
- A color said with a shape ("a #e8def8 pill") is that shape's fill.
- "divided by 1px lines" is no longer read as a change by 1px, and "shadow-sm" is the small shadow.

Real asks said next to a question ("set font to Inter; does that need an import?") still write.

@josephfarina
