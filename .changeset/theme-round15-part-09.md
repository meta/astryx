---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set` takes a box color shorthand with one color per side, as CSS does: `border-color` with 2 to 4 colors (`#ddd #ddd transparent`), and `border-block-color` or `border-inline-color` with 2. The value is built as typed, in both modes or one, and each side is measured on its own: a faint side is named ("the bottom border on text-input"), a transparent side is left out, and the fix keeps the other sides as typed. Too many colors, or a side that is no color, is refused with the reason.

- `astryx experimental theme editor how` and `set`: a look said of one member of a family (a gradient on buttons or menu rows, a frame of a border and a shadow on dialogs, a selected pill's corners and fill) goes on that member's family group (`button-like`, `option-rows`, `overlays`, `selected-items`), so every member that draws alike takes it; a plain fill, a shadow or border alone, a removal or a member said with a variant stays on that member. `set … --on <member>` stays exact and names the family's members that do not share the look, with the one line that gives it to the family.

- `astryx experimental theme editor set … --on <group>`: the family roles the census reads from each part's own structure are groups `--on` takes: `button-like`, `overlays`, `option-rows`, `selected-items`, `accent-fills` and `inset-fields` (`how --list groups` lists their members). A look set on one never overwrites a member the theme set the same thing on itself.

- `astryx experimental theme editor` is faster: a picture's faint-text measurement reads the page's images once and each text once, and a change makes its color mapping and reads the theme's own token values once.

- `astryx experimental theme editor how`: a font family named before or after the text it's for, without the word "font", now sets that font. Examples: "Fraunces headings", "use Playfair Display for headings", "headings in Lora". This works for any family `set` accepts, not only the built-in presets.

- In `astryx experimental theme editor how`, a list piece that is only a color, with no look or part word of its own ("big buttons, a sky blue, high contrast"), is the theme's. It no longer fills the button named in a piece before it. "buttons rounder and red" still reds the buttons, and a part's colon list ("badges: green, amber, red") still colors that part.

- In `astryx experimental theme editor how`, an offer, meaning more than the ask (such as "to change the blue, green … card variants too"), is marked `offer: true` in the JSON result. It follows every other result and is never the first, so running the first result's commands never runs one. When what the ask writes is in place already, the first result now says so ("already #ffffff on the card …, nothing to change") with no command. Before, the offer could be the only result with commands. The response type and docs describe the new field.

The same goes for the line that keeps a theme to one mode when the ask only says which mode the app shows first ("relaxed dark mode for night browsing"). It is now an offer, kept out of "all of it", so running the whole answer no longer drops the light mode, and the light page asked beside it is written. A color said for a theme the ask keeps to one mode ("black background, …, dark mode only") is that color, not a tone fitted to both modes' pages.

- `astryx experimental theme editor how`: a page-color answer now also lists the parts that draw the page color (the app shell and the main panel). It also says that the page color paints inside `AppShell`, and that a page without `AppShell` stays white until its own CSS adds `body { background: var(--color-background-body) }`. The "Use a theme" guide says the same.

- `astryx experimental theme editor how`: a fill given to a part whose own section draws its own fill, such as a code block's header, now says the header keeps that fill, so the block shows two tones. It no longer says the header "would barely show". Words from a part's own name ("blocks" in "code blocks") are no longer listed as not taken.

- `astryx experimental theme editor how`:

- "dark gradient navbar" now gives a gradient between the theme's own dark surface colors, with text that reads on it. Before, it gave a light gradient.
- "small labels" now makes them smaller instead of larger.
- "labels" on its own, with nothing about a form or field, offers both meanings (form field labels, or badges) and changes nothing until you choose.

- More fixes in `astryx experimental theme editor how`:

- A value typed in the ask (a hex or a length) that no line writes or names is now named in a "not used" line in the user's own words, even when a reader folded its clause away ("…, hover #0055CC, pressed #09326C", "… #E9E9EA when off"). A mode the other lines carry ("in dark mode, …") is no longer named.
- What a look turns into in a state, said of one side ("a 1px bottom border that turns accent and 2px when focused"), stays on that side: one bottom border at rest and one in focus, never all four sides.
- "checkboxes 18px, 4px corners" reads the 18px as the checkbox's size, as the with-form does.
- "translucent" said of a part with a fill ("nav bar translucent white", "a translucent nav bar") makes that fill partly see-through. It is no longer dropped.
- A bare length said of a text style ("footnotes 13px", "captions 13px") is its text size.
- A status color said after part clauses ("…, bolder headings, and a green success color") is the theme's success, warning or danger color, never the part's color.
- Text after a list of several parts ("page #202020, cards #2D2D2D and text #FFFFFF") is the theme's text, not the cards'.

- `astryx experimental theme editor show`: a theme that sets a text size for the whole theme now notes that phones (touch screens under 1024px wide) keep the base theme's reading sizes. A measurement taken on such a screen therefore shows the base size and is not a mistake. `set` already said this.

- theme editor how: in a part's colon list ("tabs: …", "tables: …"), every item belongs to the part named before the colon. A text size in "filled buttons: …" stays on the buttons instead of changing the whole theme. "outlined buttons" no longer turns a text size into a border. "the active page" in a pagination list is its current page button, and its white text stays on it. "on the rest" is the tabs that are not selected. "header background" in a table list is the table header, and a hover after it is the rows'. "the active page in pagination" now finds its current page button too.

@josephfarina
