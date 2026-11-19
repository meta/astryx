---
'@astryxdesign/cli': patch
---

[fix] The messaging shell page template, still marked not ready, now works as an app. AppShell owns its side navigation of channels and direct messages, so on a phone the channels open from the navigation toggle. Picking a direct message shows that conversation, sending a message or a thread reply adds it to the page, a message's replies open its thread (in a drawer on narrow screens), and selecting a conversation clears its unread count. The page no longer uses raw elements or a local style object, and the actions without a real destination show a demo toast.

@josephfarina
