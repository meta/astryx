---
'@astryxdesign/core': patch
---

[fix] ComplexSelector: the trigger is now a combobox whose popup is a dialog, so a screen reader hears when the field is required (`aria-required` was ignored on the old button role). With `renderTrigger`, the caller's control receives the same `role`, `aria-required`, and `aria-disabled`, is named by `label` unless the selector is given `aria-label` or `aria-labelledby`, and a disabled control keeps its tab stop but does not open. Button keeps a caller-supplied `aria-disabled` and `aria-busy`, so a Button used as that control carries the selector's state. Tests that find the trigger with `getByRole('button')` should use `getByRole('combobox')`.

@cixzhang
