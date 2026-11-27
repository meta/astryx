---
'@astryxdesign/cli': patch
---

[experimental] The icon-set doctype's `drag` definition becomes a built-in one, as Core's shared icon names gain `drag`. An icon set maps every built-in definition, so `astryx integration check` reports `icon_builtin_definition_missing` for a set without `drag` until it maps one.

@ernestt
