---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`:

- Two-word color names ("off-white", "ink blue", "grass green", "safety orange", "slate blue-gray"), tan and paper now resolve through the color table. Off-white is a warm off-white. "pure white" means exactly white. "amber for warnings" sets the warning color. A typed value said with a named color, as in "bold safety orange #ea580c accent", wins.
- "make it calmer" and "a calm dark mode" lower vibrancy. "more cheerful" means more colorful.
- When no command can do the whole request, the text output now says each result explains why, instead of pointing to lines "above" that appear below.
- Tailwind shadow sizes ("shadow-sm") map to the editor's shadow sizes.
- "dividers between list rows" and "table rows divided by 1px lines" give a bottom border. "32px rows in the menu" sets the menu item height.
- "should be a #e8def8 pill" gives that fill with pill corners. "dialogs with a dark overlay behind them" darkens the overlay. "big touch targets" makes buttons and inputs bigger. "a 2px dark border" uses the theme's stronger border color.

@josephfarina
