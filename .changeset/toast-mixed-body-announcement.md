---
'@astryxdesign/core': patch
---

[fix] A toast whose `body` mixes text and a component, such as `<>Payment received: <Amount /></>`, is now announced with all the words it shows ("Payment received: $120.00"), not only the text written beside the component. A body that holds any element is read once, from its rendered text, when the toast is shown; a plain-text body is announced as before. A component body or `renderContent` card whose words change after the toast shows is no longer announced a second time.

@cixzhang
