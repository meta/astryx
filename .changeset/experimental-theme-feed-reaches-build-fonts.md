---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme …`: settings reach the build, and fonts load as the theme shows them.

- A theme source that spreads the `defineTheme` result and replaces its `components` (`{...defineTheme(…), components: {}}`) is refused by name, as one that replaces its tokens is: a part setting would be saved and never built. Give your own components inside `defineTheme({…, components: {…}})` instead.
- Italic text (`font-style: italic`, or `italic` in a `font` shorthand) loads the installed package's italic stylesheets beside the upright ones (`400-italic.css`, a variable package's `wght-italic.css`), so the browser no longer draws a slanted copy.
- Noto Sans, Noto Serif and Noto Sans Mono are named system fonts of Android, ChromeOS and Linux, and Cantarell, Ubuntu and Ubuntu Mono system fonts of Linux, so a system font stack that names them is not told it needs a package.
- A heading weight given with no type scale is offered `editor set <theme> headings <weight>`, which changes only the heading weight. The hint no longer says to add a type scale, which would also resize all text. A weight number outside 1 to 1000 is no longer echoed as the example.

@josephfarina
