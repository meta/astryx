---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: an `--on` naming several parts (`'button, text-input'`, `button/text-input`, `'button and text-input'`, or spaces) is refused with one command per part named, never a group that one word of the list names. A flag's label after the value (`'red mode: dark'`, `'red state: hover'`, `'red variant: primary'`, `'red part: card'`) is read like the same label before it, and offers `--mode dark`, `--state hover`, `--when variant:primary` or `--on card`. A flag typed inside the quoted value (`'red --mode dark'`, `'4px --state hover'`, `'pill --on button'`) is lifted out into the command offered.

No repair on a part property offers a reset the input did not hold (`0`, `none`, `1`, `auto`, `normal`). A background with one layer too many or an empty one offers the layers typed (`url(a.png), red`), and a bare number on `background` is no longer offered as a px position. `border-radius round` offers `9999px`, `opacity half` offers `0.5`, `content Hi` offers the text quoted, `font-weight heavy` its number and `text-transform caps` uppercase; other words (`padding large`, `box-shadow soft`) point to `how`, and `2 spacing units` is no longer read as `2px`. A number or size given as a font family (`--font-family-body 700`) is refused as a weight or size, never quoted into a family.

A word with a negation (`not round`, `rounded-none`, `not bold`, `no caps`, `not red`) is never offered the word it negates: corners offers `square` (and reads `rounded-full` and `rounded-[12px]`), the rest point to `how`.

@josephfarina
