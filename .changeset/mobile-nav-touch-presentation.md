---
'@astryxdesign/core': patch
---

[fix] On a phone or tablet (a coarse primary pointer), a tap or a drag during MobileNav's slide-in reaches nothing; keys and assistive technology stay live, and a mouse or a trackpad still clicks: at once when it was the last pointer used, otherwise once it moves.

@vjeux
