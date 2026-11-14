---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: the thirteenth pass of fixes.

- `undo` leaves out what this Core refuses in the step it goes back to. A saved setting that names no design token or CSS property, or a property with no part, is reported.
- `show` builds an own change to `<name>.theme.ts`, and names a theme source that no longer builds. Its colors say where the theme source wins over the generated shade.
- A setting covered by a later one that spreads over its part is named in `set` and `show`.
- `corners 2e1px` and `+4px` are sizes. A state is refused for padding on a part whose padding Core sets from the plain value only. `--state disabled` also matches a wrapper whose input inside is the one disabled. `how <part>` lists the states `set` takes there.
- `new` suggestions keep every option given; `--like` twice is refused. More suggestions run as printed in JSON. The merge snippet's paths start from the generated themes module's folder. The help names `experimental theme compile` to build an editor theme again.

@josephfarina
