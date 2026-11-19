---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`:

- A toast's text takes its own `color` on the toast: it goes into the two colors Core's media surface gives the toast's text, on the toast alone, so the lightbox and the scrim keep theirs. A text color token on the toast is refused with that line.
- Text on a one-layer linear or radial gradient is measured on the color under the text (the gradient's middle or center), so a glossy highlight at an edge is not taken for the ground.
- `show`'s `missed` list names shape and ring too: corners the theme left at the base's size beside one it changed (a popover at the container size beside square elements), with one line that sets the size it left, and a focus ring still drawn outside each part beside square corners or a theme border, with a line that draws it inside. A line is offered only where it changes the built theme.
- The inverted-surface line in `missed` gives the inverted surface to the part alone, with its text readable on it, and a variant with a fill of its own (an error toast) keeps readable text.

@josephfarina
