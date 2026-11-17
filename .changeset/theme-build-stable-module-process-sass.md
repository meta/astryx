---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build`: a theme file is read for its theme, and nothing it does while loading breaks the command.

- A Sass, Less, Stylus or PostCSS stylesheet a theme module imports loads as an empty module, as a `.css` import does.
- An import that the project's tsconfig `paths` or `baseUrl` maps (`@app/c`, `lib/c`) is named as a path alias, never offered as a package to install.
- With `--out` naming another stylesheet, the built module's usage comment names the stylesheet written.
- When a build of several files stops at a failure, the error says which outputs the files before it wrote, in text and `--json` alike.
- A default export that holds themes (`export default {light, dark}`) is named as such.
- A theme module that calls `process.exit` while loading is refused by name; `--check` never passes without its verdict.
- A value a theme module throws that is not an Error is shown as it is.
- What a theme module prints goes to stderr, so `--json` output stays valid.
- A timer a theme module leaves running no longer keeps `theme build` or `--check` from exiting.

@josephfarina
