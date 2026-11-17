---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: part facts read from more of Core, colors that reach a part's inner text, corners that reach the parts drawing them, and results and refusals that say what is true.

- The part data renders each component with each look flag turned on too (a table's `isStriped`, `hasHover`), so a table row reads its hover fill, and `how` steps that token for a lighter or darker hover instead of a brightness filter.
- `how` and a refusal of a state a part lacks list the same states.
- The focus outline tokens can be set on checkbox and radio indicators, where Core draws the focus ring at focus time.
- Changing one member of a group kept alike (inputs) alone in height says it now differs from the rest, and names `--on <group>`.
- A color on a part whose text is drawn by elements that read a text color token themselves (a top nav heading, a top nav) also goes into those tokens on the part, so the text shows it.
- Corners on a part whose corners are drawn by parts of its own inside it (a date-time input's date and time boxes) round those parts, for the part and its group.
- A whole-theme corners dial moves a part a base pins to a length or to a token the dial never moves (such as `--radius-full` on buttons), keeps a part Core rounds with a fixed token (a pill badge), and never overwrites corners set on a part.
- The result lists every state rule a change writes, including one the base theme already has a state block for.
- A color given beside its own image in one background is never reported as covered by it.
- A keyword with `--mode` on a token offers only the color; on a one-mode theme, a thing that takes no mode is refused with the command that drops `--mode`, never with a change of the theme's mode.
- A one-mode state color on a group names the members that cannot keep the other mode and offers `--only` for the part named.

@josephfarina
