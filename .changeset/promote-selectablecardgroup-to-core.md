---
'@astryxdesign/core': patch
---

[feat] Promote `SelectableCardGroup` to Core, imported from `@astryxdesign/core/SelectableCardGroup` or the package root. SelectableCardGroup is a set of SelectableCards, each with a `value`, that has the semantics of its selection. One choice (`type="single"`, the default) is a radio group: the cards are native radios, so the set is one tab stop, the arrow keys move and select, screen readers speak the position ("2 of 3"), and the chosen card submits its value under `htmlName`. Several choices (`type="multiple"`) are a named group of checkboxes. The group takes a controlled `value` and `onChange`, a `label` and an optional `description` through Field, `isDisabled`, and `orientation`. As every component that composes Field does, it takes no root `xstyle`, `className`, or `style`: `containerXstyle`, `containerClassName`, and `containerStyle` style the Field box, and `controlXstyle`, `controlClassName`, and `controlStyle` style the group element that lays out the cards.

@ernestt
