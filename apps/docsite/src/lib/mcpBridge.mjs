// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The docs site's MCP endpoint: `astryx mcp --docs-only`, reached over
 * Streamable HTTP.
 *
 * Each POST runs that command once, writes the request to its standard input,
 * and answers with the line the command replies. The tools, what a call runs
 * and the server instructions are the command's own; this file only carries
 * the messages. The server keeps no session, so a request needs no
 * `initialize` before it.
 *
 * The command runs in the folder the build prepares
 * (scripts/build-mcp-runtime.mjs): a project with the CLI and the Core the site
 * documents. A checkout without that folder runs the workspace CLI outside any
 * project. The command gets no variable of the site's environment.
 *
 * @input an MCP request: a POST whose body is one JSON-RPC message or a batch
 * @output the command's reply as JSON; 202 when no message asks for a reply
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
 * Whether a message, or any message of a batch, is a request: it has a method
 * and an id, so the server replies to it.
 * @param {unknown} message
 * @returns {boolean}
 */
function asksForReply(message) {
  if (Array.isArray(message))
    return message.length === 0 || message.some(asksForReply);
  if (message === null || typeof message !== 'object') return true;
  const {id, method} = /** @type {{id?: unknown, method?: unknown}} */ (
    message
  );
  return method === undefined || (id !== undefined && id !== null);
}

/**
 * Run `astryx mcp --docs-only` once, send it one message, and resolve with the
 * line it replies.
 * @param {McpRuntime} runtime
 * @param {unknown} message
 * @returns {Promise<string>}
 */
export function askMcpServer({bin, cwd}, message) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, 'mcp', '--docs-only'], {
      cwd,
      env: commandEnv(),
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    });
    let output = '';
    let settled = false;
    /**
     * @param {Error | null} error
     * @param {string} [line]
     */
    const finish = (error, line) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Closing standard input ends the server once it has answered.
      child.stdin.end();
      if (error) {
        child.kill();
        reject(error);
      } else {
        resolve(/** @type {string} */ (line));
      }
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            `astryx mcp gave no answer in ${REPLY_TIMEOUT_MS / 1000} s`,
          ),
        ),
      REPLY_TIMEOUT_MS,
    );
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
  if (!asksForReply(message)) return new Response(null, {status: 202});
  try {
    return jsonResponse(
      200,
      await askMcpServer(runtime ?? mcpRuntime(), message),
    );
  } catch (error) {
    const id =
      !Array.isArray(message) && message && typeof message === 'object'
        ? /** @type {{id?: unknown}} */ ((message).id ?? null)
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
