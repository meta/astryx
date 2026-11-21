---
'@astryxdesign/cli': patch
---

[experimental] Changes to `astryx experimental theme editor how` and its checks:

- `astryx experimental theme editor how`:

- "heavy condensed headings" now gives heavy headings. It used to give light ones.
- "heavy" uses the headings dial's heavy setting.

- `astryx experimental theme editor how`: a picture named only by its file ("here is our brand board: ./look.png") now gets the answer for a picture, which says what to describe.

A built-in theme named as the look ("start from the butter look", "base butter") is now answered with the base (every setting is kept), instead of matching nothing. A base that is not installed is named with the line that installs it.

- `astryx experimental theme editor how`: after a larger base text size, "larger headings" makes every heading larger. It used to work from the base theme's original sizes and made every heading smaller.

- `astryx experimental theme editor how`: a text color for one kind of a part, such as white text on destructive buttons, is written in every mode, as main writes it.

- `astryx experimental theme editor set … border-radius '0 0 6px 6px' --on dropdown-menu`: a radius of two to four corners is taken on a part whose corners Core reads inside calc() (a menu's popup and its rows); each corner goes on the box, and the first corner is the one length the inner rows follow. `how` reads "menu corners 0 0 6px 6px" as that radius, each corner as written.

- `astryx experimental theme editor`: status colors are checked for color-blind readers.

When the theme changes a status fill (info, success, warning, danger) and two of them may look alike to someone red-weak or green-weak, `set` and `show` say so. The note includes a line that moves one of the pair lighter or darker. `how` answers color-blind questions with what the editor checks and how to keep statuses apart.

- `astryx experimental theme editor`: a text color set on a selected part that holds other parts (a table row) also sets the primary and secondary text tokens there, so a checkbox label in the row follows it.

@josephfarina
