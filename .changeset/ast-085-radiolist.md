---
'@astryxdesign/core': patch
---

[fix] RadioList keeps disabled radios focusable, blocks their selection and activation callbacks, and describes each radio with the disabled reason. Disabled radios now use `aria-disabled` instead of native `disabled`; their values stay out of form submission, and separate forms can reuse `htmlName` without losing selected values. Hidden or inert selected rows leave the remaining options reachable by keyboard.
@korkt-kim
