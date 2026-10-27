# LiftFromTrigger

The one lift-from-trigger presentation, internal to core and opt-in. A
surface that chooses it (ContextMenu's touch invocation) lifts its trigger
out of the page above a tinted backdrop, grows a surface (a menu) out of the
press beside it, shrinks that surface back into the press when it closes, and
returns the trigger to its place. A viewer's zoom from a thumbnail lifts a
copy of the thumbnail's picture instead (below). Nothing else gets it by
default, and any surface that lifts uses this module, never a copy of it.
Nothing here is exported from the package entry point; components import it
by path.

Layer stays generic. The top layer, dismissal, the input hold
(`Layer/inputHold.ts`) and the shared exit copy
(`Layer/layerExitCopy.ts`) belong to Layer; the lift only uses them. Its
motion is the rect morph's (`motion/rectMorph.ts`), and its springs, scale
rule and gap are the caller's own.

## What a lift adds

The trigger itself lifts, not a copy: it becomes a manual popover in the top
layer, laid out at its own size where it stood, so no clipping, transformed
or stacking ancestor cuts or covers it, and an empty placeholder after it
holds its spot, so the page does not move. While lifted the page has four
elements more, whatever the trigger holds: the lift layer (its `::backdrop`
is the tint); the shadow, a box in the layer that follows the trigger on a
rect morph of its own (an animated `::backdrop` of the trigger would restyle
and lay out the page on every frame); an empty box at the lifted rect for
the surface to be placed against (anchor positioning follows transforms, so
a box inside the trigger would move with it); and the placeholder. The input hold's shield joins while the lift grows and
while it closes: never more than five (`spec:AST-017` FR60, DEC-29). The
exit copy the surface shrinks on is the layer runtime's transient copy. At
rest there is nothing.

## The zoom's copy

A zoom from a thumbnail into a viewer (UIKit's `.zoom`) needs the
thumbnail's picture between the viewer's backdrop and its photo, which a
trigger in the top layer cannot be: it would cover the whole viewer, or sit
under its backdrop. So `liftCopy(source, {host, src})` lifts a copy, the one
transient clone `architecture:layer-runtime` INV15 allows: one image of the
source's picture (aspect fill, its corners) in the viewer's host at the
source's box, inert and hidden from assistive technology, while the source
hides where it stands and keeps its layout (no placeholder). The viewer moves
the copy on the rect morph with its own paths and springs; a close during the
opening turns the same copy around from the rect on screen, with its
velocity. `drop()` at the landing, or on unmount, takes the copy away and
shows the source as it was, once the last copy of it drops. While a copy is
up the page has one element more.

## Motion

Every motion is `translate`, `scale` or `opacity` on the compositor
(`spec:AST-094` FR5): the trigger, its shadow and the surface on the rect morph,
which continues an interrupted motion with the velocity on screen (FR6); the
tint as a spring-sampled Web Animation of the layer's `::backdrop`. A
tap or a drag that lands while the lift and the surface grow reaches nothing
(FR35). The close holds the layer until the trigger is back, the surface's
exit is done and every press on the layer has lifted. Its timers and
document listeners end with it, and an unmount ends everything at once
(FR24). Reduce Motion is the animator's (`design:reduced-motion`).

## Files

| File                                                    | What it is                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `liftFromTrigger.ts`                                    | `createLiftFromTrigger`: lift a trigger, grow and close a surface beside it, drop, end. `liftCopy`: the zoom's copy.            |
| `useLiftFromTrigger.ts`                                 | A component's one lift, ended when it unmounts.                                                                                 |
| `liftFromTriggerGeometry.ts`                            | How far the trigger grows, where it lands inside the layer runtime's gutter, which side the surface takes.                      |
| `__tests__/liftFromTrigger.interaction.browser.spec.ts` | Browser proofs (Chromium and WebKit): the top layer, the placeholder, the properties that move, counts, leaks, the zoom's copy. |
