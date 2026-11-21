---
'@astryxdesign/cli': patch
---

[fix] `theme build --family` builds a family whose member imports a local TypeScript or JSX icon registry, as a single `theme build` of that member does, and compiles it into `<family-key>.modules/`. Before, the family build checked the registry by importing its source in Node and stopped with `Cannot import family registry …` on a `.tsx` or `.jsx` file, on a `.ts` file before Node 22.18, or on a local import written without its extension. A registry the member imports through a package name loads as before.

@josephfarina
