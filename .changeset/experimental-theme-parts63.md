---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`:

- A text color on a part whose text sits on Core's media surface inside it (a toast's inverted surface) is refused with the lines that reach it, `--color-on-dark` and `--color-on-light` on the part, and `how` answers with them; the part data records such a surface.
- A resting shadow on a part that rings itself in its box-shadow keeps each of its renders' own rings: a status that draws none while focused gets the shadow alone, a shadow of none leaves the rings in their states, and a state's own shadow for the part wins on every render.
- An input's focus ring is its box-shadow ring: `how` answers a focus ring color there with that ring while focused, and an outline color, width or offset on a part that draws no outline is refused.
- "toggle thumb", "switch knob" and the like are the switch's thumb, never its track.
- A one-mode fill's covers notes keep its mode, in their words and their lines.
- The corners help names the step `more` and `less` take between round and pill.

@josephfarina
