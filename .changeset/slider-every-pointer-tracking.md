---
'@astryxdesign/core': patch
---

[fix] Slider: every pointer drags a thumb by its travel, as UISlider does. A press on a thumb no longer jumps the value to the pointer: once the pointer has moved 10 px, the value follows its further travel along the track. A finger or a pen claims the drag only along the track, so a swipe across the slider scrolls the page; a mouse claims in any direction. On a touch screen each thumb takes a finger or a pen through a 48 px target, capped at half the gap to a range's other thumb, and the held thumb lifts. After a finger's flick the thumb coasts on UISlider's measured spring for about 0.6 s, `onChange` firing through the coast, and `onChangeEnd` reports the value once it settles; a slow drag, a mouse drag and a pen drag end at the release. A tap on the track sets the value when the finger lifts, and a mouse click where it lands; a right click and a macOS ctrl-click change nothing. Under reduced motion the thumb does not lift and a tap's value applies at once.
@vjeux
