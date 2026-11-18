---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export` warns when a page gives a Core component's prop a value it does not have: `unknown-prop-value`, "page.tsx:12: Button has no variant "danger"; its variants are primary, secondary, ghost, destructive." Such a component draws no variant's look and nothing else says why. The check reads Core's own docs for the component in the page's Core (the props `astryx component <Name> --package @astryxdesign/core` shows), so an integration that replaces the component does not change it. Where a theme can add values to a prop (Button's `variant`, Banner's `status`, Link's and Heading's `color`, which take Text's colors), the values the project's themes add count too: the check reads the module augmentations in the project's own TypeScript files (a theme build's `.variants.d.ts` included) and in the declaration files of the theme and integration packages it installs. It checks only string values written in the page, for props whose type is a closed set of strings, on components imported from Core by name or through a namespace import (`<Core.Button>`). A value the page computes, a component that is not Core's, and a prop with no doc entry are not checked.

@josephfarina
