---
'@astryxdesign/cli': patch
---

[fix] `astryx build` keeps the page template an idea names by its frame. An idea such as "notification settings in a modal" now starts from the settings dialog template instead of the plain settings page, and a part placed in a family's frame starts from that frame's template rather than the family's base. Other ideas are unchanged.
