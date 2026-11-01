---
'@astryxdesign/core': patch
---

[fix] A `Typeahead` or `Tokenizer` disabled with a reason (`isDisabled` with `disabledMessage`) no longer opens its results from ArrowDown or a click. A `Typeahead` disabled this way also no longer accepts a pick by Enter or a press, even from a list that was open before it became disabled (a `Tokenizer` already refused those). Escape or Tab still closes such a list.

@cixzhang @duytbp
