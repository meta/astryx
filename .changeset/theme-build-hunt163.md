---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` (and `astryx experimental theme compile`, which builds the same way):

- A theme that gives null for a part or a style key's block is refused at the line that gives it, never a crash. A null property or token value keeps its meaning (it is written as it is) and is warned at its line.
- A style key no element carries is warned: a value a closed prop never takes (`size:xxl` on Button, which takes sm, md and lg) and a pseudo-class written as a style key (`':hover'`, which goes inside one: `base: {':hover': …}`).
- A named pipe, a device or a socket where an output or `--out` goes is refused at once, never opened.
- `--out out/.css` is told to give the stylesheet a name. An `--out` that starts with an unexpanded `~` is warned: the build writes in the project's `~` folder, as before, and the warning names that folder and the home folder path to give instead.
- A theme with no name is refused as one, at its line.
- Apple Color Emoji and Noto Color Emoji count as the systems' own fonts.

@josephfarina
