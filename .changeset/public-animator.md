---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feat] `createAnimator(element)` and its hook `useAnimator(ref)` animate one element with the motion Astryx's components use; the hook takes the element's ref, so a gesture hook can share the element. `animate` springs `x`, `y`, `scale`, `rotate` and `opacity` to a target on the state-change motion, `decay` coasts any of them from a release velocity, `set` jumps, `get` and `getVelocity` read, and `stop` halts; `animate` and `decay` return a promise. Reduce Motion is planned for every call. `createAnimator` is exported from the package root and `useAnimator` from `@astryxdesign/core/hooks`; the CLI's templates gain a playing-cards example of each.

@vjeux
