---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: complete border values, layer opacity, and the right kind of change.

- A border or outline value is complete or goes to the right longhand: "card border 2px" sets `border-width` (a border with no line style draws nothing), "border width 2px" and "border bottom width 2px" set those properties, "border 0 0 2px" keeps all four widths, a width with a color gets a solid line, and "text-decoration #2563eb" sets `text-decoration-color`. "border width" never sets the part's width.
- "shadow opacity 0.2" sets the shadow's alpha, and "background opacity" or "border opacity" make that layer see-through, never the whole part.
- Font names win over dial words: "Space Grotesk headings" and "headings in Space Mono" set the font.
- Negation is kept: "should not shrink when pressed" is no scale, "but not bold" is a regular weight, and "why are my headings not bold" asks for bold.
- The right kind of change: "thinner body text" is a lighter weight; "faster hover transitions" sets `transition-duration`; "turn off all animations" and "transition duration 300ms everywhere" set the shared duration tokens; a part with no motion of its own, or no fill (the spinner), says so; "dim the white text" dims it; "a border instead of a shadow" removes the shadow and adds the border; "button press scale 0.98" scales on press.
- Point sizes are read (11pt is 15px), and a rem text size is read in pixels.
- A heading's color, which comes from its prop, is set with `--color-text-primary --on heading`; "headings red" is the text color.
- The divider is a part: its thickness and color are `--border-width` and `--color-border` on the divider.
- "go back to the neutral theme" takes back every setting, one undo each.
- Small caps, tabular numbers, balanced heading lines, "I can barely see the borders" and "hover does nothing visible" are read; tool questions about using, renaming, versions, files and hand edits get the command that answers them.
- A fully see-through picture is refused: it has no visible colors.

@josephfarina
