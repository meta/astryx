---
'@astryxdesign/core': patch
---

[docs] Component specs are no longer shipped inside the npm package; they live in the repo at `docs/specs/components/`, one folder per component, beside each platform's spec. `astryx swizzle` no longer copies the component's spec file into your project. Nothing a consumer imports or renders changes.

@cixzhang
