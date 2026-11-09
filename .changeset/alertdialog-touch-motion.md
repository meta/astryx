---
'@astryxdesign/core': patch
---

[feat] AlertDialog: under a finger the alert appears the way an iOS alert does. It scales down into place from 1.2 while it and the dimming fade in, on your theme's dialog entrance duration and curve. When it closes, it fades out with the dimming. With reduced motion it fades in without the scale, over 200 ms, and fades out within 200 ms. While it fades out, its content is inert: a touch, a click, a key or an assistive-technology activation on it does nothing, and focus leaves it until it returns to the opener. A toast stays operable above it, so one the action raises takes a tap and is read at once. On a phone, an alert with no `width` prop is now UIKit's 320 px wide in every theme, not 400 px. A `width` you pass still wins. With a mouse nothing changes.

An announcement made through the shared announcement channel while the alert fades out under a finger, such as the words of a toast its action raises, is read. A live region inside the page's content stays inert until the fade ends.

@vjeux
