---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render` renders a page outside a project whose StyleX reads Astryx theme variables (`@astryxdesign/core/theme/tokens.stylex`), as many templates do. Such a page stopped with "The page does not compile: Could not resolve the path to the imported file", because the StyleX compiler looked for Core beside the page, where outside a project there is none. The compiler now gets the theme file the page loads from the CLI's own Core, and the page renders the same as it does inside a project.

@josephfarina
