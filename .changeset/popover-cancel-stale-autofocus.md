---
'@astryxdesign/core': patch
---

[fix] usePopover: a popover that closes or unmounts before its first frame no longer moves focus into its hidden content. Auto-focus waits a frame for the content to mount, and that frame is now cancelled with the open, so pressing Escape right after opening a Popover or a collapsed SideNav submenu leaves focus on the trigger.

@vjeux
