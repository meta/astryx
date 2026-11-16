---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`:

- An element named in, of or after a part ("the checked indicator in checkboxes", "the indicator in selects", "the knob of switches", "the tabs' indicator", "the hovered item in menus in cards", "today's date in the calendar", "the highlighted option in the selector") is the part that place draws it as: the place itself by its name, a part named after it, a lexicon phrase said owner first, a part drawn inside it, or the one whose own state the words name, never the place or every element in it. "The buttons' icons" are the icon tokens on the buttons.
- An element its place has no part of its own for ("the close button of toasts", "the hovered item in the context menu", "the today date in the date picker", whose calendar the part data draws closed) writes nothing, and the answer says why.
- A state read from the part and not said ("the dot in radios") is let go when the element has none.
- "The checked and disabled checkbox" is the box in both states at once, in the part's own order; `--state isPressed+hover` on a toggle button is taken (Core marks isPressed with aria-pressed); "highlighted" names the highlighted state.
- What a line inside a part draws is each part on its element (a dropdown menu's own divider draws its separators), and a part whose paint is a line takes the divider answers: "the menu separators red" is `--color-border` on the menu's own divider, those separators only. PART_DATA_VERSION 24.
- A token a variant never reads is refused with a line that keeps the state and the mode asked.

@josephfarina
