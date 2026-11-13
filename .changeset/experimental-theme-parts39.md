---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: what the editor builds, `compile --check` takes.

- Two to four corner radii on card, button, dialog, avatar, banner, popover and the other parts with an inner-corner radius are written as CSS properties Core reads (the whole radius, which Core turns into the content's radius, then each corner), never as a private variable, so `compile` and `compile --check` pass.
- A padding on chat-composer is refused with the reason: the box inside its transparent wrapper reads its padding only from a variable of Core's own, which a theme cannot set, and a padding on the wrapper would add a gap outside the box.

@josephfarina
