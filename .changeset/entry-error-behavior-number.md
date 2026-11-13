---
'@astryxdesign/core': patch
---

[feat] NumberInput takes `entryErrorBehavior`, so a form can pass one value to all of its date, time, and number fields. A typed number is complete only at Enter or blur, so both values keep NumberInput's current timing: its rejection, `aria-invalid`, announcement, and `onEntryErrorChange` report appear at Enter or blur, never while a person types. Setting the prop, or FormLayout's `defaultEntryErrorBehavior`, changes nothing a person sees in a NumberInput. Pagination's page box passes `'complete'`, so a FormLayout around it never changes it.

@nynexman4464
