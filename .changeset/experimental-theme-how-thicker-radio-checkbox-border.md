---
'@astryxdesign/cli': patch
---

[experimental] Fixes in `astryx experimental theme editor how`:

- **Radio and checkbox borders:** a thicker border keeps its resting color, not the hover tint.
- **Possessives:**
  - A possessive owner's own element is that element, with a state said between them kept ("the menu's hovered items").
  - The owner's first word can name the element ("the toggle group's buttons").
  - Possessives before something the parts have name the parts themselves ("the cards' and buttons' borders").
  - An element the owner does not have is reported, and nothing is written.
- **Heights:** a height in a decimal unit ("2.5rem high") is that height. A negative height is refused.

@josephfarina
