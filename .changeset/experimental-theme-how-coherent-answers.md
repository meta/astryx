---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` answers more consistently:

- **No rounding anywhere:** "no rounding anywhere", "square corners everywhere" and "… badges and switches too" also square the parts drawn as pills (`--radius-full 0px`), and the answer names those parts.
- **A part and an aspect with no change** ("toast background") say what to look at instead of "No match".
- **Thick borders on everything:** "thick black borders on everything" sets the shared border width and both border colors (inputs draw the emphasized one). It also adds a border to the surfaces that draw none (dialogs, popovers, menus). "thick borders" moves the width one pixel up.
- **Status and focus colors:** a border color written on a part keeps the colors Core gives it by status and focus (an error input's red border, the focus border).

@josephfarina
