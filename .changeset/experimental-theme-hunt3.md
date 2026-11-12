---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: the third pass of fixes.

- Saved settings are checked on load as `set` checks them, including where they apply. Each setting the editor no longer accepts is listed with a command that removes it. Each command works on its own, however many are listed. A setting that is not accepted never reaches the build.
- `corners more` and `less` read the base theme's radius in any unit. A saved corners value must be a rung or a pixel size.
- `undo <theme> base` and `undo <theme> mode` go back to what the theme was made with. `undo <theme> headings weight|tracking` removes that half. A value given to `undo` is compared as `set` reads it. `undo <theme> <thing> <part>` names `--on <part>`. A blank `--on`, `--when`, `--state` or `--mode` is refused.
- If a group setting hides a value, setting the value again moves it last, so it wins. A change that changes nothing writes nothing, the preview included. A newer `background` wins over an older `background-color` on every variant. A color on text, a heading or a link is refused, naming the text color token, because the color prop decides it. A quoted string may hold `<` or `>`, and a value may span lines.
- A `<theme>.theme.ts` that no longer extends its settings is refused, and `show` says so. A built-in theme's name is refused for `new`. A theme written by hand or ejected gets a clear refusal from the editor. In both cases the refusal gives a command that works.
- `show` rebuilds a damaged build and says so, and `show --section --png` photographs the section's own sheet. A damaged `palette.config.json` is made again from the settings, and its text is kept as `palette.config.damaged.json`. The preview route compiles for names like `b-2`. `preview.html` is the same on every build, and a change of letter case alone is not listed as a token change.
- Refusals show control characters as escapes. Suggested commands quote their words for any shell, and fill in real values. A misspelled property points to the property.
- In `experimental theme`, a moved or misspelled subcommand names where it is now. A bare group answers `--json` with its help. `--detail compact` and `--dense` print the status line alone. `compile` refuses the editor's own settings files and `--family` for an editor theme. `compile --check` checks an editor theme by the editor's rules, and waits for a change in progress. The editor's builds write the same headers as `compile`. Compile errors and stale checks name the experimental commands and never change text that you typed. `add`, `use`, `remove` and `eject` explain what an editor theme is.

@josephfarina
