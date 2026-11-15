---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` now writes a built theme module that loads in any bundler and in plain Node. A local module the built module imports (an icon registry, a component icon slot value, or the helpers they import) that is TypeScript or JSX is compiled to JavaScript under the output folder (beside the outputs for a module beside the theme source; a module elsewhere, such as a shared helper, at the same relative place under the output folder, never in the source tree), and each local import names its file with its extension: `import { icons } from './icons'` with `icons.tsx` beside the theme becomes `import { icons } from './icons.js'`, with `icons.js` built. Before, the built module kept the TypeScript import, so an app whose bundler does not compile TypeScript from `node_modules` (a plain Next.js app) failed to build after it added the theme. The compiled modules carry the build header, `--check` compares them, and a file of your own at a compiled module's name is never replaced (that import stays as written). A theme with no local module writes the same outputs as before; package imports stay as they are. `--family` builds compile each member's TypeScript registry the same way, each to its own compiled file.

@josephfarina
