---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: what it is given is read as meant and checked.

- A dial typed as a flag (`set <theme> --corners round`) is refused as a dial typed with dashes and offered as the dial (`set <theme> corners round`), never an empty token list.
- A token value your `<theme>.theme.ts` gives that `set` refuses (`'--radius-page': 'banana'`) is checked by the same rules: `show`, `set` and `compile` refuse it, naming the token and its line, before anything is built.
- The theme typed as its module name (`brandTheme`) is the theme `brand`, never a second theme.
- A light and a dark color on a part's color (`background 'light: #fff; dark: #000' --on card`) is written as that property's `light-dark()` pair.
- A JSON object of settings passed to `set` gives one set line per entry.
- A font stack with escaped quotes (`\"Inter\", sans-serif`) is read as the stack.
- A state a part lists in camelCase (toggle-button's `isPressed`) is taken in any spelling, and `pressed` suggests it.
- A `mode` or `base` entry inside the settings list is named by `show` as doing nothing there, with the `undo` that removes it.
- A pasted line with two declarations (`accent: red; text-size: 18`) sets the first and says the second was not set, with its own set line.

@josephfarina
