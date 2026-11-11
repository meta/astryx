---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: fixes from a full review.

- `preview app --theme` copies the whole theme folder, generated colors included, byte for byte, so the new app type-checks.
- `preview app <dir>` writes only into a new or empty folder (its `--overwrite` option is gone): a folder that is not empty is refused, with a free folder name to use.
- Translucent text and backgrounds are measured as drawn: each is laid over what is under it before contrast is checked.
- Two commands can run at once: each render uses a folder of its own.
- A change that is saved but cannot be checked says "saved, not checked" and exits 0.
- A light-only or dark-only theme applies only its own mode's settings and names the others, writes one value for the colors it sets, and its in-app preview starts in that mode with no switch.
- A damaged undo history no longer breaks `set` (a new history starts, with a note), and `undo` says how to fix it.
- Colors are picked against the theme's own exact page and surface colors.
- A change that changes nothing builds nothing and adds no undo step.
- `undo <theme> <thing>` says what applies now (`now`).
- `show` names the radius token each part reads, or says it is unknown.
- `how` answers border-only questions without a fill.
- The preview picker matches app and article pages by phrase: a news story or blog post gets an article page, never a record page; a description no page relates to (no phrase, and fewer than three words or two fifths of them matched) is refused.
- A preview outside the routes folder says the app does not serve it.
- More than eight contrast problems end with "and N more".

@josephfarina
