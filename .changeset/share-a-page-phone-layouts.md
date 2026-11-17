---
'@astryxdesign/cli': patch
---

[docs] The shareable-page guide (`astryx docs cli/experimental/share-a-page`) names the layouts that go wrong on a phone in a file with no script, and how to write each one: a Badge beside text in an HStack (StackItem `static` and `fill`, as its example now does), a Badge on its own line in a VStack (`<StackItem crossAlignSelf="start">`), a long string ListItem label (pass an element), and a table wider than the screen (the file cannot scroll it sideways: keep it within about 310 px with shares that match the floors or `pixel()` columns, each floor fitting its column's longest word and header, padding included). It also suggests `isWrapped`, which shows long CodeBlock lines whole. `astryx experimental render --help` and its doc now point to the guide.

@josephfarina
