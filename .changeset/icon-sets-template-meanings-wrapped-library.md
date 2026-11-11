---
'@astryxdesign/cli': patch
---

[experimental] Icon sets: copied templates draw the right icons in more sets, once a set maps the five new icon definitions. Only the experimental icon-set rewrite of `astryx template`, five new icon definitions, the bundled templates' `icons` declarations, and the icon-set guide change.

- **Distinct icons keep distinct meanings.** Some bundled templates gave two different icons one meaning, so both drew the same icon in every set. The Settings Dialog's "Keyboard shortcuts" and "Developer" rows, and its paintbrush and swatch, now draw different icons, and so do the icon pairs in Table Filter, Theme Showcase, and the Button Group showcase block. New icon definitions: `keyboard`, `paintBrush`, `documentSearch`, `bookmarkAdd`, and `wallet`. No set released before this change maps them, so with such a set the Settings Dialog's "Keyboard shortcuts", "Color theme" and "Verbose logging" rows, Table Filter's save-view button, and Theme Showcase's wallet draw the placeholder. A set draws these icons once it maps the new definitions (`astryx experimental icon map <definition> <icon> --set <main>`); until then each draws the placeholder, unless a set in your list wraps the template's library.
- **An icon from a set's own library stays.** When a set in your list wraps the library a template imports an icon from, the icon is one your project chose. With the main set's own library, the icon keeps its import as written. With a backup set's library, an icon that no set maps keeps its import instead of becoming a placeholder. The report lists each one under `kept` with the reason.

@josephfarina
