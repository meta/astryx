---
'@astryxdesign/core': patch
'@astryxdesign/lab': patch
'@astryxdesign/theme-neutral': patch
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-stone': patch
---

[fix] ProgressBar and CircularProgress fills reach 3:1 against their track. ProgressBar's status fills take the status text colors, and its neutral fill, like CircularProgress's, takes the secondary text color instead of the disabled one, which matched the track in dark mode. A disabled bar or ring draws the same fill at half opacity, as a disabled Slider or Switch track does, so it reads quieter than a neutral one. A mark on any fill but accent takes the surface color. CircularProgress draws every variant on the muted background track, as ProgressBar does, because some themes' status muted colors are the status color itself. Theme Neutral's progress track is one stop darker in dark mode, and Theme Butter's and Theme Stone's progress fills move to the stops in the same color families that reach 3:1 on their tracks.

@nynexman4464
