---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`:

- In an editor theme, a pseudo key that is no single selector is refused at its line: one that leaves a parenthesis, bracket, quote or comment open (`':nth-child(2n'`, with the closed form offered), one no browser reads, and a selector list (`':hover, :focus'`), which is named with one key per member. A plain theme's `compile` warns them, as `theme build` does.
- In an editor theme, a custom property with capitals in a part's block is refused: the build writes a part's property names in kebab case, so `--myColor` would be set as `--my-color` while `var(--myColor)` reads the name as written. A plain theme's `compile` warns it.
- A variable a component sets on its own element is refused in `localTokens` and in another part's block, with the part that sets it. On its own part, `var()` of that variable reads it.
- `editor set` on a theme whose stylesheet is a named pipe gives the pipe refusal, never a failed module load.
- A value read through an imported object's member (`all.toks`), a destructure of one, an imported function's return, or an imported typography object is blamed on the file that holds it.
- A null value in the theme's own file builds as it is with a warning at its line, as in any theme; a null part or style key is still refused.
- `compile` of a missing file near the theme source (`themes/t/t.theme`, `t.them.ts`) offers that source.

@josephfarina
