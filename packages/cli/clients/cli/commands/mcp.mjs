// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file mcp command — `astryx mcp`, the CLI's commands as MCP tools.
 *
 * Intentionally CLI-special, like `manifest`: its tools are the manifest, which
 * describes the live Commander program, so an `api/mcp` entry would create an
 * `api → cli` cycle. The published package reads the manifest it stored, so
 * the run loads no other command; a checkout builds the manifest from every
 * command (see READS_EVERY_COMMAND in index.mjs). It serves until the client
 * closes standard input.
 *
 * The command surface comes from the colocated CommandDoc via `defineCommand`.
 */

import {resultSet} from '../../../foundation/debug/index.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {buildManifest, storedManifest} from '../lib/manifest.mjs';
import {serveMcp} from '../lib/mcp-server.mjs';
import {mcpInstructions, mcpTools, projectAgentText} from '../lib/mcp-tools.mjs';
import {doc as mcpCommand} from './mcp.doc.mjs';

/**
 * @param {import('commander').Command} program the root program
 * @param {{jsonSupported: Set<string>, version: string}} context the commands
 *   that accept --json, and the CLI's version
 */
export function registerMcp(program, {jsonSupported, version}) {
  defineCommand(program, mcpCommand, {
    action: async () => {
      const manifest = storedManifest() ?? buildManifest(program, {jsonSupported, version});
      const tools = mcpTools(manifest);
      const agentText = await projectAgentText(process.cwd());
      await serveMcp({
        tools,
        version,
        instructions: mcpInstructions(manifest, {agentText}),
      });
      // The tools served are the result: one per command.
      return resultSet({count: tools.length, resultKind: 'command'});
    },
  });
}
