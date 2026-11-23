---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` answers faster: each contrast check reads a pair's drawn state once, a property's aspect group is a lookup, the part data's states are read once while the part data is unchanged, and a Core component's import path is found once for each installed Core.

- `astryx experimental theme editor set … surfaces flat` (and the other surface looks): the colored and status variants of a surface keep their own fill; the look's fill goes on the variants that draw the plain surface, so a blue card stays blue.

- `astryx experimental theme editor how`: when an ask such as "darker … for contrast" makes one mode's text lighter to gain contrast, the answer now says so in one line ("in dark mode, more contrast means lighter").

- In `astryx experimental theme editor how`, "controls 4px corners, overlays 8px corners" sets the two corner sizes Core keeps apart: `--radius-element` for controls (buttons, inputs, selectors), and `--radius-container` for surfaces and overlays (cards, dialogs, popovers, menus). Before, they were offered as two answers that contradict each other. On a light-only theme, a line that sets a color token for its one mode now says that dark mode keeps its own value for that token, with the value, because the dark media surfaces (the lightbox, and what sits on the overlay scrim) draw it. Tokens those surfaces replace (the main text color, icons and the accent, drawn there in the on-dark color) are not named.

- `astryx experimental theme editor how`:

  - "avatars: round, 32px" now gives round avatars that are 32px wide and tall. Before, it read 32px as the corner radius and dropped the size.
  - "error text #b91c1c" now sets the error text color token, as "success text …" and "warning text …" already did. "warning text …", "info text …" and "danger text …" without a color now reach their text colors too, instead of reporting a missing part.
  - A status text made darker "for contrast" (or to be easier to read) now gains contrast in both modes: darker in light mode, lighter in dark mode.
  - "tooltips: #f5eff7 12px text" now sets both the text color and the size. "menus 14px text" now sets the menu's type sizes instead of being refused.

- In `astryx experimental theme editor how`, when `how` understands a clause's look but no answer takes it, the answer now names that clause in the asker's own words.

- `astryx experimental theme editor set … corners 4px`: corners of an explicit size name the parts drawn as circles that keep their shape (a calendar's picked day, avatars), with the line that gives each of them those corners too, as square corners already did.

- `astryx experimental theme editor set … --on status-surfaces|overlay-headers`: two more family groups read from each part's structure: `status-surfaces` (a message with a control of its own whose fill follows the theme's status roles: banners, toasts) and `overlay-headers` (an overlay's header holding its title and its close button). A rule under one overlay's header is offered for every overlay header.

@josephfarina
