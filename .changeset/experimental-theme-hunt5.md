---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: the fifth pass of fixes.

- A theme lock whose holder stopped renewing it is taken over after 30 seconds, whatever computer it names, and a lock renewed or taken a moment before that takeover is put back. `compile` holds an editor theme's lock while it builds or checks it. The editor's cache stays in the project's node_modules.
- A corners rung gives a part what it gives the radius token that part reads, pill keeps checkboxes square, and corner sizes written any way are read plainly. Spacing is refused where it shows nothing, and controls stay at least 24px.
- Saved settings on a part, state or variant that does not exist are refused with the undo that removes them. A damaged mode or base is fixed by setting it. Text contrast is measured for each variant of a part.
- A one-mode theme changes the build. A per-mode color keeps the other mode as a color. Big files beside a theme are never read. Undo after a gray color writes the same bytes. Render folders and damaged palette copies are handled only by commands that write, and named.

@josephfarina
