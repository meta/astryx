---
'@astryxdesign/cli': patch
---

[fix] The editor page template is no wider than a phone screen before its script runs, as in an exported page: the side panel takes no room below 769 px in CSS. Before, the 320 px panel docked at the side until the script moved it into the header, and the page was 384 px wide on a 320 px or 375 px phone. Until the script runs, the blocks table is cut to its area; then it scrolls, as before. Desktop is unchanged. The template now imports StyleX for this rule.

@josephfarina
