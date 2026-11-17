---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` warns a misspelled field that reaches the theme input through a spread (`{...shared}`, `onDark: {...dark}`, an imported object), or in a theme the file imports and then exports, at the line that writes it; a BigInt typography value held in a const is named too; and a `[light, dark]` pair whose half is empty or a number, which `light-dark()` does not take, so the browser drops the value. A boxed primitive in a part (`padding: new String('4px')`) is written as its text, as a token's is, instead of as JSON text with its quotes.

@josephfarina
