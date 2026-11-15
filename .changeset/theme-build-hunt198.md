---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build`: a family build never replaces your own files, and builds that would not load say so.

- `--family-key` follows the same rule as `--out`: a file the build did not write at the key's name (a hand-written `index.js` or stylesheet) is never replaced; the build is refused and offers a free key. Another theme's outputs there are replaced with a warning naming that theme.
- A family member whose icon registry is imported without its extension (`import {icons} from './icons'`) builds, as it does on its own.
- An icon registry that imports an asset (`import check from './check.svg'`, a `.png`, a font) builds; the asset loads as its URL, as a bundler gives it.
- With `--out` in another folder, a relative icon registry import that nothing answers to from there is warned, with the `--icons-specifier` that names the registry from there.
- A theme file that exports two named themes and no default warns which theme it builds and which it leaves out.
- An empty or blank `--icons-specifier` is warned (the built module would import from `""`); `astryx experimental theme compile` refuses it, and an empty or blank `--out`, before building. `theme build --out ''` still writes beside the source.

@josephfarina
