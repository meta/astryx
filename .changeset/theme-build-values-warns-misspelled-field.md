---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` warns a misspelled field wherever the theme's sources write its input: an input held in a const, `defineTheme` imported under another name, a theme a file re-exports from another module (named with that module's file and line), and an `onDark`, `onLight` or `typography` block held in a const; a method written as a field (`onLoad() {}`) is warned too, and so is a BigInt typography value. A TypeScript type assertion such as `<any>1` in a `.ts` theme no longer costs every warning its line. A BigInt inside a part's array or nested block no longer ends the build: it is warned by what is written, and a value that holds itself stops the build at its line. A symbol, or a tokens object that holds itself, stops the build at its line instead of with a raw error. A boxed string (`new String('4px')`) is judged by what is written: no warning as a token or a pair half.

@josephfarina
