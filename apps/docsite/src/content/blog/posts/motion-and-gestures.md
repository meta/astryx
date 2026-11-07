---
title: 'Motion and gestures in Astryx'
description: 'Throw, flip, swipe, reorder, snap and resize: three live demos built with Astryx components and motion hooks, with Reduce Motion and keyboard paths built in.'
date: '2026-11-02'
type: 'design'
draft: true
authors:
  - 'team'
tags:
  - 'Motion'
  - 'Components'
  - 'Accessibility'
---

People expect an interface to move like a real thing: a card follows the finger, keeps its speed when it is let go, and settles where it lands. With Astryx you can now build that into your own surfaces, with the same springs, press feel and accessibility rules the components use.

Each demo below runs live in this page. Try it with a mouse, a trackpad, a finger or the keyboard.

## Polaroids

Throw a photo up onto the table: it keeps your finger's speed and spins by how far off-center you held it, and the table edge pulls back like a rubber band. Switch between Stack, Fan and Spread while the photos still glide, and each one turns toward its new slot from where it is. Tap a photo to flip it to its handwritten caption. Swipe one down, fast, to put it away; a slow swipe snaps back. Hold a photo to reorder it, and an accent line shows where it will drop.

```tsx live
import {PolaroidTable} from './Polaroids';

export default function Polaroids() {
  return <PolaroidTable />;
}
```

The flip is a true 3D turn: the photo rotates about its vertical center in perspective, both faces hide their back side, and a critically damped spring times the turn so it never overshoots past flat. The press lift, the long press and the press tint come from Astryx: `usePressFeedback` and `useLongPress`.

## Kanban

Drag a card to another column or to a new place in its own column, and the cards around it glide out of the way. Flick a card sideways, fast, to archive it; a slow or short flick snaps it back. Press the archive to fan the archived cards out, and press it again mid-glide to watch them turn back.

```tsx live
import {KanbanBoard} from './Kanban';

export default function Kanban() {
  return <KanbanBoard />;
}
```

The board is built from Astryx `Card`, `Badge`, `Button` and `Text`. A card you add or restore enters with `useEntryAnimation`.

## Calendar

Drag an event to a new time or day: it snaps to 15-minute slots and to day columns, and a fast release lands one step further. Drag an event's bottom edge to change its length, also in 15-minute steps.

```tsx live
import {WeekCalendar} from './Calendar';

export default function Calendar() {
  return <WeekCalendar />;
}
```

The bottom edge is Astryx `ResizeHandle` with `useResizable`. Snap points make the length rest only on whole slots:

```tsx
const length = useResizable({
  direction: 'vertical',
  defaultSize: 4 * SLOT, // one hour
  minSize: SLOT, // 15 minutes
  snaps: slots.map(slot => slot * SLOT),
});

<ResizeHandle
  direction="vertical"
  position="overlay"
  resizable={length.props}
  label="Length of Design review"
/>;
```

## What is public today, and what is coming

The demos use Astryx components (`Button`, `SegmentedControl`, `Card`, `Badge`, `Text`, `ResizeHandle`) and public hooks (`usePressFeedback`, `useLongPress`, `useEntryAnimation`, `useResizable`, `useAnnounce`).

The pan, swipe, reorder, snap and spring animator parts are small helpers inside each demo, in `motion.ts` beside this post. Public APIs for them are coming. Until then, copy the helpers if they help.

## Reduce Motion

When your device asks for reduced motion, nothing flies, spins or bounces. Photos, cards and events move straight to their new place, and the photo flip becomes a cross-fade between its two faces. Every gesture still works.

## Accessibility

- Every demo works with the keyboard. Tab to a photo, card or event; Enter picks it up, the arrow keys move it, Enter drops it and Escape puts it back. Space flips a photo, and Delete puts a photo or card away.
- Focus uses the Astryx focus ring, and a picked-up item shows an accent outline.
- Each move is announced to screen readers, for example "Moved “Focus rings” to Doing, position 1."
- Escape also cancels a drag in progress, and a drag that the browser cancels puts the item back.
- Every gesture has a button or a key, so nothing needs a precise flick.
