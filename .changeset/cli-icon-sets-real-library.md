---
'@astryxdesign/cli': patch
---

[experimental] Icon sets: wrapping a large icon library that names its looks in its exports works in seconds and gives one icon per glyph. Only the experimental icon commands, the icon-set guide, and `integration check` on an icon set change.

- **Large libraries.** `experimental icon new-set --from` reads a library of 20,000 exports in about ten seconds instead of minutes, and in text mode says on stderr that it is reading and what it found. `iconNewSet` and `iconAdd` report reading progress for large modules through the shared `logger` (stderr, text mode only); called directly, they stay silent until `logger.setSilent(false)`.
- **Libraries of looks.** A library whose export names end in style, size and weight words (`XOutline24WGHT500Icon`), never direction words like `Up` and `Down`, gives one icon per glyph, named `x` (`XIcon`), in the look the set's default variant names, else the library's usual default; suggestions and `add` name icons by glyph, `add --variant filled --all` picks each glyph's filled look, a refresh keeps every icon an earlier release wrapped, and a refresh with a new `--default-variant` moves each glyph to that look. Every command that records the default variant takes it from the look each icon's export draws, refuses a look word the library does not have, and never adds a second export of an icon.
- **Variants on an existing set.** `experimental icon new-set <set> --variants outline,filled` without `--from` declares variants (a set with icons keeps its default variant, or, with none declared, takes the look its icons draw; a set whose library's export names name no looks keeps it on a refresh too, refuses `--variants` that leave it out, and the refusal names the `add --variant` run that adds the other look), and `--display-name` and `--description` rewrite the descriptor, in place; `add --variant` names an undeclared variant with that command.
- **Commands that run as printed.** Every command `new-set`, `add` and `map` print names the set, with `--set` where the command takes it; the commands `add` lists repeat `--default` and `--id`; `--new-definition` and `new-definition` take kebab-case as the definitions list shows it, and an unknown `--definition` suggests a name the next command takes.
- **Search.** `experimental icon star` no longer offers `start`, a plural matches its singular, `go home` finds the icon mapped to `home`, and a letter or two never matches inside a word.
- **Checks.** A set's own definitions pass `integration check --strict`, and the generated module and its declaration file pass after a formatter rewrites them.
- **Theme icons.** Each `themeIcons` entry is sized to its box by CSS, so a component that writes its own size attributes still fills the theme's icon box.

@josephfarina
