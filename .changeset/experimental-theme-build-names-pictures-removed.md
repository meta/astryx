---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: every build names the pictures it removed, so `editor show` and the preview commands say so too when they build a theme again. A picture run whose browser fails part way says which pictures it took and which it did not. A render that fails on two copies of React points at the package manager's listing of them instead of `doctor`. `show --section` offers a section only within a typo of what was typed, else the whole sheet; `preview add --top` offers the typed number read exactly or brought into range, else the default; `preview add --template` offers a default page (overview, components, colors) within a typo. A base theme whose fonts come from a remote stylesheet (Google Fonts) gets a note that the previews and their pictures show the next font, and how to install a copy they load. The sheet's template pages render (they bind their file's default export), and a part Core re-exports under a name of its own (ContextMenuItem) gets its module and a cell; a component no Core module exports gets no empty cell.

@josephfarina
