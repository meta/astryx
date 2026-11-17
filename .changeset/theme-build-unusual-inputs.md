---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` warns a misspelled field in a theme a `let` is reassigned to or a dynamic import loads, at its line; warns tokens given as a `Map` or `Set`, whose entries it does not read; and stops at the field, with a message, on a token object that has no text form (made with `Object.create(null)`), never with Node's own text. A BigInt in a plain theme's type scale no longer ends the build. `astryx experimental theme` reads a boxed token (`new String('red')`) as the text the build writes.

@josephfarina
