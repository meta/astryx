---
'@astryxdesign/core': patch
'@astryxdesign/theme-neutral': patch
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-stone': patch
'@astryxdesign/cli': patch
---

[fix] ProgressBar and CircularProgress fills reach 3:1 against their track (WCAG 2.2 SC 1.4.11, non-text contrast). ProgressBar's status fills take the status text colors, and its neutral fill, like CircularProgress's, takes the secondary text color instead of the disabled one, which is the bar's track color in dark mode in Theme Neutral and Theme Stone and under 3:1 on the bar's track in every bundled theme in light mode. A disabled bar takes the same fill and dims its track and fill to half opacity, as a disabled Slider or Switch track does, and a disabled ring dims as a whole, center content included, so each reads quieter than a neutral one. A mark on any fill but accent takes the surface color; in Theme Butter and Theme Stone, a mark on a status fill takes that status's on-color. CircularProgress draws every variant on the muted background track, ProgressBar's base track, because some themes' status muted colors are the status color itself. In Theme Neutral, Theme Butter and Theme Stone a dark neutral or disabled fill takes a lighter neutral stop, Butter's and Stone's status fills take the theme's status colors, Stone's accent fill takes a blue stop that reaches 3:1, and the CLI's bundled theme templates match.

@nynexman4464
