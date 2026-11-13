---
'@astryxdesign/cli': patch
---

[fix] A dry run of `astryx upgrade` no longer tells you to review a `.astryx-conflict` file it has not written. When a copied ShadCN composition conflicts with a newer release, the dry run now says that `--apply` writes the file for review, and an apply still names the file it wrote. The JSON result is unchanged.

@parinith-web
