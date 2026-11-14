---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: the editor judges a theme's source by the theme a build of it loads, its name and the theme it extends after every spread and repeated key, so a spread or a second `extends` that replaces the settings is refused, a spread const or a namespace import of the settings is accepted, and a helper theme read first is named with how to make the build read the theme. `compile` takes an `--out` as the theme's default stylesheet only when it is that same file, refusing a name that differs only in case on a case-sensitive disk and a folder form of the stylesheet before anything is written; builds a source named through a folder link under its own path; says in JSON what the app copy write did (`appCopy`, `appCopyStale`); names the Fontsource package for an editor theme's fonts, and gives the typography recipe in the runner form in JSON too. Every suggested compile passes the same checks before it is shown. Fonts follow every family the build writes, a part's own font included. A module that imports a file beside the theme keeps the app copy as it was and says why. A change of mode on a theme the app lists names `theme add`.

@josephfarina
