---
'@astryxdesign/cli': patch
---

[feat] `astryx doctor` warns about a prop the app gives a Core component that the component does not take (`core-props`), such as `selectedID` on `TabList` or `labelHidden` on `CheckboxInput`. Such a prop does nothing, and nothing else says so. The warning names each prop's file, line and component, and the documented prop the name is closest to: "src/App.tsx:6 CheckboxInput has no `labelHidden` (did you mean `isLabelHidden`?)". A prop is reported only when Core's docs for the component leave it out and Core's own types, read with the project's TypeScript as its pages see them, do not take it either. The name of an HTML, SVG, DOM or ARIA attribute, which a component can pass on to what it renders, is never reported, and neither is a prop of a component from outside Core or of a generic component. Doctor reads the app's own source as syntax trees and leaves out test, story and fixture files. Without TypeScript the check says it did not run. The check never fails `doctor`.

@josephfarina
