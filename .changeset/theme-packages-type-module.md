---
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-chocolate': patch
'@astryxdesign/theme-gothic': patch
'@astryxdesign/theme-matcha': patch
'@astryxdesign/theme-neutral': patch
'@astryxdesign/theme-stone': patch
'@astryxdesign/theme-y2k': patch
---

[fix] Theme packages declare `"type": "module"`, so bundlers and Node read the `./built` entry as the ES module it is. Before, it was an ES module in a `.js` file in a package without a `type`, which tools that follow the package's `type` read as CommonJS. Every export subpath stays the same. The CommonJS build of the source entry is now `dist/source.cjs` behind the same `require` condition, with its own CommonJS declarations (`dist/source.d.cts`), so TypeScript types each condition in the format it loads. As before, `require('…/built')` loads an ES module, so it needs a Node version with `require(esm)` (22.12 or later). Deep imports that reach past `exports` into `dist/` change too: `dist/source.js` is now `dist/source.cjs`, and a `require` of `dist/<theme>.js` gets an ES module (`require(esm)`, Node 22.12 or later).

@cixzhang
