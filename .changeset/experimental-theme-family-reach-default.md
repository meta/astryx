---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set … --on <part>`: family reach is the default. A change set on one part reaches the members of its family that draw the same thing alike: its group (inputs, checks, menus) or the family role the census reads from its structure (a button's look reaches every part drawn as a button, a menu row's every list row, a dialog's frame every overlay, a selected look every selected item); `--only` keeps it to that part. A part's own setting of the same thing wins over its group's or family's, whatever the order. A later setting on another member of a thing its family already carries is that member's drill-in, saved with `--only`, with the line that changes the whole family. The result names the parts written, the members that keep their own and the `--only` line (`group.members`, `group.kept`, `group.only`); `show` marks each setting that reaches a family and each drill-in (`reach`); one `undo` takes a spread back, and undoing a drill-in gives the member the family's look again. `how` writes a look said of one member on that member, and the set reaches its family.

@josephfarina
