---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render`: when a page imports packages that are not installed, the suggested install line uses the project's package manager (for example `pnpm add`) and the CLI's version ranges (such as `recharts@"^3.10.1"`), as `astryx template` and `astryx build` do, where it always said `npm install`; when the project's lockfiles disagree, the message says so and suggests none, and for a page in another package than the folder you run from, the message names that package and the line to run there, since the line run here would add the packages to this folder's package. In a folder that no `package.json` holds, the message says to install them in the project that uses the page, and suggests no install, since an install there would make the folder a project.

@josephfarina
