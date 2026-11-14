---
'@astryxdesign/core': patch
---

[feat] `Typeahead`, and `Tokenizer` in its popover presentation, now show a result's `action`, its secondary control, such as an Edit button. Before, the control was dropped with a development warning. Once a result carries one, the list becomes a grid: each row has the result and, after it, the control. After the arrow keys reach a row, the arrow key toward the end of the row reaches the control, and Enter or a press runs it without selecting the result or closing the list. Tokenizer's bottom sheet, its presentation on compact touch screens, still shows the result without the control and warns in development. The "nothing matched" message is no longer exposed as a disabled option; screen readers still hear it.

@cixzhang
