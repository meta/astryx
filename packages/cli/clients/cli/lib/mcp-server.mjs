// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Model Context Protocol server behind `astryx mcp`.
 *
 * It speaks MCP over standard input and output: one JSON-RPC message per line.
 * It lists the CLI's commands as tools (lib/mcp-tools.mjs), and it answers a
 * tool call by running that command with this CLI's own bin, as a child
 * process in the folder the call names, with --json. The answer is the
 * command's output, unchanged, and `isError` is true when the command exits
 * non-zero. The server writes nothing but protocol messages to stdout.
 *
 * @input MCP requests on stdin; the tools, version and instructions to serve
 * @output MCP responses on stdout; one child process per tool call
 * @position clients/cli/lib — started by the `mcp` command handler
 */

import {spawn} from 'node:child_process';
import * as readline from 'node:readline';
import {fileURLToPath} from 'node:url';
import {commandLine, McpInputError} from './mcp-tools.mjs';

/** The bin of this copy of the CLI: every tool call runs it. */
export const CLI_BIN = fileURLToPath(new URL('../bin/astryx.mjs', import.meta.url));

/**
 * The protocol versions this server speaks, newest first. The methods it
 * serves are the same in each.
 */
export const PROTOCOL_VERSIONS = Object.freeze([
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
]);

/** JSON-RPC error codes. */
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

/**
 * @typedef {object} CommandRun
 * @property {string} stdout
 * @property {string} stderr
 * @property {number | null} exitCode
 * @property {NodeJS.Signals | null} signal
 */

/**
 * Run this CLI once, with `argv`, in `cwd`.
 * @param {string[]} argv
 * @param {{cwd: string, signal: AbortSignal}} options
 * @returns {Promise<CommandRun>}
 */
export function runCommand(argv, {cwd, signal}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_BIN, ...argv], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      signal,
    });
    /** @type {Buffer[]} */
    const out = [];
    /** @type {Buffer[]} */
    const err = [];
    child.stdout.on('data', chunk => out.push(chunk));
    child.stderr.on('data', chunk => err.push(chunk));
    child.on('error', error => {
      if (/** @type {any} */ (error).name === 'AbortError') return;
      reject(error);
    });
    child.on('close', (exitCode, exitSignal) => {
      resolve({
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        exitCode,
        signal: exitSignal,
      });
    });
  });
}

/**
 * The tool result for one finished run: stdout, then stderr when the run
 * wrote any, each as it was written.
 * @param {CommandRun} run
 */
function toolResult(run) {
  const texts = [run.stdout, run.stderr].filter(text => text.length > 0);
  const content = (texts.length > 0 ? texts : ['']).map(text => ({type: 'text', text}));
  return {content, isError: run.exitCode !== 0};
}

/**
 * Serve MCP until the client closes standard input.
 *
 * @param {{
 *   tools: import('./mcp-tools.mjs').McpTool[],
 *   version: string,
 *   instructions: string,
 *   root?: string,
 *   input?: NodeJS.ReadableStream,
 *   output?: NodeJS.WritableStream,
 *   run?: typeof runCommand,
 * }} options `root` is the folder served (default: the working folder)
 * @returns {Promise<void>} resolves when the client has gone and every call
 *   it started has stopped
 */
export function serveMcp({
  tools,
  version,
  instructions,
  root = process.cwd(),
  input = process.stdin,
  output = process.stdout,
  run = runCommand,
}) {
  const byName = new Map(tools.map(tool => [tool.name, tool]));
  /** @type {Map<string | number, AbortController>} */
  const running = new Map();
  /** @type {Set<Promise<void>>} */
  const pending = new Set();

  /** @param {unknown} message */
  const send = message => {
    output.write(`${JSON.stringify(message)}\n`);
  };

  /**
   * @param {string | number | null} id
   * @param {number} code
   * @param {string} message
   */
  const errorReply = (id, code, message) => ({
    jsonrpc: '2.0',
    id,
    error: {code, message},
  });

  /**
   * Answer one tool call.
   * @param {string | number} id
   * @param {any} params
   * @returns {Promise<unknown | null>} the reply, or null when the client
   *   cancelled the call
   */
  const callTool = async (id, params) => {
    const tool = byName.get(params?.name);
    if (!tool) {
      return errorReply(id, INVALID_PARAMS, `Unknown tool: ${String(params?.name)}`);
    }
    let line;
    try {
      line = commandLine(tool, params.arguments ?? {}, {root});
    } catch (error) {
      if (!(error instanceof McpInputError)) throw error;
      const content = [{type: 'text', text: error.message}];
      return {jsonrpc: '2.0', id, result: {content, isError: true}};
    }
    const controller = new AbortController();
    running.set(id, controller);
    try {
      const result = await run(line.argv, {cwd: line.cwd, signal: controller.signal});
      if (controller.signal.aborted) return null;
      return {jsonrpc: '2.0', id, result: toolResult(result)};
    } finally {
      running.delete(id);
    }
  };

  /**
   * The reply to one request, or null for a notification.
   * @param {any} message
   * @returns {Promise<unknown | null>}
   */
  const handle = async message => {
    if (message === null || typeof message !== 'object' || Array.isArray(message)) {
      return errorReply(null, INVALID_REQUEST, 'Invalid request');
    }
    const {id, method, params} = message;
    const isRequest = id !== undefined && id !== null;
    if (typeof method !== 'string') {
      return isRequest ? errorReply(id, INVALID_REQUEST, 'Invalid request') : null;
    }
    if (!isRequest) {
      if (method === 'notifications/cancelled') {
        running.get(params?.requestId)?.abort();
      }
      return null;
    }
    switch (method) {
      case 'initialize': {
        const asked = params?.protocolVersion;
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
            capabilities: {tools: {listChanged: false}},
            serverInfo: {name: 'astryx', title: 'Astryx CLI', version},
            instructions,
          },
        };
      }
      case 'ping':
        return {jsonrpc: '2.0', id, result: {}};
      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: tools.map(({name, title, description, inputSchema}) => ({
              name,
              title,
              description,
              inputSchema,
            })),
          },
        };
      case 'tools/call':
        return callTool(id, params);
      default:
        return errorReply(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  };

  /** @param {string} line */
  const receive = line => {
    if (line.trim() === '') return;
    /** @type {any} */
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send(errorReply(null, PARSE_ERROR, 'Parse error'));
      return;
    }
    const work = (async () => {
      if (Array.isArray(message)) {
        if (message.length === 0) {
          send(errorReply(null, INVALID_REQUEST, 'Invalid request'));
          return;
        }
        const replies = (await Promise.all(message.map(handle))).filter(
          reply => reply != null,
        );
        if (replies.length > 0) send(replies);
        return;
      }
      const reply = await handle(message);
      if (reply != null) send(reply);
    })().catch(error => {
      const id = Array.isArray(message) ? null : (message?.id ?? null);
      send(errorReply(id, -32603, `Internal error: ${error?.message ?? String(error)}`));
    });
    pending.add(work);
    work.finally(() => pending.delete(work));
  };

  return new Promise(resolve => {
    const lines = readline.createInterface({input, crlfDelay: Infinity});
    lines.on('line', receive);
    lines.on('close', () => {
      // The client has gone: stop every command it started.
      for (const controller of running.values()) controller.abort();
      Promise.allSettled([...pending]).then(() => resolve());
    });
  });
}
