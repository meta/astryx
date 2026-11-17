---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads three more asks the way they are meant:

- A top nav's links or items ("top nav links accent colored", "top nav items bigger", "navbar links bold") are its items. A longer part phrase now wins over a shorter one inside it, so the top nav and every link are no longer changed instead.
- A look named after a product ("make it Acme", "make it look like Acme") is never guessed. The answer says so and asks for its colors, font, corners and spacing, or a picture of it, whose colors `how` reads.
- One variant made to look like another ("ghost buttons look like the default button") takes that variant's look: what the theme sets on it, then the fill, text, border and shadow it draws, written for the asked variant only. It is no longer read as a reset. "The default" is the variant the part has when none is given.

@josephfarina
