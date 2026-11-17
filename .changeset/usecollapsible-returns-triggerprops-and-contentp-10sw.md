---
'@astryxdesign/core': patch
---

[feat] useCollapsible returns `triggerProps` and `contentProps` for a disclosure whose trigger you render, such as a whole list row, and its content mounts nothing while closed. The optional `hasContentAnimation` keeps the children through the content's own close animation, and `contentHeightProperty` receives the content's measured height for grow and shrink keyframes. Collapsible gains an opt-in `hasLazyMount` that mounts its children only while open.

A direct `useCollapsible` call now takes one id from React's `useId`, so ids that React generates after it in the same tree shift by one. Collapsible and Banner reuse the hook's id and keep theirs.

@kentonquatman
