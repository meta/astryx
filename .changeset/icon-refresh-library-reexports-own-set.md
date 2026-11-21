---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental icon new-set --from` and `icon add --from … --all` on a package that is its own icon library, and whose root re-exports the set's generated module (`export * from './icon-sets/<set>/<set>.generated.js'`, the line the CLI suggests), now read only the library's own icons. Before, the set's own short names in the root were read as library icons, so the refresh refused with "The generated icons module already exports …" or would have re-exported the set from itself.

@josephfarina
