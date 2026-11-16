---
'@astryxdesign/cli': patch
---

[experimental] Fixes in `astryx experimental theme editor`:

- `how` keeps every item of a list led by its part on that part, however long the list: "badges 4px corners, 12px text and no border" and "tooltips #0f0f0f with white text, 4px corners and 12px text" give the 12px text to the badge and the tooltip, not the whole theme's text size. A word for a piece of the leading part ("side nav #08090a, items 13px text") goes to that piece.
- `how` no longer reads a size word that describes a look ("large bold text") as a part's own size, so a part said before it doesn't spread to it.
- `how` reads "<name> tool:", "product:", "platform:" and "portal:" labels as the product the look is for, like "app:" and "site:".
- `how` now reads "the others" after a comma ("selected tab text white, the others gray") the same way as after "and".
- `how` reads a bare length said of a part that sets its own width and height ("checkboxes 16px") as that part's size.
- `how` reads a complaint like "why is everything so round" as an ask for one step the other way, instead of answering it as a question.
- `how` reads the German comparative "eckiger" (more angular) as one step sharper, not square.
- `how` gives a part that paints no shadow at rest ("the cards look so flat", "card shadow bigger") the first shared shadow. A part's shadow steps from what Core paints.
- `set` on one member of a group under a variant of that member (`--on selector --when variant:secondary`) now reaches only the members that have that variant, not the whole group.

@josephfarina
