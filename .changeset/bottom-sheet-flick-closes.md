---
'@astryxdesign/core': patch
---

[fix] BottomSheet: a touch release takes the iOS sheet's measured values, and a release moving back toward where the drag began cancels. A release faster than about 1,000 px/s is a flick: it goes at least to the next detent in its direction, so a short fast flick at the lowest detent closes the sheet instead of springing back. From a higher detent, a flick that would carry past the next detent goes on, so a hard flick closes the sheet and a softer one stops at the next detent. A slow or medium touch throw now travels less than before, and a slow touch drag closes the sheet only past halfway to closed. A mouse or pen drag is unchanged.

@vjeux
