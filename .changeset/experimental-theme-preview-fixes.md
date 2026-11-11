---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview`: the preview pages work in a production build. Leaving the Components page no longer crashes the route: a typeahead part (Tokenizer, CommandPalette) gets a small sample search source. On the Components page, a part renders inside the parent its playground names (Step in a Stepper, a SegmentedControlItem in a SegmentedControl, a RadioListItem in a RadioList), a part that only works deeper inside its parent is left out, a status variant is passed as `{type}`, ButtonGroup shows three buttons, and layers that stay closed are left out. A component that still throws shows a short note instead of a blank cell. The Overview page is the sample page's content, without a second app shell. Font: `editor set <theme> font <name>` and `editor show` say near the top when the font's package is not installed, with the exact install line; once it is installed, the next `set` or `show` makes the preview route import its stylesheet.

@josephfarina
