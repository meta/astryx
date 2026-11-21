---
'@astryxdesign/cli': patch
---

[experimental] Changes to `astryx experimental theme` and its editor:

- `astryx experimental theme editor set … corners`: whole-theme corners name the parts the theme gives corners of their own (a border radius or corners set on a dialog, the menus) as kept, with the undo lines that hand them back to the dial.

- `astryx experimental theme set`: a dial's value that names a part or group, plural included (`spacing 'buttons: roomy'`, `corners 'cards: pill'`, `corners 'pill on card'`, `spacing 'button compact'`), offers the line that keeps the change on that part (`set my spacing roomy --on button`), never a whole-theme line, even when the label also spells another setting.

- `astryx experimental theme editor how` writes nothing for a clause led by a plural, or by words of a part's name, that match no part ("command palette 8px corners", "widgets 8px corners"): it names the words and lists any parts that contain them. A single word it does not know ("FAB 16px corners") still changes the whole theme, as released versions do. Font names, brand labels and look words still read as before.

A part's list keeps its items on that part:

- Looks after a part said first ("tooltips 4px corners and 12px text", "popovers 8px corners, 1px border, no shadow", "table header text uppercase, gray, 12px, bold") all go to that part.
- An item led by a variant name that is not also a colour or a describing word ("buttons: primary #…, hover #…") goes to that variant, along with the states after it; a colour said first ("cards: blue #1d4ed8") is a value for every member.
- A part named inside another part's list ("toasts: …, an action button text color") counts as inside it.
- A mode said alone after a look ("pure white page, light only") or at the end of a color with-item applies to that look. Corners and sizes beside it stay the same in both modes.
- A size beside a state's line ("32px tall with a 2px border when focused") keeps no state.

Other readings fixed:

- "under" and "below" mean the bottom side. A side word inside a part's name ("top nav") is no longer read as a side.
- Lines said of a part are its line, not its fill.
- "valid" reads as the success status, and "in error" as the error status.
- An inset ring is a ring, not a drop shadow.
- "0 7px" padding keeps its 0.
- A ring and a shadow together are one layered shadow.
- A text color asked with a fill goes where that fill goes.
- See-through said of a part affects its fill only, not the whole part.
- "bold colors" no longer bolds the text.
- A "white with a black check in dark mode" checkbox keeps the white it was given.

- `astryx experimental theme editor how`:

- A color "for highlights" or "for calls to action" sets the accent.
- "amber warnings" and "red errors" set the warning and danger colors.
- "the blue info banner clashes with the green" no longer offers the colors it mentions. It points to the info color, which every info banner, badge and toast uses.
- Chart color requests point to the chart data colors.
- "no border on inputs except the bottom one" keeps the bottom border.
- "status colors green #x, amber #y, red #z" sets the success, warning and danger colors. "amber #y for warnings" keeps the typed value.
- A color name before a typed value ("light gray fill #F1F2F4") uses the typed value. "blue-gray" for the theme's gray reaches the neutral color again.
- "clear error messages" no longer resets the danger color.
- "less contrast" softens the main text. "a gentle dark mode" softens the dark text and lightens the dark page. "big type" and "big readable text" mean larger text. "thin borders" means thinner borders, and "lots of white space" means more spacing.
- "deep teal" is a deep teal.

- `astryx experimental theme editor how`:

- A text color typed beside a typed fill that does not read on it is written as typed, and the answer gives the ratio.
- "ghost buttons gray text" colors the ghost buttons' text.
- Tailwind class names are understood: "rounded-md" means 6px corners, and "text-sm" means 14px text.
- "very compact" sets the tightest spacing, and "very roomy" the roomiest.
- "tables without vertical borders" removes the borders at the sides of each row.

- `astryx experimental theme editor` measures a color set on a part with no fill of its own (a checkbox's check) on the part it sits in, in the state it shows in (the box, checked), not on the page: a black check on a white checked box is no longer a problem, and the line for a check that does not read keeps it visible and is one `set` takes.

- The pictures of `astryx experimental theme editor show --png` no longer widen a cell for a label only a screen reader reads (a date input's "Close calendar"), which stretched the open states page past the picture's width.

- The pictures of `astryx experimental theme editor show --png` draw a toolbar's open menu under the control that opens it, measuring the room from the menu's own width, and draw the mobile navigation drawer's window-wide panel as wide as its cell, so the page is no wider than the picture.

- Font loading is clearer in the theme editor.

- A font set names each open font that does not load until its package is installed (`fontNotLoaded`), with the install line, right under the status line.
- A family typed alone takes the fallbacks of the kind its installed Fontsource package names, so Lora gets serif ones.
- Corners on a part with no edge of its own say to give it a background or a border first.

- `astryx experimental theme`: a part's variants written as other styling libraries write them (`variants: {variant: {secondary: {…}}}`) are refused with the same words `astryx theme build` warns with, naming the style keys that write them (`'variant:secondary': {…}`).

- `astryx experimental theme editor how`: a part word before a word the reader knows as a verb keeps the part ("links turn red"), and a compound that describes the product before a colon ("radio station app: rounder corners") names nothing, so the look after it is the whole theme's.

@josephfarina
