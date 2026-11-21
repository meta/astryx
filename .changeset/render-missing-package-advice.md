---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render`: when a page imports packages that are not installed, the suggested install line now follows the page's own package, and no line is offered where running it would install in the wrong place. The page's package decides the package manager. When its lockfiles disagree, the message names them and suggests no install, where it suggested `npm install`. For a page in another package than the folder you run from, the message names that package and the line to run there, since the line run here would add the packages to this folder's package. In a folder that no `package.json` holds, the message says to install them in the project that uses the page, and suggests no install, since an install there would make the folder a project.

@josephfarina
