---
'@astryxdesign/cli': patch
---

[experimental] In `astryx experimental theme editor how`, an offer, meaning more than the ask (such as "to change the blue, green … card variants too"), is marked `offer: true` in the JSON result. It follows every other result and is never the first, so running the first result's commands never runs one. When what the ask writes is in place already, the first result now says so ("already #ffffff on the card …, nothing to change") with no command. Before, the offer could be the only result with commands. The response type and docs describe the new field.

The same goes for the line that keeps a theme to one mode when the ask only says which mode the app shows first ("relaxed dark mode for night browsing"). It is now an offer, kept out of "all of it", so running the whole answer no longer drops the light mode, and the light page asked beside it is written. A color said for a theme the ask keeps to one mode ("black background, …, dark mode only") is that color, not a tone fitted to both modes' pages.

@josephfarina
