---
'@astryxdesign/core': patch
---

[fix] Under a coarse primary pointer (a touch screen as the main input), a button's or a card's touch press release now runs on the compositor: it keeps fading while the page's script is busy instead of freezing at full strength and snapping off, and it paints nothing per frame. There, every control's touch release (Button, the cards, and the other controls on the shared overlay, such as Switch, Link, Tab and CheckboxInput) follows UIButton's highlight release, 250 ms ease-in-out instead of 200 ms ease-out; a list row's stays on the deselect clock; and under reduced motion the release is an opacity cross-fade of 200 ms or less. With any other pointer, a finger on a touch screen beside a mouse included, nothing changes. Under a coarse primary pointer, while a press is on or fading, Button paints it on its own `::before` and sets `isolation: isolate`; at rest it adds neither, so a `::before` you style, through `xstyle` or a `className` rule, merges into that layer only during a press. Style a child element to keep it unchanged.

@vjeux
