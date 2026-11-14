// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The MCP server answers each tool call with the command's own output:
 * it negotiates the protocol, lists the tools it was given, runs each call as
 * a command line, passes stdout through unchanged, and stops what a client
 * cancels. The end-to-end case starts the real bin, `astryx mcp`, and compares
 * a tool's answer byte for byte with the same command run directly.
 */

import {describe, expect, it} from 'vitest';
import {spawn, spawnSync} from 'node:child_process';
import * as readline from 'node:readline';
import {PassThrough} from 'node:stream';
import {CLI_BIN, PROTOCOL_VERSIONS, serveMcp} from './mcp-server.mjs';

/** @type {import('./mcp-tools.mjs').McpTool} */
const SEARCH = {
  name: 'search',
  words: ['search'],
  title: 'astryx search',
  description: 'Search everything',
  inputSchema: {type: 'object', properties: {query: {type: 'array'}}, additionalProperties: false},
  args: [{key: 'query', required: true, variadic: true}],
  options: [{key: 'limit', long: '--limit', takes: 'value', variadic: false}],
};

/**
 * A server on in-memory streams, with a fake command runner.
 * @param {(argv: string[], options: {cwd: string, signal: AbortSignal}) => Promise<any>} run
 */
function start(run) {
  const input = new PassThrough();
  const output = new PassThrough();
  /** @type {any[]} */
  const replies = [];
  /** @type {Map<unknown, (reply: any) => void>} */
  const waiting = new Map();
  readline.createInterface({input: output}).on('line', line => {
    const reply = JSON.parse(line);
    replies.push(reply);
    const key = Array.isArray(reply) ? 'batch' : reply.id;
    waiting.get(key)?.(reply);
    waiting.delete(key);
  });
  const done = serveMcp({
    tools: [SEARCH],
    version: '9.9.9',
    instructions: 'Use the tools.',
    root: '/project',
    input,
    output,
    run: /** @type {any} */ (run),
  });
  /** @param {unknown} message */
  const send = message => input.write(`${JSON.stringify(message)}\n`);
  /** @param {any} message */
  const ask = message => {
    const key = Array.isArray(message) ? 'batch' : message.id;
    const reply = new Promise(resolve => waiting.set(key, resolve));
    send(message);
    return /** @type {Promise<any>} */ (reply);
  };
  /** @param {string} text a line that is not a JSON message */
  const raw = text => {
    const reply = new Promise(resolve => waiting.set(null, resolve));
    input.write(`${text}\n`);
    return /** @type {Promise<any>} */ (reply);
  };
  return {send, ask, raw, replies, close: () => input.end(), done};
}

/** @param {Partial<{stdout: string, stderr: string, exitCode: number}>} result */
const finished = result => async () => ({stdout: '', stderr: '', exitCode: 0, signal: null, ...result});

