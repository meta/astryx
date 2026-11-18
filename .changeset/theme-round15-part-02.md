---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a border asked of a part that draws none goes to the pieces inside it only where those pieces draw borders of their own (a date and time field's two boxes), so "top nav with a 1px bottom border" writes the border on the top nav, not under each nav item, and "sidebar with a 1px right border" on the sidebar, not beside each link.

- `astryx experimental theme editor` keeps what a change reports to what it did: a link (or any text with a role of its own) too faint is fixed with the nearest shade of its own color that reads, never the plain black or white of body text; a border set for light alone no longer reports the dark frame it left as the theme draws it; and one fill on a group of parts says what it covers once for each kind of cover, with lines on the group, not once for each part.

- `astryx experimental theme editor how`: "the active nav item should be a #e8def8 pill" again gives pill corners on the selected item only. There is now a single reader for a color and shape, so the item's state is kept.

- `astryx experimental theme editor how` now gives a text color for every variant of a part ("buttons with white text", "badges with dark text") to each variant only in the modes where it reads. It measures against the variant's own fill, see-through fills over the page, or the fill the same answer gives it. Variants it can't read on keep their own text, and the answer says which.

Other fixes:

- "tinted <color>" fills with the color at a low strength over what's beneath, not the solid color.
- A rule with its own verb said after a part's clause ("3px corners on cards, never use pure black for text") now applies to the whole theme.

- `astryx experimental theme editor set … --only` always works as an escape from a group: on a member of a group that spreads it keeps the change to that member, and on a part that is styled on its own already (a sub-part, a card) it is taken and said, in place of a refusal; only a group itself, which has no one member to keep to, refuses it. A menu's radio is kept apart from every other radio: "square corners but keep menu radios round" says its circle is left as it is, and a round ask on a menu radio the theme squared offers the undo that gives the circle back. A light-only theme reads `--mode light` as no `--mode`, as a dark-only theme reads `--mode dark`.

- `astryx experimental theme editor`: a part Core marks open is drawn open, so `--state expanded` reaches a dropdown menu's submenu row (open while its flyout is, though it is highlighted too) and a top nav's menu trigger (a control on the page, now kept as drawn open).

- `astryx experimental theme editor`: the states Core marks on a part's own element are the part's to set. A list item (and so a checkbox list's row) takes `--state selected`, written as the attribute Core marks; a checkbox's or radio's box takes `--state hover` and the other moment states, shown from the part holding its invisible input instead of refused; a state asked of a container names the part inside it that has it, so `--on pagination --state current` points to the current page's button; and a part the drawing shows open in an overlay records its open state for `--state expanded`.

- `astryx experimental theme editor show` draws a doc sample's plain HTML text field as the theme's own text input, a submenu's flyout once beside the menu it opens from instead of a second time below it, a control drawn pressed at the moment of its press (a press flash no longer fades back to rest), a command palette with an item highlighted on the open states page, and the mobile navigation drawer's panel inside its cell.

- The pictures of `astryx experimental theme editor show --png` show their whole page: a page laid out wider than the picture window is pictured to its own width instead of cut at the window's edge; the mobile navigation drawer, which draws nothing closed, has no empty cell on the navigation pictures either; an overlay drawn open after its part (a toolbar's menu) sits under the control that opens it; and a step name cut by less than a pixel is shown whole too.

- `astryx experimental theme editor how`: rows said of a part that holds no table rows are that part's own rows, the items it draws, so "menus with 32px rows" sizes the menu items and never every table row; and a part word right before a noun the editor knows as nothing ("a radio station", "a button factory", "a card game") begins a compound subject, never the part: it is named and nothing is written for it, and the rest of the ask is read as before.

- `astryx experimental theme editor` measures a state's fill against the text that state draws, in its own variant: a part that draws no text (a switch's track, a tab's underline) gets no text problem, and a primary button's hover fill is measured against the primary button's own text, not another variant's. A page change that leaves the loading placeholder as faint as the base drew it no longer reports it as a new problem.

- In a light-only or dark-only theme, a text color set on a part whose own background is an image (a gradient button face) is written for both modes. Inside a lightbox or overlay, which Core draws in the other scheme, the text stays on that face: it no longer turns white on a light gel button. The contrast check measures it the same way.

@josephfarina
