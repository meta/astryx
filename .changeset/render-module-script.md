---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export`: an exported page's script is a module script when it runs the same in strict mode, so it runs once the file is parsed: a browser paints the page before the script draws it, and on the pages measured a small page shows its first paint about 200 ms sooner on a slow phone, with about the same time until it responds. A page whose script bundles a file that is not an ES module and does not ask for strict mode (CommonJS code, or a side-effect file with no `import` or `export`), or code that reads `document.currentScript`, keeps a classic script.

@josephfarina
