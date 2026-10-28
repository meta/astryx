---
'@astryxdesign/core': patch
---

[fix] On a phone or tablet, a press made with a mouse, a trackpad or the Space key now shows the pressed state. Touch devices drop the CSS `:active` press so a finger only sees the touch press model, but that rule keys on the device's primary pointer, so a tablet with a trackpad and keyboard (or a phone with a mouse) lost the pressed state for every press that was not a finger. The touch press controller now paints those presses on such devices with the same pixels a desktop press has: at once, held while the button or key is down, faded at the release. As on a desktop, Space paints only a focused button that is itself the pressed surface (a checkbox's or radio's row stays at rest), and a menu row keeps the menu's own highlight. Desktop presses and finger presses are unchanged.

@vjeux
