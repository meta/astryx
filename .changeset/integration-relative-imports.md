---
'@astryxdesign/cli': patch
---

[fix] `astryx integration check` and `astryx doctor integration validate` now resolve every relative import of the modules a package ships the way an app's bundler does, against the files npm packs (an installed package: its files on disk), and list each one no shipped file answers as a `relative_import_not_shipped` note naming the importing file, the import, and that the file is not in the package. A package whose module imports `./icons` that its tarball leaves out no longer passes silently. The note is marked `next`: it fails `integration check --strict --next` now, and the next minor release makes it an error. `astryx doctor` no longer says a package theme's built module is fine when the module or its stylesheets (`@import`, `url()`) name a file the package does not ship: the theme owners check warns that the module loads but names a missing file. Type-only imports are skipped; `./icons` resolving to `icons/index.js` is fine.

@josephfarina
