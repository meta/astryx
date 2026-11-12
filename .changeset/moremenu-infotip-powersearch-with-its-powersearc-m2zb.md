---
'@astryxdesign/core': patch
---

[fix] MoreMenu, InfoTip, PowerSearch (with its PowerSearchToken and PowerSearchFilterEditor defaults), Toast, and InputClearButton now pass host `data-*` attributes to their own element, as other components do: the trigger button for MoreMenu and InfoTip, the primary control for PowerSearch, the token and editor root for the PowerSearch defaults, the toast element for Toast, and the button for InputClearButton. Component-owned attributes stay with the component. A new test renders every exported component that renders an element of its own with a `data-*` attribute, and fails when the attribute does not reach the DOM.
@kentonquatman
