// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file frameBlock.ts
 * @input none
 * @output LATE_START_MS
 * @position The motion modules' shared measure of a main-thread block.
 */

/**
 * How long a task must run on past a frame, or past its first call from rest,
 * to count as a block. It is two frames at 60 Hz. Browser start times are
 * frame times, while a task's end is on a live clock. So only a block longer
 * than a frame plus the task's own length stands out from that quantization.
 */
export const LATE_START_MS = 34;
