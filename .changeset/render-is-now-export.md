---
'@astryxdesign/cli': patch
---

[experimental] The experimental command `astryx experimental render` is renamed to `astryx experimental export`. It still writes a page as one self-contained HTML file, and `--reverse` still turns that file back into its page; its options are the same, and its text output says "Export it again:" where it said "Render it again:". The old name is no alias: `astryx experimental render …` fails, exit 1, with `ERR_UNKNOWN_SUBCOMMAND`, and suggests the run with `export` in its place, keeping the options before it (also as a JSON error with `--json`). An unknown top-level `export`, `render`, `share`, `bundle`, `snapshot` or `standalone` suggests `astryx experimental export` and never runs it, unless the next word is a name another command reads (`astryx export Button` still suggests `astryx component Button`) or the active base does not serve the command. The guide `cli/experimental/render-pages` is now `cli/experimental/export-pages`, and the command's reference is `cli/commands/experimental-export`.

JSON fields that carry the command name now say `experimental export`: the command's entry in `astryx manifest --json` and in `astryx --json experimental --help`, and every suggestion's `name` that names the command. The result types stay `render.page` and `render.reverse`, the error codes stay `ERR_RENDER_*`, and the `render()` function keeps its name. A file written before the rename names the old command in its note; `--reverse` reads it as before.

@josephfarina
