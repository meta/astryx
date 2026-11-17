---
'@astryxdesign/core': patch
'@astryxdesign/lab': patch
'@astryxdesign/theme-neutral': patch
---

[fix] ProgressBar and CircularProgress fills reach 3:1 against their track. ProgressBar's status fills take the status text colors, and its neutral fill, like CircularProgress's, takes the secondary text color instead of the disabled one, which matched the track in dark mode. A disabled bar or ring draws the same fill at half opacity, as a disabled Slider or Switch track does, so it reads quieter than a neutral one. A mark on any fill but accent takes the surface color. CircularProgress's neutral track is the muted background. Theme Neutral's progress track is one stop darker in dark mode.

@nynexman4464
