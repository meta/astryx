---
'@astryxdesign/cli': patch
---

[experimental] Fixes in `astryx experimental theme editor how` for themes that draw both light and dark modes, and for some common wordings:

- **Page and surface colors:** a clearly light page or surface color (typed or named, such as "cream background" or "white cards") is set for light mode only, and a clearly dark one for dark mode only. The other mode keeps its own color, so its text stays readable. The answer says so and shows how to set the other mode too. A one-mode theme, or an ask that says "in both modes" or "everywhere", sets it for both.
- **A part hidden by a new fill:** when a part inside the one being filled would end up nearly the same color as the new fill (a primary button in a navy header), the answer names it.
- **Link colors:** a link color one mode's page would make unreadable (a dark blue on the dark page) is set for the other mode only, and the answer says so.
- **Prohibitions:** "never use pure black for button text" moves the button's text off black where it is black, instead of writing black.
- **Later clauses:** "make everything more compact", "text color #303030", "; 14px text", ", larger text", "; roomier spacing" and "; main text #f7f8f8" said after an ask about one part change the whole theme, not that part. A page's text is the theme's text, never the page.
- **Trailing modes:** a mode said at the end of a run of clauses on one part ("… white with a 1px border and a small shadow in light mode") applies to the whole run. In "black with white text in light mode and white with black text in dark mode", each half keeps its own mode and its own fill.
- **Size words:** a size word before the thing changed ("a small shadow", "large padding") sets the amount. It no longer picks the part's size variant.
- **Show's missed list:** a fill or text color the ask gives now comes before a line from show's missed list.

@josephfarina
