// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The docs site's MCP endpoint serves `astryx mcp --docs-only`.
 *
 * Each request goes to the command, and each answer is the command's: the
 * tools are the CLI's commands that read the docs, and a tool call answers
 * with exactly what that command prints with --json.
 *
 * Run: pnpm -F @astryxdesign/docsite test
 */

import {spawnSync} from 'node:child_process';
import {describe, expect, it} from 'vitest';
import {DELETE, GET, POST} from '../app/mcp/route';
import {commandEnv, mcpRuntime} from '../lib/mcpBridge.mjs';
import {DOCS_ONLY_COMMANDS} from '../../../../packages/cli/clients/cli/lib/mcp-tools.mjs';

/**
 * POST one body to the endpoint.
 * @param body the request body, as JSON or as raw text
 */
function post(body: unknown): Promise<Response> {
  return POST(
    new Request('https://astryx.atmeta.com/mcp', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

/** The parts of a JSON-RPC reply these tests read. */
interface McpReply {
  id: number;
  result?: {
    serverInfo?: {name: string; title: string};
    instructions?: string;
    tools?: Array<{
      name: string;
      inputSchema: {properties: Record<string, unknown>};
    }>;
    isError?: boolean;
    content?: Array<{type: string; text: string}>;
  };
  error?: {code: number; message: string};
}

/** POST one request and read the JSON-RPC reply. */
async function ask(method: string, params: unknown, id = 1): Promise<McpReply> {
  const response = await post({jsonrpc: '2.0', id, method, params});
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/json');
  return (await response.json()) as McpReply;
}

describe('the docs site MCP endpoint', () => {
  it('names itself as the CLI and gives the docs-only instructions', async () => {
    const reply = await ask('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {name: 'test', version: '1'},
    });
    expect(reply.result?.serverInfo).toMatchObject({
      name: 'astryx',
      title: 'Astryx CLI',
    });
    expect(reply.result?.instructions).toContain(
      'only the astryx commands that read the docs',
    );
  }, 60_000);

  it('lists the CLI commands that read the docs, with no folder input', async () => {
    const reply = await ask('tools/list', {});
    const tools = reply.result?.tools ?? [];
    expect(tools.map(tool => tool.name).sort()).toEqual(
      DOCS_ONLY_COMMANDS.map(name => name.replaceAll(' ', '_')).sort(),
    );
    for (const tool of tools) {
      expect(Object.keys(tool.inputSchema.properties)).not.toContain('cwd');
    }
  }, 60_000);

  it('answers a call with exactly what the command prints with --json', async () => {
    const {bin, cwd} = mcpRuntime();
    const direct = spawnSync(
      process.execPath,
      [bin, 'component', '--json', '--', 'Button'],
      {cwd, encoding: 'utf8', env: commandEnv()},
    );
    expect(direct.status).toBe(0);

    const reply = await ask('tools/call', {
      name: 'component',
      arguments: {names: ['Button']},
    });
    expect(reply.result?.isError).toBe(false);
    expect(reply.result?.content?.[0]).toEqual({
      type: 'text',
      text: direct.stdout,
    });
  }, 60_000);

  it('refuses a tool that writes or reads a path, and an input a tool does not list', async () => {
    const unknown = await ask('tools/call', {name: 'init', arguments: {}});
    expect(unknown.error?.message).toBe('Unknown tool: init');

    const pathInput = await ask('tools/call', {
      name: 'template',
      arguments: {name: 'settings', path: 'src/app'},
    });
    expect(pathInput.result).toEqual({
      content: [{type: 'text', text: 'template takes no path on this server'}],
      isError: true,
    });
  }, 60_000);

  it('accepts a notification with no reply, and refuses a body that is not JSON', async () => {
    const notification = await post({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(notification.status).toBe(202);
    expect(await notification.text()).toBe('');

    const broken = await post('{not json');
    expect(broken.status).toBe(400);
    expect(await broken.json()).toMatchObject({error: {code: -32700}});
  });

  it('opens no event stream and keeps no session', () => {
    for (const response of [GET(), DELETE()]) {
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('POST');
    }
  });
});
