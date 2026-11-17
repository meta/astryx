---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`:

- A part's text made transparent by an amount ("the button text 50% transparent", "the fainter text in cards 50% transparent") is its text colors at that alpha, never the whole part's opacity.
- A state typed by its prop name or its ARIA attribute (`--state isPressed` or `aria-pressed` on a button, `isSelected` on a tab) is the state of that name.
- Several states at once are taken where the element takes them (a hovered selected tab), saved in one order so either spelling is one setting, and undone in either; `how` carries both states said ("hovered selected tabs").
- A one-mode border on a part that draws a border in that state (a focused input) is that border's color alone; a line drawn as a ring keeps the shadow the part draws in that state.
- A divider's line: "fainter" fades every variant's line, "hide" takes them away, and a thickness for one variant ("subtle dividers thicker") stays on it.

@josephfarina
