---
'@astryxdesign/core': patch
---

[fix] A page that renders a Button or an Icon but no `Theme` no longer loads the theme-rule generator on first load when its build keeps whole modules or every re-export: Next.js with Turbopack when the app also uses `useTheme` elsewhere (for example through Toast), and hosts that lend each package entry whole to other bundles. A page that renders `Theme` still loads the generator, because `Theme` compiles theme CSS at run time. Token resolution now reads the unset status-role defaults from a small module that the generator also reads, instead of importing the generator. The module that defines `defineTheme` no longer re-exports the CSS generators; `@astryxdesign/core/theme` and `@astryxdesign/core` still export them by the same names. Every resolved token and every generated rule stays the same. No API changes.

@cixzhang
