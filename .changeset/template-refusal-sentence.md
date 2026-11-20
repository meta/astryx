---
'@astryxdesign/cli': patch
---

[fix] When `astryx template <name> <path>` refuses a destination outside the project and also names the command that writes it from the destination's folder, its message now says so too: the template is written only inside the folder the command runs in, and running the command from the destination's folder is one of the ways on. It no longer says the template is written only inside the project just above that command.

@josephfarina
