---
'@astryxdesign/core': patch
---

[feat] `SelectableCard` takes `value`. A card with a `value` in place of `isSelected` and `onChange` is a member of the `SelectableCardGroup` around it, and the group gives the card its selection, its input and its disabled default. In a single-choice group the card is a native radio that selects and never deselects itself; in a multiple-choice group it is a checkbox that submits its `value` under the group's name. The new `SelectableCardMemberProps` type describes a member. `SelectableCardProps` stays the interface it was and gains only `value?: never`, so TypeScript rejects `isSelected` or `onChange` beside `value`. Outside a group, a card with a `value` warns in development and stays unselected. A standalone card does not change.

@ernestt
