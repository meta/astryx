---
'@astryxdesign/cli': patch
---

[feat] An integration can say how its apps add a dependency: `installGuidance` in its manifest, one line where `{packages}` stands for the packages to add. Where the CLI prints a step that adds packages the app lacks (template readiness, `init`'s theme step, `doctor`'s fixes, theme hints and errors, `theme eject`, the theme editor's notes, and `discover`'s add commands), it prints that line instead of the package manager's command; the `template` and `theme eject` receipts carry it as `installGuidance` beside `installCommand`. Steps that move Astryx's own packages to another release, or add `@astryxdesign/cli` at the project's Core release, keep the package manager's command. Without guidance, doctor's Core and peer-dependency fixes, `theme build`'s no-Core message and `render`'s missing-package suggestion now print the project's package manager in place of a fixed `npm install`. Two different lines cancel out, and a new `install-guidance` doctor check warns. An invalid line is ignored with an `invalid_install_guidance` warning.

@josephfarina
