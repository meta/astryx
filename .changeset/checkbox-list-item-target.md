---
'@astryxdesign/core': patch
---

[feat] CheckboxList rows carry their own theming target, `checkbox-list-item`, beside `item` and `list-item`, with the `selected` and `disabled` states, as RadioList rows carry `radio-list-item`. A theme can restyle CheckboxList rows, for example the room between the checkbox and its label with `components: {'checkbox-list-item': {base: {gap: '3px'}}}`, without changing every list's rows. The default look is unchanged.

@josephfarina
