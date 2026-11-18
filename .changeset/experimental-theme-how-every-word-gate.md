---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` checks that a write shows what the question names. A state, a mode, a typed color, a removal, an except, or the thing to change (a shadow, a border, corners, padding, an on-color) that is said in a clause but missing from every step means the clause was not read. Nothing is written, and the answer says what was read and what was not. For example, "card shadows at 30% opacity" no longer fades the whole card, and "on-accent text black" no longer changes the main text color.

Other readings:

- **Excepts said first:** "except cards, …", "other than …" and "apart from …" before the ask are read as excepts.
- **Lists with articles:** "the blue, the green and the red ones" names each item.
- **Removals:** "remove X from A and Y from B" removes both.
- **Kept states:** a kept state keeps what Core draws there ("tabs blue except the selected one").
- **States on part anatomy:** a state goes to a part of the part's own anatomy only, never to sample content.
- **Examples:** a "for one, add --when" example stays in the answer's words. It is never listed as a step.
- **One-word removals:** "borderless", "un-outlined" and "shadowless" are removals.
- **"Ones" in a list:** "primary buttons and the ghost ones" names both.
- **Mode pairs:** "the accent darker in dark mode and lighter in light mode" answers both halves.
- **Keeps said as unchanged:** "…, buttons unchanged" is a keep.

`set` reads an option written after `--` with the reason and the line without `--`. `undo` reads an unquoted list of settings ("undo t accent, corners and spacing") the same as a quoted one.

@josephfarina
