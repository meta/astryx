---
'@astryxdesign/cli': patch
---

[experimental] Icon definitions: a definition can name its `group`, the family of related meanings it belongs to (for example `notification`, `notificationActive`, and `notificationOff`), and Astryx's definitions now name theirs. A set's own definition may join an Astryx group or name its own. `experimental icon --definitions` shows each definition's group; each finder match gains `relatives`, the other definitions in its group with what each means (the text answer names a few under the first match only); with no set installed, each matching definition gains `group` and `relatives`; and a definition's docs page names its group's other members. Groups are information only: ranking does not change, and stable commands print what they printed before.

@josephfarina
