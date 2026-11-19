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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {DELETE, GET, POST} from '../app/mcp/route';
import {
  askMcpServer,
  commandEnv,
  handleMcpPost,
  mcpRuntime,
} from '../lib/mcpBridge.mjs';
import {DEMO_CONTENT_MODULE} from '../../../../packages/cli/foundation/discovery/template-adapter.mjs';
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
    // A docs-only tool takes no `base`, so the instructions do not offer it.
    expect(reply.result?.instructions).not.toContain('--base');
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
      content: [
        {type: 'text', text: 'template takes no "path" on this server'},
      ],
      isError: true,
    });
  }, 60_000);

  it('hands out example source as the CLI commands do (spec:AST-033 FR23)', async () => {
    // The component tool keeps a showcase's fixture media; the template tool
    // answers as a copy writes it, with media and demo contents replaced.
    const showcase = await ask('tools/call', {
      name: 'component',
      arguments: {names: ['AspectRatio'], showcase: true},
    });
    const showcaseText = showcase.result?.content?.[0]?.text ?? '';
    expect(showcaseText).toContain('/template-assets/');
    expect(showcaseText).not.toContain(DEMO_CONTENT_MODULE);

    const media = await ask('tools/call', {
      name: 'template',
      arguments: {name: 'AspectRatioCircleImage'},
    });
    const mediaAnswer = JSON.parse(media.result?.content?.[0]?.text ?? '{}');
    expect(mediaAnswer.data.demoMediaReplaced).toBeGreaterThan(0);
    expect(mediaAnswer.data.source).not.toContain('/template-assets/');

    const demo = await ask('tools/call', {
      name: 'template',
      arguments: {name: 'usePressFeedbackHookUsage'},
    });
    const demoAnswer = JSON.parse(demo.result?.content?.[0]?.text ?? '{}');
    expect(demoAnswer.data.demoContentReplaced).toBeGreaterThan(0);
    expect(demoAnswer.data.source).not.toContain(DEMO_CONTENT_MODULE);
  }, 60_000);

  it('answers a batch and an invalid message as the server does', async () => {
    const batch = await post([
      {jsonrpc: '2.0', id: 1, method: 'ping'},
      {jsonrpc: '2.0', id: 2, method: 'ping'},
    ]);
    expect(batch.status).toBe(200);
    expect(await batch.json()).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32600,
        message: 'This server takes one message at a time, not a batch',
      },
    });

    const invalid = await post({jsonrpc: '2.0'});
    expect(invalid.status).toBe(200);
    expect(await invalid.json()).toMatchObject({
      id: null,
      error: {code: -32600},
    });
  }, 60_000);

  it('takes a notification and a response with 202 and starts no server, and refuses a body that is not JSON', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-mcp-bridge-'));
    try {
      const started = path.join(dir, 'started');
      const bin = path.join(dir, 'server.mjs');
      fs.writeFileSync(
        bin,
        `import {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(started)}, '');\n`,
      );
      for (const message of [
        {jsonrpc: '2.0', method: 'notifications/initialized'},
        {jsonrpc: '2.0', id: 3, result: {}},
        {jsonrpc: '2.0', id: null, error: {code: -32603, message: 'x'}},
      ]) {
        const response = await handleMcpPost(
          new Request('https://astryx.atmeta.com/mcp', {
            method: 'POST',
            body: JSON.stringify(message),
          }),
          {bin, cwd: dir},
        );
        expect(response.status).toBe(202);
        expect(await response.text()).toBe('');
      }
      expect(fs.existsSync(started)).toBe(false);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }

    const broken = await post('{not json');
    expect(broken.status).toBe(400);
    expect(await broken.json()).toMatchObject({error: {code: -32700}});
  });

  it.skipIf(process.platform === 'win32')(
    'stops the server and every command it started when no answer comes in time',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-mcp-bridge-'));
      try {
        const pidFile = path.join(dir, 'command.pid');
        const bin = path.join(dir, 'server.mjs');
        // A server that starts a command and never answers.
        fs.writeFileSync(
          bin,
          [
            "import {spawn} from 'node:child_process';",
            "import {writeFileSync} from 'node:fs';",
            "const command = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: 'ignore'});",
            `writeFileSync(${JSON.stringify(pidFile)}, String(command.pid));`,
            'setInterval(() => {}, 1000);',
            '',
          ].join('\n'),
        );
        await expect(
          askMcpServer(
            {bin, cwd: dir},
            {jsonrpc: '2.0', id: 1, method: 'ping'},
            {timeoutMs: 1500},
          ),
        ).rejects.toThrow('astryx mcp gave no answer in 1.5 s');
        const pid = Number(fs.readFileSync(pidFile, 'utf8'));
        const running = () => {
          const state = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], {
            encoding: 'utf8',
          }).stdout.trim();
          return state !== '' && !state.startsWith('Z');
        };
        for (let tries = 0; running() && tries < 50; tries += 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        expect(running()).toBe(false);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    30_000,
  );

  it('opens no event stream and keeps no session', () => {
    for (const response of [GET(), DELETE()]) {
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('POST');
    }
  });
});