describe('serveMcp', () => {
  it('negotiates the protocol version and names itself', async () => {
    const server = start(finished({}));
    const known = await server.ask({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-03-26'}});
    expect(known.result.protocolVersion).toBe('2025-03-26');
    expect(known.result.serverInfo).toMatchObject({name: 'astryx', version: '9.9.9'});
    expect(known.result.instructions).toBe('Use the tools.');
    expect(known.result.capabilities).toEqual({tools: {listChanged: false}});
    const unknown = await server.ask({jsonrpc: '2.0', id: 2, method: 'initialize', params: {protocolVersion: '1999-01-01'}});
    expect(unknown.result.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
    server.close();
    await server.done;
  });

  it('lists the tools it was given, with their schemas only', async () => {
    const server = start(finished({}));
    const reply = await server.ask({jsonrpc: '2.0', id: 1, method: 'tools/list'});
    expect(reply.result.tools).toEqual([
      {name: 'search', title: 'astryx search', description: 'Search everything', inputSchema: SEARCH.inputSchema},
    ]);
    server.close();
    await server.done;
  });

  it('runs a call as its command line and answers with stdout unchanged', async () => {
    /** @type {any[]} */
    const calls = [];
    const stdout = '{\n  "apiVersion": 1,\n  "type": "search"\n}\n';
    const server = start(async (argv, options) => {
      calls.push({argv, cwd: options.cwd});
      return {stdout, stderr: '', exitCode: 0, signal: null};
    });
    const reply = await server.ask({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {name: 'search', arguments: {query: ['dark mode'], limit: '3'}},
    });
    expect(calls).toEqual([{argv: ['search', '--limit=3', '--json', '--', 'dark mode'], cwd: '/project'}]);
    expect(reply).toEqual({jsonrpc: '2.0', id: 7, result: {content: [{type: 'text', text: stdout}], isError: false}});
    server.close();
    await server.done;
  });

  it('answers a command that exits non-zero as an error, with stderr after stdout', async () => {
    const server = start(finished({stdout: '{"error":"no"}\n', stderr: 'warning\n', exitCode: 1}));
    const reply = await server.ask({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'search', arguments: {query: ['x']}}});
    expect(reply.result).toEqual({
      content: [
        {type: 'text', text: '{"error":"no"}\n'},
        {type: 'text', text: 'warning\n'},
      ],
      isError: true,
    });
    server.close();
    await server.done;
  });

  it('refuses an unknown tool, an unknown method, and a line that is not JSON', async () => {
    const server = start(finished({}));
    expect((await server.ask({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'nope'}})).error.code).toBe(-32602);
    expect((await server.ask({jsonrpc: '2.0', id: 2, method: 'resources/list'})).error.code).toBe(-32601);
    expect(await server.raw('not json')).toMatchObject({id: null, error: {code: -32700}});
    expect((await server.ask({jsonrpc: '2.0', id: 3, method: 'ping'})).result).toEqual({});
    server.close();
    await server.done;
  });

  it('answers a call it cannot turn into a command line as a tool error', async () => {
    const server = start(finished({}));
    const reply = await server.ask({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {name: 'search', arguments: {query: ['x'], cwd: '../outside'}},
    });
    expect(reply.result.isError).toBe(true);
    expect(reply.result.content[0].text).toContain('cwd must be inside /project');
    server.close();
    await server.done;
  });

  it('answers a batch with a batch, and a notification with nothing', async () => {
    const server = start(finished({}));
    const reply = await server.ask([
      {jsonrpc: '2.0', id: 1, method: 'ping'},
      {jsonrpc: '2.0', method: 'notifications/initialized'},
      {jsonrpc: '2.0', id: 2, method: 'ping'},
    ]);
    expect(reply).toEqual([
      {jsonrpc: '2.0', id: 1, result: {}},
      {jsonrpc: '2.0', id: 2, result: {}},
    ]);
    server.close();
    await server.done;
    expect(server.replies).toHaveLength(1);
  });

  it('stops a call the client cancels and does not answer it', async () => {
    /** @type {AbortSignal | null} */
    let seen = null;
    const server = start(
      (_argv, {signal}) =>
        new Promise(resolve => {
          seen = signal;
          signal.addEventListener('abort', () => resolve({stdout: '', stderr: '', exitCode: null, signal: 'SIGTERM'}));
        }),
    );
    server.send({jsonrpc: '2.0', id: 9, method: 'tools/call', params: {name: 'search', arguments: {query: ['x']}}});
    await new Promise(resolve => setTimeout(resolve, 20));
    server.send({jsonrpc: '2.0', method: 'notifications/cancelled', params: {requestId: 9}});
    const ping = await server.ask({jsonrpc: '2.0', id: 10, method: 'ping'});
    expect(ping.id).toBe(10);
    expect(/** @type {any} */ (seen)?.aborted).toBe(true);
    server.close();
    await server.done;
    expect(server.replies.map(r => r.id)).toEqual([10]);
  });

  it('stops every running call when the client goes away', async () => {
    /** @type {AbortSignal | null} */
    let seen = null;
    const server = start(
      (_argv, {signal}) =>
        new Promise(resolve => {
          seen = signal;
          signal.addEventListener('abort', () => resolve({stdout: '', stderr: '', exitCode: null, signal: 'SIGTERM'}));
        }),
    );
    server.send({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'search', arguments: {query: ['x']}}});
    await new Promise(resolve => setTimeout(resolve, 20));
    server.close();
    await server.done;
    expect(/** @type {any} */ (seen)?.aborted).toBe(true);
  });
});

describe('astryx mcp, the real bin', () => {
  it('answers a tool call with exactly what the command prints with --json, and writes only protocol to stdout', async () => {
    const direct = spawnSync(process.execPath, [CLI_BIN, 'docs', 'cli/commands/mcp', '--json'], {
      encoding: 'utf8',
      env: {...process.env, CI: ''},
    });
    expect(direct.status).toBe(0);

    const child = spawn(process.execPath, [CLI_BIN, 'mcp'], {stdio: ['pipe', 'pipe', 'pipe'], env: {...process.env, CI: ''}});
    /** @type {string[]} */
    const lines = [];
    /** @type {Map<number, (reply: any) => void>} */
    const waiting = new Map();
    readline.createInterface({input: child.stdout}).on('line', line => {
      lines.push(line);
      const reply = JSON.parse(line);
      waiting.get(reply.id)?.(reply);
    });
    /** @param {number} id @param {string} method @param {unknown} params */
    const ask = (id, method, params) => {
      const reply = new Promise(resolve => waiting.set(id, resolve));
      child.stdin.write(`${JSON.stringify({jsonrpc: '2.0', id, method, params})}\n`);
      return /** @type {Promise<any>} */ (reply);
    };
    const init = await ask(1, 'initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'test', version: '1'}});
    expect(init.result.serverInfo.name).toBe('astryx');
    const list = await ask(2, 'tools/list', {});
    expect(list.result.tools.map((/** @type {any} */ t) => t.name)).toContain('docs');
    const call = await ask(3, 'tools/call', {name: 'docs', arguments: {topic: 'cli/commands/mcp'}});
    expect(call.result.isError).toBe(false);
    expect(call.result.content).toEqual([{type: 'text', text: direct.stdout}]);
    child.stdin.end();
    const code = await new Promise(resolve => child.on('close', resolve));
    expect(code).toBe(0);
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
  }, 60_000);

  it('refuses --json before serving: stdout carries the protocol', () => {
    const run = spawnSync(process.execPath, [CLI_BIN, 'mcp', '--json'], {encoding: 'utf8', input: ''});
    expect(run.status).toBe(1);
    expect(JSON.parse(run.stdout)).toMatchObject({code: 'ERR_INVALID_OPTION'});
  });
});
