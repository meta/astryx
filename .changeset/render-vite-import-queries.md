---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render` gives an import with `?raw` the file's text, and a stylesheet imported with `?inline` its text (not added to the page), as Vite does by itself. It used to give a JSON file's object for `?raw`, fail on a text file such as `notes.txt?raw`, and refuse a stylesheet with `?inline` as CSS Modules. Any other query loads the file as it loads without one, as before: an image, font or media file as its address (`?url`, `?inline`, `?w=400`), a module as itself. `--reverse` gives back the files the render carries; a `?raw` file of a kind a render never carries, such as `notes.md`, is named in a `not-embedded` warning.

@josephfarina
