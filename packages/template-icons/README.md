# @astryxdesign/template-icons

Icon placeholders for Astryx's bundled templates. Each export is one icon
meaning, named `<Meaning>Icon` (`DeleteIcon`, `ChevronRightIcon`), and draws
the icon the template icon table names for it. The import path names the
variant:

- `@astryxdesign/template-icons`: 24 px outline
- `@astryxdesign/template-icons/24/solid`, `/20/solid`, `/16/solid`
- `@astryxdesign/template-icons/lucide`: Lucide, for the few templates drawn with it

Only template sources import this package: the CLI package and the docs site
depend on it, so previews draw the icons with no extra step.

`astryx template` writes each named placeholder import as the import of the
icon the table names for its variant: a Heroicon, or a Lucide icon for
`/lucide`. A project with an icon set then maps that icon as it maps any
declared template icon. An import the table cannot draw stays as written.

The files are generated from `packages/cli/assets/icons/template-icons.json`.
Edit the table, then run `node packages/cli/scripts/generate-template-icons.mjs`.
