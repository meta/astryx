// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The exit codes of the render's host process (page-host.mjs) for each
 * way it ends without sending an answer. render-page.mjs reads them to say
 * why.
 * @position foundation/render — imported by page-host.mjs and render-page.mjs
 */

/** Exit codes for each way the host ends without sending an answer. */
export const HOST_EXIT = {
  disconnected: 70,
  timeout: 71,
  noChannel: 72,
  sendFailed: 73,
};
