---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export`: the file drops the web font faces that no character in the page, its stylesheet or its script reaches, so a page with a web font is smaller.

- A font package ships one face per script (Latin, Latin Extended, Cyrillic, Greek, Vietnamese) for each weight. A browser loads only the faces its text needs, but the file used to carry all of them. A page that imports a font package and never uses its family now carries none of its faces. An English page that uses two weights of a font package is 10% smaller.
- A face stays when its font family is named outside the faces (in a rule, a token, the markup or the script) and its `unicode-range` covers a character the page can draw: one in the markup, the script or the stylesheet (a `content` string). A character written as an escape (`\u039a` in the script, `\41f` in a stylesheet) counts too, so text that a later view, a menu or a hover shows keeps its face. A family name counts as CSS reads it (`Gill\ Sans` is `'Gill Sans'`), also when the script holds it as escapes. A list or counter style with other letters (`lower-greek`, a `@counter-style`), or a `text-transform` that changes the characters (`full-width`), keeps every face of a named family, whether the stylesheet (directly or in a custom property), the markup or the script sets it. Each character's other cases count too, for `uppercase`.
- The cut runs before the font files are read, so a dropped face is not counted in `images` and gives no missing-file or network warning.
- Some text is not in the file, so no face is kept for it: text a reader types, text the script builds from character codes, and text the browser writes in the reader's or the page's locale (a date field's placeholder, Intl-formatted dates and numbers). Such text in a script that no kept face covers is drawn with the next font in the family list.
- Only the exported file is cut. The theme editor's previews keep every face, so text typed into them draws in its font.

@josephfarina
