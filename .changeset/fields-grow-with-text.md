---
'@astryxdesign/core': patch
---

[fix] Form fields grow to hold their text when text is enlarged, instead of the text running across their borders. At the default text size each size keeps its height (28, 32 and 36 px).

- NumberInput: a standalone field grows to hold its text line; with steppers, the row also grows to hold the enlarged stepper icons.
- DateInput, TimeInput, DateTimeInput and DateRangeInput: a standalone field grows to hold its text line.
- FileInput: in input mode the field grows, so its prompt, wrapped or not, stays inside its borders. A prompt that wraps in a narrow field grows it.
- InputGroup: the row grows to hold a text line, and its members, Button addons included, keep filling it.

@cixzhang
