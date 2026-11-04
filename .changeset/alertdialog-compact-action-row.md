---
'@astryxdesign/core': patch
---

[feat] AlertDialog: under a finger on a compact screen (the theme's compact definition: by default narrower than 768px or shorter than 500px), the two actions share a row in equal halves, Cancel leading, when each label fits its half on one line. When one does not, they stack, the destructive action above Cancel: as before on a portrait phone, and new on a landscape phone, where the actions used to sit in a trailing row. Right to left, Cancel leads on the right. With a mouse nothing changes: the actions stack at 640px and below.

@vjeux
