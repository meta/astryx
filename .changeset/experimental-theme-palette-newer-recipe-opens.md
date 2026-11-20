---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a theme whose palette recipe this CLI doesn't know (one a newer CLI made) now opens instead of failing, and opening it never changes how it looks.

- The saved palette and the settings module the newer CLI wrote are kept exactly as they are, and `show` builds the same CSS `theme build` makes of them. A note names the recipe.
- Changes that leave the colors alone, and their undo, work, and keep the shades the theme shows. A change to what its palette is made from (a color dial, the vibrancy or the whole-theme accent token) is refused; the mode, the base and a part's colors save as usual: the refusal names the recipe and this CLI's version and says what still works, with no update step, as a CLI that makes that recipe may not be released.
- For such a theme, a build a newer CLI made of the same settings counts as current, so it isn't built again with this CLI's code, and undo puts back exactly the colors the step showed, a whole-theme color token included.
- For every theme, a change that leaves the colors alone keeps the shades the theme shows, as AST-008 FR10 asks: a half kept for one mode, a white or black half, and a token this CLI no longer maps all stay as an earlier editor wrote them, and a change to only `--only`, a note or letter case doesn't reset them.

@josephfarina
