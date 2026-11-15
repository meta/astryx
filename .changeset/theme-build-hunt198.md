---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build`: a family build names a file it replaces, and builds that would not load say so.

- A family build over a file with no build header at the `--family-key` name (an output of a CLI before 0.6.7, or a file of your own) still replaces it, now with a warning naming the file. Another theme's outputs there are replaced with a warning naming that theme.
- A family member whose icon registry is imported without its extension (`import {icons} from './icons'`) builds, as it does on its own.
- An icon registry that imports an asset (`import check from './check.svg'`, a `.png`, a font) builds; the asset loads as its URL, as a bundler gives it.
- With `--out` in another folder, a relative icon registry import that nothing answers to from there is warned, with the `--icons-specifier` that names the registry from there.
- A theme file that exports two named themes and no default warns which theme it builds and which it leaves out.
- An empty or blank `--icons-specifier` is warned (the built module would import from `""`); `astryx experimental theme compile` refuses it, and an empty or blank `--out`, before building. `theme build --out ''` still writes beside the source.

@josephfarina
