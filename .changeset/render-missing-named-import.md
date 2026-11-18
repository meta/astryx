---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` refuses a page that imports a name its module does not export, as a build refuses it, with `ERR_RENDER_COMPILE`: "The page does not compile (src/page.tsx, line 3): @astryxdesign/core has no export Chart". It checks named imports in the page's own modules from those modules (not from a CommonJS one, which a bundler reads by interop), from Astryx packages and from StyleX variables modules (`.stylex`), and an element drawn as `<Name.Member>` whose export has no such member. It counts only names the page uses as values, so a type imported without `type` is fine, and a file the page reads as text (`?raw`) is not checked. The script's build names the file and the module the same way. An import of a package subpath the package does not export (`@astryxdesign/core/Chart`) is refused the same way: "@astryxdesign/core has no export ./Chart". Before, the render named what the missing import broke, not the import: `ERR_RENDER_FAILED` with "Element type is invalid" for a missing component, `ERR_RENDER_FAILED` with "… is not a function" for a missing function the page calls as it loads, `ERR_RENDER_SCRIPT` for a name only the script uses, and a missing `.stylex` value rendered without its style and with no error.

@josephfarina
