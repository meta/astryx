---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor show <theme> --on <part>` reads an editor theme from its theme file the way a build loads it, so a token or part rule a person adds by hand below the settings in `<theme>.theme.ts` is in the answer, as the theme's. A theme file that does not parse or load is refused (`ERR_THEME_INVALID`), as `show` and `set` refuse it, and so is one that no longer extends its settings, as `set` refuses it. A build that does not match the saved settings (missing, half done, damaged or older) is refused too, with `show <theme>`, which builds it again, as the next step. A build another CLI or base-theme release made answers from the saved settings, as before, without the hand additions.

@josephfarina
