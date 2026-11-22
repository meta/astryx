---
'@astryxdesign/build': patch
---

[perf] Astryx's stylesheets restyle less when a hover, a focus or a press changes. Each StyleX relation that ends in a bare `*`, such as the one `stylex.when.ancestor(':hover')` prints, now names its rule's own class: `:where(.marker:hover :where(.c))` instead of `:where(.marker:hover *)`. Chromium keeps one invalidation set for each pseudo-class for the whole document. One such relation makes it restyle the whole subtree of every element whose state changes. The prebuilt stylesheets, the source builds, and the app rules that the PostCSS and Vite integrations compile print the keyed form. Each rule matches the same elements with the same specificity. A relation that ends in a bare `*` in any other stylesheet on the page still restyles whole subtrees. No API changes.

@vjeux
