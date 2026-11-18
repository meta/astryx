---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` warns, at its line and with the form that works, more part keys a browser drops or Core misreads: a vendor property written without its dash, a pseudo name in capitals, something after a pseudo-element, two pseudo-elements, an escaped pseudo name, the custom property `--`, an empty key, and a block under a key that nests none. The output is the same as before. A `--family` build with such a key in a member builds, with each warning naming the member's file, where it stopped on an unknown error before. A default export that is a Promise of a theme is named as one, instead of a theme without a name.

@josephfarina
