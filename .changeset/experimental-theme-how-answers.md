---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: answers that are safe, bounded and right.

- Every command `how` suggests names your theme (the only one, the one changed last, or `--theme <name>`; with no theme, `my-theme`, made first), has a real value instead of a `<placeholder>`, carries no shell comment, and is checked as `set` checks it: a command that `set` would refuse, or that changes nothing, is left out, and the answer says why.
- Plain-words questions read negations and more or less ("remove shadows from cards" gives `box-shadow none`, "less rounded cards" gives `corners less`), the values you type (hex, rgb(), lengths, dashed), states (hover, focus, checked, selected, disabled, pressed, invalid), dark or light mode, several changes in one question, a few words in other languages, and small typos. A question with no answer says so in JSON too, with the next commands to try.
- `how <part>` writes each condition as the `--when` and `--state` flags `set` takes, or says why no flag reaches it; lists every state `set` accepts; and says when a part has no recorded reads, with commands that still apply.
- `how <token>` says when no part in the part data reads a token but Core's stylesheet does.
- Lookups take any case, plurals and token names without dashes; `--list` takes the kind anywhere, singular or plural, `--list=tokens` and a filter that starts with `--`, and refuses `--list` given twice.
- Pictures: a header bigger than 40 million pixels or pixel data shorter than the header says is refused at once; damaged files are refused; see-through pixels are skipped; `--at` gives each point's alpha and refuses points it cannot read exactly or that fall outside the picture; any file name works, and other formats are refused by their bytes.
- `set` refuses a value that holds a `<placeholder>` or a `#` comment.
- A damaged part-data cache is built again, the cache is written whole, and a lookup in an app with no themes leaves no `themes/` folder.
- Text and JSON start commands the same way, and text output escapes control characters in what you typed.

@josephfarina
