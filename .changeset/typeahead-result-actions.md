---
'@astryxdesign/core': patch
---

[feat] `Typeahead` and `Tokenizer` now show a result's `action`, its secondary control, such as an Edit button. Before, the control was dropped with a development warning. Once a result carries one, the list becomes a grid: each row has the result and, after it, the control. The arrow key toward the end of the row reaches the control, and Enter or a press runs it without selecting the result or closing the list. The "nothing matched" message is no longer exposed as a disabled option; screen readers still hear it.

@cixzhang
