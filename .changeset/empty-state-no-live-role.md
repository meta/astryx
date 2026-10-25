---
'@astryxdesign/core': patch
---

[fix] EmptyState's root no longer carries `role="status"`, so it is not a live region that mounts already holding its text, which screen readers announce unreliably (`spec:AST-086` FR2). Apps need no code change. An EmptyState rendered or changed while the page loads announces nothing; one that appears later, or whose title or description changes later, announces its title and description once through the shared polite live region; inside a live container such as `ChatMessageList`'s log, the container announces it (`spec:AST-086` FR4). A `role` you pass now reaches the root instead of being replaced; tests that found EmptyState with `getByRole('status')` need another selector.

@harjothkhara
