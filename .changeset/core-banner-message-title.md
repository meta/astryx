---
'@astryxdesign/core': patch
---

[feat] Banner gives themes two more parts: `banner-message` (the title and description together) and `banner-title`. The default status icon no longer sits in an extra box, so a theme that hides `banner-icon` leaves no empty gap before the message. A theme can now draw a one-line alert with no icon; one space separates the title and the description in every banner, so the gap between them is the same on one line. The four built-in statuses look the same. A status with no default glyph and no `icon` loses the empty 8px space before its message.

@josephfarina
