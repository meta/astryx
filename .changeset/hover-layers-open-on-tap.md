---
'@astryxdesign/core': patch
---

[fix] Tooltip and HoverCard answer a touch only once it is a tap. On a touch screen they used to open as soon as a finger landed on a trigger that performs no action, so a scroll that started on an info icon or an abbreviation opened its tooltip and left it open, and a finger resting on the trigger opened it too. Now the tap opens the layer when the finger lifts, and a touch that turns into a scroll never opens it, the way a tap on iOS behaves. A tap-opened tooltip or card closes when a tap outside lifts, or as soon as a scroll that starts outside takes the touch, which is when iOS dismisses a popover; before, it closed the moment a finger landed anywhere else. Triggers that perform an action keep their tap, and `touchTrigger` keeps its meaning.

@vjeux
