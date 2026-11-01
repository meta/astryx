---
'@astryxdesign/core': patch
---

[fix] A toast that is closing when a new toast takes its visible place under `maxVisible`, or that the same handler pushes out and then dismisses, leaves the stack at once. Before, it came back later as an invisible, empty row that kept the notifications landmark, took one of the visible places, and let F6 move focus to its hidden dismiss button. A second `collisionBehavior: 'ignore'` toast with the same `uniqueID`, raised in the same handler as the first, is now dropped unannounced, as it already was once the first had rendered. When a control inside a toast raises toasts and then dismisses its own toast, focus moves to a toast that shows, the new one included, instead of to the notifications region.

@vjeux
