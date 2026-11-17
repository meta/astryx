---
'@astryxdesign/core': patch
---

[feat] useCollapsible returns `triggerProps` and `contentProps` for a disclosure whose trigger you render, such as a whole list row, and its content mounts nothing while closed. The optional `hasContentAnimation` keeps the children through the content's own close animation, and `contentHeightProperty` receives the content's measured height for grow and shrink keyframes. Collapsible gains an opt-in `hasLazyMount` that mounts its children only while open.
@kentonquatman
