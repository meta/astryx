---
'@astryxdesign/core': patch
---

[feature] Where the primary pointer is coarse (a phone or tablet), a finger's open grows DropdownMenu and MoreMenu out of their trigger on UIKit's open spring, and they collapse back into it on the close spring, as UIMenu does. Both run on the compositor and can be interrupted either way. Under Reduce Motion the menu fades in place (the animator's policy). There, a pan that starts outside the open menu dismisses it as the page scrolls, and focus that was in the menu returns to the trigger. A mouse or keyboard open, on any device, or `presentation="popover"`, keeps the layer's entrance and the theme's motion.

@vjeux
