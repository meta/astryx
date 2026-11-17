---
'@astryxdesign/core': patch
'@astryxdesign/lab': patch
'@astryxdesign/theme-neutral': patch
---

[fix] ProgressBar and CircularProgress fills reach 3:1 against their track. ProgressBar's status fills take the status text colors, and its neutral and disabled fills, like CircularProgress's, take the secondary text color instead of the disabled one, which matched the track in dark mode. A mark on any fill but accent takes the surface color. CircularProgress's neutral track is the muted background. Theme Neutral's progress track is one stop darker in dark mode.

@nynexman4464
