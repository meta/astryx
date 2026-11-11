---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview`: safer adds, removes and starter apps.

- Preview pages go in `_pages/`, a folder Next never routes, so a preview at the project root or in `src/` no longer turns on the Pages Router. A preview an older release wrote into `pages/` is moved on the next add or remove.
- A refusal deletes nothing: `remove <page>` loads the theme before it deletes a file, and names the whole-preview remove when the theme does not load. A theme that is gone is replaced by the app's own theme, with a note.
- Only files the preview wrote are replaced or deleted, and never one changed by hand since (theme-preview.json records a hash of each). `remove` names the files it kept, the ones already gone, and the ones it wrote again.
- Files are staged and renamed into place together; a failed write puts every file back and is refused with `ERR_WRITE_FAILED`.
- A damaged theme-preview.json is refused with `ERR_THEME_INVALID`, naming the file and the way out, in add, list and remove.
- `--path` is refused when it is a file, in `themes/`, `node_modules/` or a Pages Router folder, in a folder Next does not route, or written with Windows separators, `~` or white space at either end. The open line drops route groups and encodes each folder name.
- Without `--path`, list and remove find a preview recorded for a theme.
- `add`: an empty `--template` is refused; a block passed to `--template` says it is not a page and suggests page templates as commands; `--top` is taken as typed and only with a description; a description may be several words without quotes, and only its first 40 different words are ranked; a package that is named but not installed counts as missing; a changed theme writes the default pages again; a page file an interrupted run left behind with the same text is taken over.
- Suggested commands are shell-safe, and a wrong `--theme` names the closest editor theme.
- `list`, `remove` and `preview app` refuse extra arguments.
- `preview app`: the app is written into a temp folder and moved into place, so a failure leaves nothing; folders inside the routes, `themes/` or `node_modules/`, files, dangling links and odd names are refused; a folder with only `.git` counts as empty; every open font the theme names is added with a pinned range; the Colors page is included; a one-mode theme starts in its mode; a stale theme build is rebuilt first; the home page links to the preview, the `.gitignore` covers `node_modules`, and the open line is quoted.

@josephfarina
