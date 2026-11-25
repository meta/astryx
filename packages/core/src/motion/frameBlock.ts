// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file frameBlock.ts
 * @input A document's timelines and its window's clock
 * @output LATE_START_MS, and motionNow: the clock the motion modules date
 *   their curves on
 * @position The motion modules' shared frame timing: the measure of a
 *   main-thread block, and the clock that follows the document timeline
 */

import {sharedWeakMap} from '../utils/sharedRealm';

/**
 * How long a task must run on past a frame, or past its first call from rest,
 * to count as a block. It is two frames at 60 Hz. Browser start times are
 * frame times, while a task's end is on a live clock. So only a block longer
 * than a frame plus the task's own length stands out from that quantization.
 */
export const LATE_START_MS = 34;

/**
 * A timeline at real speed for each document, or null where the browser has
 * no `DocumentTimeline` constructor. DevTools' animation speed slows only the
 * document's own timeline, so the gap between the two is how far that timeline
 * runs behind real time.
 */
const realTimelines = sharedWeakMap<Document, AnimationTimeline | null>(
  'motion/clock/real-timelines',
  1,
);

/**
 * Each document's last frame as both timelines read it, and its timeline's
 * speed against real time between its two last frames.
 */
const timelineFrames = sharedWeakMap<
  Document,
  {timeline: number; real: number; speed: number}
>('motion/clock/timeline-frames', 1);

function realTimeline(doc: Document): AnimationTimeline | null {
  let timeline = realTimelines.get(doc);
  if (timeline === undefined) {
    const Timeline = doc.defaultView?.DocumentTimeline;
    timeline = typeof Timeline === 'function' ? new Timeline() : null;
    realTimelines.set(doc, timeline);
  }
  return timeline;
}

/**
 * The time on `doc`'s motion clock (ms): the time of the timeline that draws
 * its curves, on its own window's `performance.now()` base. At full speed it
 * is that `performance.now()`. While DevTools slows the timeline, the clock
 * reads the timeline's time for the current frame. It adds the real time since
 * that frame, at the timeline's speed. Both timelines keep their frame's time
 * for a whole task, so the clock still moves at real speed through a long task
 * at full speed. With no document it reads `performance.now()`.
 */
export function motionNow(
  doc: Document | undefined = typeof document === 'undefined'
    ? undefined
    : document,
): number {
  const clock =
    doc?.defaultView?.performance ??
    (typeof performance === 'undefined' ? undefined : performance);
  const now = clock == null ? Date.now() : clock.now();
  const timeline = doc?.timeline?.currentTime;
  if (doc == null || typeof timeline !== 'number') {
    return now;
  }
  const real = realTimeline(doc)?.currentTime;
  if (typeof real !== 'number' || real === timeline) {
    return now;
  }
  const last = timelineFrames.get(doc);
  let speed = last?.speed ?? 1;
  if (last != null && real > last.real) {
    const measured = (timeline - last.timeline) / (real - last.real);
    speed = Number.isFinite(measured) && measured >= 0 ? measured : speed;
  }
  if (last == null || real !== last.real) {
    timelineFrames.set(doc, {timeline, real, speed});
  }
  return timeline + speed * (now - real);
}
