---
'@astryxdesign/core': patch
---

[fix] A page that renders a Button or an Icon but no `Theme` no longer loads the theme-rule generator on first load when its bundler keeps whole modules, as Next.js with Turbopack does when the app also uses `useTheme` elsewhere (for example through Toast). A page that renders `Theme` still loads the generator, because `Theme` compiles theme CSS at run time. Token resolution now reads the unset status-role defaults from a small module that the generator also reads, instead of importing the generator. Every resolved token and every generated rule stays the same. No API changes.

@cixzhang
