---
'@astryxdesign/cli': patch
---

[experimental] When an unknown top-level word such as `share` or `export` suggests `astryx experimental export`, the reason now says what the command is for, as its help line does: one self-contained HTML file from a page built with Astryx components. It used to say "a page as one shareable HTML file", which also read as an offer for pages that do not use Astryx. The command's summary in `astryx experimental --help` and `astryx experimental export --help` says the same ("Export a page built with Astryx components as one self-contained HTML file, or turn one back into a page"), and the group's example is "Export an Astryx page as one HTML file".

@josephfarina
