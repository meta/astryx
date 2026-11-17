---
'@astryxdesign/core': patch
'@astryxdesign/lab': patch
'@astryxdesign/theme-neutral': patch
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-stone': patch
'@astryxdesign/cli': patch
---

[fix] ProgressBar and CircularProgress fills reach 3:1 against their track (WCAG 2.2 SC 1.4.11, non-text contrast). ProgressBar's status fills take the status text colors, and its neutral fill, like CircularProgress's, takes the secondary text color instead of the disabled one, which is the bar's track color in dark mode in Theme Neutral and Theme Stone and under 3:1 on the bar's track in every bundled theme in light mode. A disabled bar or ring takes the same fill and dims its track and fill to half opacity, as a disabled Slider or Switch track does, so it reads quieter than a neutral one. A mark on any fill but accent takes the surface color. CircularProgress draws every variant on the muted background track, ProgressBar's base track, because some themes' status muted colors are the status color itself. Theme Neutral's progress track is one stop darker in dark mode, Theme Butter's and Theme Stone's progress fills move to stops in the same color families that reach 3:1 on their tracks, and the CLI's bundled theme templates match.

@nynexman4464
