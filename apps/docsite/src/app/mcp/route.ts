// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The docs site's MCP endpoint, over Streamable HTTP.
 *
 * It serves `astryx mcp --docs-only`: the CLI's commands that read the docs,
 * as tools, for the Astryx release the site documents (lib/mcpBridge.mjs).
 * A request is a POST. The endpoint keeps no session, so GET (an event
 * stream) and DELETE (ending a session) are not allowed.
 */

import {handleMcpPost, methodNotAllowed} from '../../lib/mcpBridge.mjs';

/** Seconds a request may run: the bridge stops a run with no answer at 55. */
export const maxDuration = 60;

export function POST(request: Request): Promise<Response> {
  return handleMcpPost(request);
}

export function GET(): Response {
  return methodNotAllowed();
}

export function DELETE(): Response {
  return methodNotAllowed();
}
