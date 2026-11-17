---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` names every package the page and its own modules import that is not installed, in one refusal, before it runs the page, with one install line for all of them. An Astryx package (a theme, say) counts as installed outside a project only when the CLI's package set holds it; otherwise it is named with the rest. Before, it named only the first, so a page that needed three packages took three failed renders. The message and the install suggestion name every package. An import the page's code uses only as a type, or not at all, does not count, as a build drops it. A package stylesheet that is missing is still a warning, as before.

@josephfarina
