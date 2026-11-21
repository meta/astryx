---
'@astryxdesign/cli': patch
---

[fix] On a package that is its own icon library, and whose root re-exports the set's generated module (`export * from './icon-sets/<set>/<set>.generated.js'`, the line the CLI suggests), every `astryx experimental icon` read of that library now leaves out the set's own names: a `new-set --from` refresh, `add --variant <look> --all`, `add <Export>` (which names the icon by its glyph again), and a `new-set --default-variant` change without `--from`. Before, the set's own short names in the root were read as library icons, so the refresh refused with "The generated icons module already exports …" or would have re-exported the set from itself.

@josephfarina
