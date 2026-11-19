---
'@astryxdesign/cli': patch
---

[fix] Two packages that add a section with one title to the same docs topic or guide both keep it. Across packages, a section replaces another only when one carries an authored `id` that is the other's key or a title query the other's title answers. When one package's section holds the key another package's later section derives from its title, the later one is read by a key that starts with its package's provider id (its package name unless it sets one), such as `acme-dune-theme-install`, so `astryx docs`, `--index`, namespace reads and search show both. Every other key collision keeps its numeric suffix. Sections of the topic itself still take a replacement from any package, the last configured winning.

@josephfarina
