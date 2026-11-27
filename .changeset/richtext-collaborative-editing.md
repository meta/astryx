---
'@astryxdesign/richtext': patch
---

[feat] RichTextEditor can be driven by a collaborative binding. `isCollaborative` makes the editor provide the collaboration context a Yjs binding reads, and stop keeping undo history of its own, because the binding owns undo. The binding itself stays in the host app, which keeps the transport, the provider's lifecycle and presence, and keeps a CRDT library out of the dependencies of every app that installs this package. A binding that ships as a React plugin goes through the existing `plugins` slot. One that ships as a Lexical extension goes through the new `extensions` prop, which appends host extensions to the ones the editor always carries: an extension is read while the editor is built, so it cannot be a React child of one. `hasHistory` controls the editor's own undo history directly, for a surface that owns undo some other way. Every default is the current behavior.

Verify: an editor with no new prop set keeps its own undo history and its own extensions, as before.

@potatowagon
