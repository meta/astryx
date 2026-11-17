---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` warns when a page gives a Core component's prop a value it does not have: `unknown-prop-value`, "page.tsx:12: Button has no variant "danger"; its variants are primary, secondary, ghost, destructive." Such a component draws no variant's look and nothing else says why. The check reads the component's own docs (the props `astryx component <Name>` shows), and only string values written in the page for props whose type is a closed set of strings. A value the page computes, a component that is not Core's, or a prop with no doc entry is not checked.

@josephfarina
