---
'@astryxdesign/core': patch
---

[docs] `astryx hook --list` groups the motion hooks under one category, "Motion & gestures": `useAnimatedLayout`, `useAnimator`, `useEntryAnimation`, `usePanGesture` and `usePressFeedback`; the docs of `createAnimator` and `createPanGesture` carry the same category. The "Animation" group goes away. `useLongPress`, `useMenuPress` and the other interaction hooks stay under "Interaction".

@cixzhang
