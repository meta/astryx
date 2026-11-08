---
'@astryxdesign/build': patch
'@astryxdesign/cli': patch
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-chocolate': patch
'@astryxdesign/theme-gothic': patch
'@astryxdesign/theme-matcha': patch
'@astryxdesign/theme-neutral': patch
'@astryxdesign/theme-stone': patch
'@astryxdesign/theme-y2k': patch
---

[fix] dependency floors move to current releases: the build package needs autoprefixer 10.6.2, browserslist 4.29.5 and lightningcss 1.33.0; the CLI needs ignore 7.0.14, jscodeshift 17.4.0, linkedom 0.18.15, zod 4.6.7 and @stylexjs/babel-plugin 0.19.1; each theme needs lucide-react 1.66.0. Peer ranges do not change.
@cixzhang
