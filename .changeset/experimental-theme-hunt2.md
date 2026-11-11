---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: settings that do what they say.

- An exact token or part property always wins over a dial, whatever the order. A changed setting moves last, so it wins over what came before it. A shorthand set after its longhands says it replaces them. A setting for both modes replaces the one-mode settings it would sit under.
- One mode on a part whose variants each have their own value is refused, with the command that names the variant. A setting saved for a mode a one-mode theme does not have can still be removed. A base theme package that is gone no longer blocks moving off it.
- `--when` must be one property and value, and on a group it must belong to a member, as `--state` must. An empty or repeated `--on`, `--when`, `--state` or `--mode` is refused, and so are extra words after `undo` and `show`.
- `undo <theme> <thing> <value>` removes the setting only when that is its value. Scope flags without a thing are refused. `undo <theme> base` and `undo <theme> mode` set them back to their defaults. A stored setting this Core does not know can still be removed.
- `show` builds the theme again when its settings were edited by hand or built by another CLI; `--section` writes `sheet-<section>.html`, not over the full sheet, and takes any case. A setting listed twice is refused.
- `spacing` scales the base theme's spacing; a corners step starts from the base theme's radius or the whole-theme setting; `corners pill` keeps checkboxes square; `headings` refuses `--mode`; `font` refuses `--when` and `--state` and takes a preset in any case.
- A change that shows nothing says so. A switch of base or mode lists the parts it restyles and the color notes. A misspelled token in `var()` and a typed path or capital letter for a theme get a did-you-mean. Text contrast that is not measured (one variant or state, the soft or outline button) is listed as not checked. The colors in `show` give each mode its own exact value.
- The copied `theme` commands name `experimental theme` commands in their refusals. `editor new` and `editor how` no longer claim to replace stable commands their copies replace. A package.json without Core gets the install command.

- A whole-theme token that no rendered part was seen reading is set with a note saying so, not refused. A part that reads the token the user named takes it for whatever property it feeds. A token named for another variant value (`--color-error-muted` with `--when status:error` on a banner, `--color-icon-pink` on an icon) is taken. A part name such as `constructor` is an unknown part, not a crash.
- A font for one role keeps its font after a whole-theme font, whatever the order.
- Easings, font family lists, `light-dark()` and `color-mix()` colors, shadows and times are checked the way the browser reads them. A shadow may use a token color, any length unit or a stacked shadow token. `var()` with a fallback, relative colors and system colors are taken. A time is at most 60 seconds. A font name may hold an apostrophe. `var( --x )` with spaces is checked for cycles.
- Saved exact tokens are checked on every command; one the rules no longer take names the `undo` that removes it.
- A size change says that phones keep the base theme's reading sizes, and names scale steps outside 9 to 200 pixels. A refusal that suggests setting a property directly names the property that takes the value. Every suggestion `set`, `undo` and `show` give names the theme and a value it takes, never a placeholder.
- The theme lock lives beside the Core the command reads, and a command outside a project takes none. When `show` builds again, it says why: a file missing, another CLI version, settings changed after the build, or a build that did not finish.

@josephfarina
