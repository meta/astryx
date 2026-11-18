---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`:

- A value no page could show, such as a line height of 0 or 99999px of padding, is not written. The answer gives the range that works instead.
- "List items more spacing between them" points to the list's gap, not each item's padding. A visited link gets the "no visited state" answer.
- "selected tab with a 2px underline" gives the tab underline. "the selected date in the date picker" names the calendar day.
- When the page background is part of a longer request, the combined line also paints the frame and main panel, as the page's own answer does.
- White text asked for the header goes to the mode where it can be read, and the answer says how to have it in both modes. Readable-text lines no longer print an empty "()".
- "buttons font weight medium" sets a weight, not the medium size. "semibold instead of bold" is one request.

- `astryx experimental theme editor how` writes nothing for more kinds of messages that don't ask for a change:

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

- `astryx experimental theme editor how`:

- Two-word color names ("off-white", "ink blue", "grass green", "safety orange", "slate blue-gray"), tan and paper now resolve through the color table. Off-white is a warm off-white. "pure white" means exactly white. "amber for warnings" sets the warning color. A typed value said with a named color, as in "bold safety orange #ea580c accent", wins.
- "make it calmer" and "a calm dark mode" lower vibrancy. "more cheerful" means more colorful.
- When no command can do the whole request, the text output now says each result explains why, instead of pointing to lines "above" that appear below.
- Tailwind shadow sizes ("shadow-sm") map to the editor's shadow sizes.
- "dividers between list rows" and "table rows divided by 1px lines" give a bottom border. "32px rows in the menu" sets the menu item height.
- "should be a #e8def8 pill" gives that fill with pill corners. "dialogs with a dark overlay behind them" darkens the overlay. "big touch targets" makes buttons and inputs bigger. "a 2px dark border" uses the theme's stronger border color.

- `astryx experimental theme editor set`: a step past a dial's last rung names an exact line only where one setting does it. On a part, spacing goes on in the control height the part reads ("bigger buttons" at the top rung offers `--size-element-md 46px --on button`); the text size offers a size it takes; the whole theme's spacing, which no one setting carries, claims no exact line. A one-mode theme reads its own mode named with `--mode` (`--mode dark` on a dark-only theme) as the same as no `--mode`, in `set` as in `undo`, and says so.

- The pictures `astryx experimental theme editor show --png` takes of the sheet give text a part cuts with an ellipsis when narrow, such as a stepper's step names, the room it needs, so a picture shows the names whole. A part whose own width is fixed keeps it.

- `astryx experimental theme editor show` lays out the sheet's cells so none is narrower than what it holds: a date input's calendar, a stepper, a toolbar, an overlay's media and a popover drawn open show whole instead of cut at the cell's edge, and a list that folds items into a menu shows its items whole. `show --section pages --png` draws the sample app whole, cuts a tall pages picture between pages, and names it among the pictures to open. A change removes the pictures cut from a tall family picture (`sheet-containers-1.png`) with the others, so none keeps showing the old look.

- `astryx experimental theme editor`: a role color the theme sets now reaches a badge or other part the base theme draws for that role in a color of another family (stone's info badge in its categorical blue): the part takes the role token the base gives that same color, so its look stays and it follows the role.

- Palette recipe `astryx-oklch-v2`: a dusty seed's pale tints (above shade 70) stay at or below its own chroma even where the gamut is wide, so a muted olive gives an earthy tint instead of chartreuse; the middle of a ramp is still drawn as v1 draws it.

- `astryx experimental theme editor`: the fix line for a loading placeholder that does not show now offers the theme's own gray nearest the placeholder's color (else a darker or lighter shade of that color), not a plain gray.

- `astryx experimental theme editor`: a role's icons and status dots (warning, danger, success, info, accent) take the shade nearest the role's fill that reads at 3:1, as WCAG asks of graphics, instead of text's deeper 4.5:1 shade, so a warning dot stays nearer amber where warning text deepens.

- `astryx theme build` gives one warning, at its line, for a part's variants written as other styling libraries write them (`variants: {variant: {secondary: {…}}}`), naming the style keys that write them (`'variant:secondary': {…}`), instead of three warnings that never showed the working form. The output is the same as before.

@josephfarina
