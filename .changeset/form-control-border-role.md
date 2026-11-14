---
'@astryxdesign/build': patch
'@astryxdesign/cli': patch
'@astryxdesign/core': patch
'@astryxdesign/richtext': patch
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-chocolate': patch
'@astryxdesign/theme-gothic': patch
'@astryxdesign/theme-matcha': patch
'@astryxdesign/theme-neutral': patch
'@astryxdesign/theme-stone': patch
'@astryxdesign/theme-y2k': patch
---

[feat] Text fields and checkbox and radio boxes now have an edge people can find. A new theme role, `--color-border-control`, is the edge of a field shell and of a checkbox or radio box, at 3:1 or more against the surface and the page body (WCAG 2.2 non-text contrast). Before, these edges used `--color-border-emphasized`, which reached only 1.4–2.2:1 in Core's default theme, and the field surface differs from the page by only about 1.1:1, so the edge was the only cue.

What changes on screen:

- Core's default control edge is `#878D95` (light) and `#666A70` (dark), instead of `#CCD3DB` and `#494D53`.
- Every field built on the shared field shell uses it: TextInput, TextArea, NumberInput, DateInput, DateRangeInput, DateTimeInput, TimeInput, FileInput, Selector, MultiSelector, ComplexSelector, Typeahead, Tokenizer, PanelSearchInput, PowerSearch, and InputGroupText inside an InputGroup. A field's hover ring is mixed from the same edge.
- Unchecked CheckboxInput, CheckboxList, RadioList, and DropdownMenu checkbox and radio boxes use it. Checked and disabled boxes are unchanged.
- Every first-party theme sets its own value at 3:1 or more against its own surface and page body, and generated themes (`defineTheme({color})`) derive one.
- Cards, dividers, and every other use of `--color-border-emphasized` keep their lighter edge.

Custom themes: a theme that doesn't set `--color-border-control` gets Core's default. A custom theme that set only `--color-border-emphasized` for its field edges now gets Core's default control edge; set `--color-border-control` to a value that suits your palette and reaches 3:1 against your surface and page body.

@cixzhang
