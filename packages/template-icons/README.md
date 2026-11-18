# @astryxdesign/template-icons

Icon placeholders for Astryx's bundled templates. Each export is one icon
meaning, named `<Meaning>Icon` (`DeleteIcon`, `ChevronRightIcon`), and draws
the Heroicon the template uses for it. The import path names the look:

- `@astryxdesign/template-icons`: 24 px outline
- `@astryxdesign/template-icons/24/solid`, `/20/solid`, `/16/solid`
- `@astryxdesign/template-icons/lucide`: Lucide, for the few templates drawn with it

Only template sources import this package, so previews draw the icons with no
extra step. A copied template never imports it: `astryx template` writes each
icon as an import from the app's icon pack, or from Heroicons when the app has
none.

The files are generated from `packages/cli/assets/icons/template-icons.json`.
Edit the table, then run `node packages/cli/scripts/generate-template-icons.mjs`.
