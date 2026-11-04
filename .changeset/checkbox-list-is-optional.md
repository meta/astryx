---
'@astryxdesign/core': patch
---

[feat] `CheckboxList` takes `isOptional`, as `RadioList` and `CheckboxInput` do. It shows the optional indicator after the group label, so an optional checkbox group can say so, including as the exception in a `FormLayout` with `defaultOptionality="required"`. Under `defaultOptionality="optional"` the indicator stays hidden, as for every field. A checkbox group takes no required state from a form default: with or without `isOptional`, its checkboxes carry no `aria-required` from it, and it adds no native `required`. (#8770)

@ksying
