---
'@astryxdesign/core': patch
---

[feat] `CheckboxList` takes `isOptional`, as `RadioList` and `CheckboxInput` do. It shows the optional indicator after the group label, so an optional checkbox group can say so, including as the exception in a `FormLayout` with `defaultOptionality="required"`. Under `defaultOptionality="optional"` the indicator stays hidden, as for every field. A checkbox group has no required state: with or without `isOptional`, its checkboxes no longer take `aria-required` from a required form default, and it adds no native `required`.

@ksying
