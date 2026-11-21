---
'@astryxdesign/cli': patch
---

[fix] `theme build --family` builds a family whose member imports a local TypeScript or JSX icon registry, as a single `theme build` of that member does, and compiles it into `<family-key>.modules/`. The family build now checks each compiled registry by importing its compiled copy with Node, as the family module will, before it writes its outputs (`--check` only reads it). Before, it imported the registry's source with Node and stopped with `Cannot import family registry …` on a `.tsx` or `.jsx` file, on a `.ts` file before Node 22.18, or on a local import written without its extension. A registry whose imports plain Node cannot load (such as a package whose entry is `.tsx`) still stops the build, naming that file, and nothing is written.

@josephfarina
