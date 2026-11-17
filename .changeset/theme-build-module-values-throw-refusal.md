---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build`: a theme module that throws from a microtask it queues while it loads is a refused load (`ERR_THEME_LOAD`), not a crash; a listener a theme module adds to `process` (`process.on('exit', …)`, `beforeExit`) goes with its load, so it no longer sets the command's exit code, prints after the `--json` envelope, or keeps the command from ending. `--out` naming a stylesheet's source map (`p.css.map`) is refused, and a slip after `.css` (`p.css.bak`) is told the stylesheet name meant (`p.css`, not `p.css.css`).
`astryx experimental theme compile` refuses a theme whose own values throw when read (a `tokens` getter or Proxy) as the build does, with no stack trace or `ERR_UNKNOWN`.

@josephfarina
