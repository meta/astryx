---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` warns, at its line and with the same output as before, a field `defineTheme()` does not take (`component:`, `tokenz:`, `ondark:`, `onDark.localTokens`, `typography.body.fontFamily`), with the field it is near; and a BigInt, a function or a Date value, naming what it writes. A BigInt no longer ends the build with an unknown error. A surface token that loops through a token Core sets on that surface is warned once, at its line, and Core's own surface token is no longer named as one from the theme it extends.

@josephfarina
