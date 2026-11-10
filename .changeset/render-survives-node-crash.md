---
'@astryxdesign/cli': patch
---

[fix] [experimental] `astryx experimental render` no longer dies silently with exit 139 when Node itself crashes while it renders a page. The page now renders in a separate process, so a crash (a crash signal, or a crash status on Windows) ends only that process, and the render fails with `ERR_RENDER_FAILED` and a message that names the Node version and path; a signal that stops it names them too. That process ends when the CLI ends, so a page that never finishes does not outlive a stopped CLI. Some Node builds crash in `Intl.Segmenter`, which components such as Avatar use to split text: on such a build the render runs the page once more without `Intl.Segmenter` and adds a `node-crash` warning that names the Node build and says the output may differ slightly (a joined emoji, a flag, or a letter with a separate accent mark in initials), so pages with Avatar render again.

@josephfarina
