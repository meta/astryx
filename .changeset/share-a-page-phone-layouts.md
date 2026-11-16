---
'@astryxdesign/cli': patch
---

[docs] The shareable-page guide (`astryx docs cli/experimental/share-a-page`) names the layouts that go wrong on a phone in a file with no script, and how to write each one: a Badge beside text in an HStack (StackItem `static` and `fill`, as its example now does), a Badge on its own line in a VStack (`hAlign="start"`), a long string ListItem label (pass an element), a table wider than the screen (the file cannot scroll it sideways, so keep the floors within a phone and as wide as each column's longest word and header), and long CodeBlock lines (`isWrapped`). `astryx experimental render --help` and its doc now point to the guide.

@josephfarina
