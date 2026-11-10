// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file isReactServer.ts
 * @input The `react` module that this module graph resolves
 * @output Exports isReactServer, true under React's `react-server` build
 * @position Internal utility for directive-free components. They render a
 *   plain element in React Server Components, and the same client part
 *   everywhere else, so a change of props never swaps the element type.
 */

import * as React from 'react';

/**
 * True when `react` resolves its `react-server` build, the build that renders
 * React Server Components. That build omits the state hooks, so the check
 * reads only whether `useState` exists and never calls it.
 */
export const isReactServer = !('useState' in React);
