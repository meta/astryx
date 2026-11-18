---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` and `compile` name the real problem and the real place:

- when a build of `<theme>.theme.ts` reads another export named for the theme (a default export beside `<theme>Theme`), the refusal says the build reads that export, not the one that extends the settings, instead of asking to put back what is already there;
- a value Core refuses inside a rule it derives from the typography is no longer reported as a value of the file; Core's refusal of a local token's name is named at its line;
- an editor theme that lost `<theme>.settings.json` is refused by `compile` and `compile --check` as the editor commands refuse it, with the line that makes it again;
- a refused value in a part block imported from a file beside the theme (`components: parts`, `parts.button`), or in a theme the source re-exports (`export * from './impl'`), names that file and line.

@josephfarina
