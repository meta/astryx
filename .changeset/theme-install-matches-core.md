---
'@astryxdesign/cli': patch
---

[fix] When an app adds a theme from a package it has not installed, `theme add` and `doctor` now name the install that works. They use the project's package manager. For a theme package that Astryx releases with Core, they name the project's Core release, saved exactly when the project pins Core. A project with no Core yet gets the release of the CLI that answers. Before, `doctor` named `npm install <theme>@latest`, and `theme add` named the package with no version. Each Astryx theme names Core's exact release as its peer, so in a project on an older release, npm refused the install. `doctor` also no longer adds `--package @astryxdesign/cli` to the theme add command, which named the CLI as the theme's package.

@josephfarina
