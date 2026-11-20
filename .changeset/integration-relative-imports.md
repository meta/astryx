---
'@astryxdesign/cli': patch
---

[fix] `astryx integration check` and `astryx doctor integration validate` now resolve every relative import of the modules a package ships the way an app's bundler does, against the files npm packs (for an installed package, its files on disk). Run in the package's own folder, they used to pass an import such as `./icons` that the tarball leaves out, because the file was on disk there. Each import no shipped file answers is a `relative_import_not_shipped` note marked `next`, naming the importing file, the import, and that the file is not in the package. It fails `integration check --strict --next` now; the next minor release makes it a warning, which fails `--strict`. When npm cannot be asked, an import whose file no `files` entry can reach is still a note, and any other is listed as not checked. `astryx doctor`'s theme owners check now also reads a package theme's stylesheets, whose `@import` and `url()` references it never followed, and warns that the built module loads but names a file the package does not ship. Type-only imports are skipped; `./icons` resolving to `icons/index.js` is fine.

@josephfarina
