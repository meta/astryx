---
'@astryxdesign/core': patch
---

[fix] Taps that start typing in a search field raise the touch keyboard. A tap on a Typeahead's selected value (edit mode) and a tap on the clear button of a Selector or MultiSelector search row now focus the input inside the tap itself instead of one frame later; iOS raises its keyboard only for a focus made while the browser is still handling the tap, so the deferred focus left a caret with no keyboard until a second tap. A clear tapped while the keyboard is already up keeps it up, as before. Introduced in #8158; final-state evidence (#8247).

@vjeux
