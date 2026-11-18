---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor show` names the base theme's own text contrast failures as notes, one for each text color on each ground, with the line that fixes it in your theme where one does; they are never listed as your theme's problems, and a change says them only when it brings them. Text on a part that writes its own text colors (butter's colored cards) is measured in those colors.

- `astryx experimental theme editor`: whole-theme dials reach every part they name. Corners move the chat surfaces' radius (the composer drawer's top corners), the headings dial and a heading font reach a part drawn as a heading element that reads none of the headings' tokens (an empty state's title), and the file input is one of the inputs.

- `astryx experimental theme editor set` says when a fill token set on main content does not paint it inside an app shell (where it is drawn with no fill of its own and the shell's fill shows), with the `background-color` line that paints it everywhere.

- `astryx experimental theme editor how`:

- A text color asked for a part with several looks, such as white banner text for every status, is checked against each look's fill. It goes to the mode where it can be read on all of them.
- "make the cards brighter" gives lighter card fills, not darker ones.
- A focus ring color given for each mode now also sets the outline color in each mode.
- "buttons 5px 16px padding" is padding only, not also a shadow.
- A part with no shared shadow of its own says so, instead of listing its ring colors as what its shadow reads.
- "rounded photos" says photos are the app's own images, which the theme does not style, and names the parts that show one. It no longer rounds every corner in the theme.

- `astryx experimental theme editor how`: "navigation bar" is the app's top bar, as "nav bar" is, and a word of how see-through a thing is ("nav bar translucent white") is a known word, never one half of a compound subject.

- Fixes in `astryx experimental theme editor`:

- `how` keeps every item of a list led by its part on that part, however long the list: "badges 4px corners, 12px text and no border" and "tooltips #0f0f0f with white text, 4px corners and 12px text" give the 12px text to the badge and the tooltip, not the whole theme's text size. A word for a piece of the leading part ("side nav #08090a, items 13px text") goes to that piece.
- `how` no longer reads a size word that describes a look ("large bold text") as a part's own size, so a part said before it doesn't spread to it.
- `how` reads "<name> tool:", "product:", "platform:" and "portal:" labels as the product the look is for, like "app:" and "site:".
- `how` now reads "the others" after a comma ("selected tab text white, the others gray") the same way as after "and".
- `how` reads a bare length said of a part that sets its own width and height ("checkboxes 16px") as that part's size.
- `how` reads a complaint like "why is everything so round" as an ask for one step the other way, instead of answering it as a question.
- `how` reads the German comparative "eckiger" (more angular) as one step sharper, not square.
- `how` gives a part that paints no shadow at rest ("the cards look so flat", "card shadow bigger") the first shared shadow. A part's shadow steps from what Core paints.
- `set` on one member of a group under a variant of that member (`--on selector --when variant:secondary`) now reaches only the members that have that variant, not the whole group.

- `astryx experimental theme set` and `undo`: a part typed in the setting's place (`set my button background-color '#2563eb'`, `set my card padding 20px`, `undo my card`) offers the line for that part (`set my background-color '#2563eb' --on button`, the undo of each setting the theme holds on the card), never suggestions it does not take.

- `astryx experimental theme editor`: a theme saved by an earlier editor version always opens. A saved setting today's editor refuses (such as a color on a part whose inner element paints over it, so it never showed) no longer stops `show`, `set` and `compile`. The setting is kept and built as before, so nothing you see changes. A note names it, with the lines that clear it.

- `astryx experimental theme editor` gives a progress bar fill that does not read on its track a line for the variant it measured (`--when variant:accent`), so the success, warning and error bars keep their own colors, and the problem clears once that line is followed.

- Palette recipe `astryx-oklch-v3`: v2, and a dusty seed's pale tints (above shade 70) stay at or below its own chroma even where the gamut is wide, so a muted olive gives an earthy tint instead of chartreuse. The middle of a ramp is still drawn as v1 draws it. New palettes, including the ones the theme editor makes, name v3. `astryx-oklch-v2` draws exactly what it first shipped with, and a palette keeps the recipe its config names.

- `astryx experimental theme editor`: a theme's category colors (Badge, Token and Card tints) and chart colors now follow its look. Whenever the look changes (accent, neutral, vibrancy), the editor grows them from Core's hues at the accent's strength and the palette's vibrancy. Card tints stay pale enough for the theme's text, secondary text and links; badge text reads at 4.5:1, icons and chart series at 3:1; and the hues stay apart. A look that would draw two hues alike, or cannot keep them readable, keeps the base theme's and says why. An exact --color-<role>-<hue> or --color-data-* setting wins. A change's result counts these in one line each.

@josephfarina
