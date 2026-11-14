---
'@astryxdesign/cli': patch
---

[feat] `astryx component`, `astryx hook` and `astryx template` now point to the right command when a name they do not find is an entry another lookup command reads, as `astryx docs` already did. One rule serves all four commands: when the name is exactly a component, hook, template or docs topic, in any case and with or without spaces and hyphens (a hook also answers to its name without `use`), the first suggestion is the command that reads it, such as `astryx hook useHotkeys` for `component use-hotkeys`, `astryx component Button` for `template Button`, or `astryx docs principles` for `hook principles`. A component wins over a hook, a hook over a template, and a template over a docs topic. The error code and the `{name, reason}` shape stay, and the hint takes the last suggestion's place, so the list does not grow; when a command had no suggestion, the hint is the only one. Docs keeps its rule that the hint stands alone when no topic shares a word with the name, and `component` keeps its example-block message, which already names `astryx template`. Names that resolve still resolve as before, and the check reads file names first, so a miss stays fast.

@josephfarina
