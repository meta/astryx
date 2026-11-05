// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Shared types for the Astryx CLI JSON API.
 *
 * `CLIError` and `CLIUnsupportedError` are the two error shapes. Success
 * responses are the structural `{ type, data, meta? }` envelope (`CLIResponse`)
 * — there is NO central union of every response. Each command's precise
 * response type is the source of truth at its own function; import the
 * per-command type, or use `ReturnType<typeof fn>`, when you need it.
 */

import type {ErrorCode} from './error-codes';

/**
 * A "did you mean…" suggestion attached to an error. `reason` is optional:
 * some call sites emit bare `{name}` (e.g. a list of candidate component names)
 * with no per-item explanation.
 */
export interface Suggestion {
  name: string;
  reason?: string;
}

/**
 * Structured error. Check `'error' in result` to discriminate.
 *
 * Branch on `code` (a stable machine-readable identifier), never on the
 * human-readable `error` string, which changes freely.
 */
export interface CLIError {
  /** Version of the JSON envelope contract, as on the success envelope. */
  apiVersion: number;
  error: string;
  code: ErrorCode;
  suggestions?: Suggestion[];
  /**
   * What the command had already done when it failed, present only on errors
   * from a command that changes files before it can fail (for example the
   * `upgrade.run` data of a failed `astryx upgrade`). The error is still an
   * error: branch on `code`.
   */
  receipt?: Record<string, unknown>;
}

/** Returned by the fallback hook for commands without --json support. */
export interface CLIUnsupportedError {
  apiVersion: number;
  error: `JSON output is not supported for the '${string}' command`;
  code: ErrorCode;
}

/**
 * A success response: a `type` discriminator, the `package` that owns what the
 * response is about, its `data` payload, and an optional `meta` object
 * (emitted as a sibling of `data`, never merged in) that carries
 * `answeredBy` and fields such as `deprecations`. `--json` prints it with
 * `apiVersion` added (see `parseResponse`).
 *
 * `package` is present when the response is about one thing: one component,
 * one doc, one template. A response that lists things from more than one
 * package leaves it out, and each listed item names its own `package`.
 *
 * Structural by design — there is no central union of every response `type`.
 * A specific command narrows `data` via its own return type.
 */
/**
 * Which copy of the CLI answered a run (spec AST-081 FR5): carried in `meta`
 * on every successful machine-readable result of a release that has it.
 * - `project`: the project's own CLI.
 * - `starting`: the copy that started the run, in a project with no CLI of
 *   its own.
 * - `matched`: the release equal to the project's Core, when the project's
 *   own CLI cannot start, from the per-user cache or the copy that started
 *   the run.
 * - `carried`: outside a project, the copy that started the run, with the Core
 *   it carries.
 * - `fallback`: the matched release could not be obtained, so the copy that
 *   started the run answered instead.
 */
export interface AnsweredBy {
  /** The answering CLI's version. */
  cli: string;
  /** The Core the run pairs with, or `null` when there is none. */
  core: string | null;
  copy: 'project' | 'starting' | 'matched' | 'carried' | 'fallback';
}

export interface CLIResponse {
  type: string;
  package?: string;
  data: unknown;
  meta?: {answeredBy?: AnsweredBy} & Record<string, unknown>;
}

/** Wrap any response type to include possible error shapes. */
export type CLIResult<T> = T | CLIError | CLIUnsupportedError;

/**
 * Output a JSON response envelope. Structural serializer — the correctness of
 * the `type` discriminator is guaranteed at each API function's return type,
 * not by a central map here.
 */
export function jsonOut(response: CLIResponse): void;

/**
 * Output a structured JSON error and exit.
 */
export function jsonError(
  message: string,
  suggestions?: Suggestion[],
  code?: ErrorCode,
): never;

/** Parse raw CLI output (string or object) into a typed result. */
export function parseResponse(
  raw: unknown,
): (CLIResponse & {apiVersion: number}) | CLIError | CLIUnsupportedError;

/** Type guard: returns true if result is an error. */
export function isError(
  result: unknown,
): result is CLIError | CLIUnsupportedError;

/**
 * Assert a specific response type. Throws on error or type mismatch. Narrows
 * the returned `type` to the expected literal; `data` stays `unknown` — import
 * the per-command response type when you need a precise payload.
 */
export function assertResponse<T extends string>(
  raw: unknown,
  type: T,
): CLIResponse & {apiVersion: number; type: T};

declare global {
  namespace NodeJS {
    interface Process {
      __xdsJsonHandled?: boolean;
    }
  }
}
