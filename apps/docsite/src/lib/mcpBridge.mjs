// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The docs site's MCP endpoint: `astryx mcp --docs-only`, reached over
 * Streamable HTTP.
 *
 * A POST carries one JSON-RPC message. A notification or a response gets 202
 * with no body, and nothing runs, as Streamable HTTP has it. Any other message
 * runs that command once, in a process group of its own, and the answer is the
 * line the command replies. The tools, what a call runs, and how the server
 * answers a batch or an invalid message are the command's own; this file only
 * carries the messages. The server keeps no session, so a request needs no
 * `initialize` before it.
 *
 * The command runs in the folder the build prepares
 * (scripts/build-mcp-runtime.mjs): a project with the CLI and the Core the site
 * documents. A checkout without that folder runs the workspace CLI outside any
 * project. The command gets no variable of the site's environment.
 *
 * @input an MCP request: a POST whose body is one JSON-RPC message
 * @output the command's reply as JSON; 202 for a notification or a response
 * @position src/lib — read by app/mcp/route.ts and scripts/build-mcp-runtime.mjs
 */

import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, realpathSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The folder the build prepares, inside the site's folder. */
export const RUNTIME_DIR = '.mcp-runtime';

/** The CLI's bin, inside its package. */
const CLI_BIN = ['clients', 'cli', 'bin', 'astryx.mjs'];

/** How long one request may run before the endpoint stops it. */
const REPLY_TIMEOUT_MS = 55_000;

/**
 * @typedef {object} McpRuntime
 * @property {string} bin the CLI bin that runs `mcp --docs-only`
 * @property {string} cwd the folder it runs in
 */

/**
 * The CLI and folder the endpoint runs: the prepared folder when the build made
 * it, else the workspace CLI outside any project.
 * @param {string} [siteRoot] the site's folder (default: the working folder)
 * @returns {McpRuntime}
 */
export function mcpRuntime(siteRoot = process.cwd()) {
  const prepared = path.join(siteRoot, RUNTIME_DIR);
  const preparedBin = path.join(
    prepared,
    'node_modules',
    '@astryxdesign',
    'cli',
    ...CLI_BIN,
  );
  if (existsSync(preparedBin)) {
    return {bin: preparedBin, cwd: prepared};
  }
  const workspaceCli = realpathSync(
    path.join(siteRoot, 'node_modules', '@astryxdesign', 'cli'),
  );
  const outside = path.join(os.tmpdir(), 'astryx-docs-mcp');
  mkdirSync(outside, {recursive: true});
  return {bin: path.join(workspaceCli, ...CLI_BIN), cwd: outside};
}

/**
 * The environment the command runs with: a search path and a home folder it
 * may write, and nothing else of the site's.
 * @returns {NodeJS.ProcessEnv}
 */
export function commandEnv() {
  const home = path.join(os.tmpdir(), 'astryx-docs-mcp-home');
  mkdirSync(home, {recursive: true});
  return {PATH: process.env.PATH ?? '', HOME: home, NODE_ENV: 'production'};
}

/**
 * Whether Streamable HTTP takes a message without an answer: a notification (a
 * method and no id) or a response (a result or an error, and no method). The
 * server answers every other message, a batch and an invalid one included.
 * @param {unknown} message
 * @returns {boolean}
 */
function needsNoAnswer(message) {
  if (
    message === null ||
    typeof message !== 'object' ||
    Array.isArray(message)
  ) {
    return false;
  }
  const {id, method} = /** @type {{id?: unknown, method?: unknown}} */ (
    message
  );
  if (typeof method === 'string') return id === undefined || id === null;
  return 'result' in message || 'error' in message;
}

/**
 * Run `astryx mcp --docs-only` once, send it one message, and resolve with the
 * line it replies. The server runs in a process group of its own, so a run
 * that gives no answer in time, or whose request is cancelled, is stopped with
 * every command it started.
 * @param {McpRuntime} runtime
 * @param {unknown} message
 * @param {{timeoutMs?: number, signal?: AbortSignal}} [options]
 * @returns {Promise<string>}
 */
export function askMcpServer(
  {bin, cwd},
  message,
  {timeoutMs = REPLY_TIMEOUT_MS, signal} = {},
) {
  return new Promise((resolve, reject) => {
    // Windows has no process groups; there the server alone is stopped.
    const ownGroup = process.platform !== 'win32';
    const child = spawn(process.execPath, [bin, 'mcp', '--docs-only'], {
      cwd,
      env: commandEnv(),
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
      detached: ownGroup,
    });
    let output = '';
    let settled = false;
    /** @type {NodeJS.Timeout | undefined} */
    let timer;
    const stopGroup = () => {
      try {
        if (ownGroup && child.pid !== undefined) {
          process.kill(-child.pid, 'SIGKILL');
        } else {
          child.kill('SIGKILL');
        }
      } catch {
        // The group has exited already.
      }
    };
    const onAbort = () => finish(new Error('the request was cancelled'));
    /**
     * @param {Error | null} error
     * @param {string} [line]
     */
    const finish = (error, line) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (error) {
        stopGroup();
        reject(error);
      } else {
        // Closing standard input ends the server once it has answered.
        child.stdin.end();
        resolve(/** @type {string} */ (line));
      }
    };
    timer = setTimeout(
      () =>
        finish(new Error(`astryx mcp gave no answer in ${timeoutMs / 1000} s`)),
      timeoutMs,
    );
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, {once: true});
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk;
      const end = output.indexOf('\n');
      if (end >= 0) finish(null, output.slice(0, end));
    });
    child.on('error', error => finish(error));
    child.on('close', code =>
      finish(new Error(`astryx mcp exited with ${code} before it answered`)),
    );
    child.stdin.on('error', error => finish(error));
    child.stdin.write(`${JSON.stringify(message)}\n`);
  });
}

/**
 * A JSON response.
 * @param {number} status
 * @param {unknown} body
 * @returns {Response}
 */
function jsonResponse(status, body) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'},
  });
}

/**
 * Answer one POST: its message goes to `astryx mcp --docs-only`, and the
 * command's reply is the response.
 * @param {Request} request
 * @param {McpRuntime} [runtime]
 * @returns {Promise<Response>}
 */
export async function handleMcpPost(request, runtime) {
  /** @type {unknown} */
  let message;
  try {
    message = JSON.parse(await request.text());
  } catch {
    return jsonResponse(400, {
      jsonrpc: '2.0',
      id: null,
      error: {code: -32700, message: 'Parse error'},
    });
  }
  if (needsNoAnswer(message)) return new Response(null, {status: 202});
  try {
    return jsonResponse(
      200,
      await askMcpServer(runtime ?? mcpRuntime(), message, {
        signal: request.signal,
      }),
    );
  } catch (error) {
    const id =
      !Array.isArray(message) && message && typeof message === 'object'
        ? /** @type {{id?: unknown}} */ (message.id ?? null)
        : null;
    return jsonResponse(500, {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: `Internal error: ${error instanceof Error ? error.message : String(error)}`,
      },
    });
  }
}

/**
 * The answer to GET and DELETE: the endpoint opens no event stream and keeps
 * no session.
 * @returns {Response}
 */
export function methodNotAllowed() {
  return new Response(null, {status: 405, headers: {allow: 'POST'}});
}
