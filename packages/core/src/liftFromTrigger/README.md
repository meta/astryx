# LiftFromTrigger

The one lift-from-trigger presentation, internal to core and opt-in. A
surface that chooses it (ContextMenu's touch invocation) lifts its trigger
out of the page above a tinted backdrop, fades a surface (a menu) in beside it, and
returns the trigger to its place. Nothing else gets it by default, and any
surface that lifts uses this module, never a copy of it.
Nothing here is exported from the package entry point; components import it
by path.

Layer stays generic. The top layer, dismissal and the input hold
(`Layer/inputHold.ts`) belong to Layer; the lift only uses them. Its
motion is the rect morph's (`motion/rectMorph.ts`), and its springs, scale
rule and gap are the caller's own.

## What a lift adds

The trigger itself lifts, not a copy: it becomes a manual popover in the top
layer, laid out at its own size where it stood, so no clipping, transformed
or stacking ancestor cuts or covers it, and an empty placeholder after it
holds its spot, so the page does not move. In a list the placeholder is an
`li` that is not a list item, so the list stays valid and keeps its numbers.
The trigger takes no hits while lifted: a tap on it is a tap on the backdrop.
While lifted the page has three
elements more, whatever the trigger holds: the lift layer (its `::backdrop`
is the tint); an empty box at the lifted rect for the surface to be placed
against (anchor positioning follows transforms, so a box inside the trigger
would move with it); and the placeholder. The lifted trigger casts no
shadow. The input hold's shield joins while the lift grows and while it
closes: never more than four (`spec:AST-017` FR60, DEC-29). At rest there
is nothing.

## Motion

Every motion is `translate`, `scale` or `opacity` on the compositor
(`spec:AST-094` FR5): the trigger and the surface on the rect morph,
which continues an interrupted motion with the velocity on screen (FR6); the
tint on the animator, as the opacity of the layer's `::backdrop`, so a drop
while it rises turns it with its velocity too. A
tap or a drag that lands while the lift grows and the surface enters reaches nothing
(FR35). The close holds the layer until the trigger is back and every press
on the layer has lifted. Its timers and
listeners end with it, and an unmount ends everything at once
(FR24). Reduce Motion is the animator's (`design:reduced-motion`).

## Files

| File                                                    | What it is                                                                                                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `liftFromTrigger.ts`                                    | `createLiftFromTrigger`: lift a trigger, fade a surface in beside it, drop, end. Its geometry: how far the trigger grows, where it lands inside the layer runtime's gutter, which side the surface takes. |
| `__tests__/liftFromTrigger.interaction.browser.spec.ts` | Browser proofs (Chromium and WebKit): the top layer, the placeholder, the properties that move, counts, leaks.                                                                                            |
