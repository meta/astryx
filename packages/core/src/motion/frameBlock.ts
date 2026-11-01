// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @input none
 * @output LATE_START_MS
 * @position The motion modules' shared measure of a main-thread block.
 */

/**
 * How long a task must run on past a frame, or past its first call from rest,
 * before that counts as a block: two frames at 60 Hz. Browser start times are
 * frame times and a task's end a live clock, so only a block longer than a
 * frame plus the task's own length can be told apart from that quantization.
 */
export const LATE_START_MS = 34;
