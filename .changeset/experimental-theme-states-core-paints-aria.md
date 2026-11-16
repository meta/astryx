---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`:

- States Core paints from an ARIA attribute are states `set` names: `current` (a pagination's current page), `pressed` and `expanded` (an open menu button), built as that attribute.
- Several states at once (`--state checked+disabled`) are taken where Core paints them together, and `how` names them that way.
- A group styled alike (checks, inputs) spreads a setting only to members Core draws alike: a checkbox's corners stay off the round radios.
- The part data reads what a checkbox list and a menu holds (its rows, a row's icon), so scoped tokens on them are taken.
- A fill drawn by an element inside a part (a slider's filled range) is reached through the token it is painted with.

@josephfarina
