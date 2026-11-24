// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A process id that no process can hold, for fixtures that name the
 *   process of a command that stopped.
 * @input Nothing.
 * @output `UNASSIGNABLE_PID`.
 * @position Test support: the lock, temp-file and render-folder fixtures
 *   whose owner process must look gone.
 */

/** Above Linux's maximum PID, so no live process can hold it. */
export const UNASSIGNABLE_PID = 2 ** 22 + 7;
