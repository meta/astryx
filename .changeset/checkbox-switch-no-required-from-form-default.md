---
'@astryxdesign/core': patch
---

[fix] `CheckboxInput`, `Switch` and `CheckboxList`: in a `FormLayout` with `defaultOptionality="required"`, an unchecked box, an off switch or an empty checkbox group no longer carries `aria-required`. A screen reader used to say "required", which on a checkbox means "must be ticked", while the form still submitted. Unchecked or off is an answer, so these controls take no required state from the form default. A `CheckboxInput` or `Switch` is required only through its own `isRequired`, which still sets `aria-required` and native `required`. The "Optional" and "Required" labels follow the same rules as on every other field. No code change is needed (WCAG 4.1.2). (#9664)

@cixzhang
