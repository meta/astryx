// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Scrubbing pass applied to every recorded value before it is written.
 *
 * Recorded events capture real argv, real option values, and real error
 * messages, so they can carry things a usage record has no business keeping:
 * absolute paths that contain a person's name, an email in a git remote, an
 * API key someone passed as a flag value. This module removes the obvious
 * classes of that before an event reaches the project's handler — which may
 * well forward it somewhere less private than this machine.
 *
 * Scrubbing is deliberately conservative about SHAPE: a redacted value keeps
 * its type and rough length so aggregate queries ("how many people pass
 * --out?") still work on scrubbed data. It replaces content, not structure.
 *
 * The environment snapshot goes through {@link redactEnv} rather than the
 * generic pass, because it is the one part of a record that mixes values this
 * CLI derives (which must survive verbatim to be worth recording) with free
 * text the invoking environment supplied (which must not).
 *
 * @input  arbitrary argv/option/error values, and the environment snapshot
 * @output the same shape with sensitive content replaced by stable markers
 * @position packages/cli/foundation/debug — scrubbing
 */

import * as os from 'node:os';
import * as path from 'node:path';

/** Replacement for a value removed wholesale. */
export const REDACTED = '[redacted]';

/**
 * Longest string kept verbatim in a recorded value.
 *
 * A size guard rather than a privacy one. One long argument lands in `argv`,
 * `args`, the error message, AND the stack — roughly quadrupling — so a
 * pathological value would otherwise dominate the whole event. Clamping per
 * value keeps the record, and the fact that the value was huge.
 */
export const MAX_VALUE_CHARS = 2048;

/**
 * Option/field names whose VALUE is always removed, matched case-insensitively
 * as a substring of the name with `-` and `_` stripped, so `apiKey`,
 * `api-key` and `API_KEY` are one entry. Deliberately broad — a false positive
 * costs one unusable field in a usage log; a false negative writes a live
 * credential to disk.
 *
 * Substring matching is why `key` and `pat` are not in here: they would take
 * `--keyboard`, `--sortkey` and, worse, `--path` with them. Those live in
 * {@link SENSITIVE_KEY_EXACT} instead.
 */
const SENSITIVE_KEY_PARTS = [
  'accesskey',
  'apikey',
  'auth',
  'bearer',
  'credential',
  'cookie',
  'jwt',
  'passphrase',
  'passwd',
  'password',
  'private',
  'secret',
  'session',
  'signature',
  'token',
];

const SENSITIVE_KEY_EXACT = new Set([
  'creds',
  'key',
  'pat',
  'pw',
  'pwd',
  'sig',
]);

/** Flags whose NEXT argv element is the value, e.g. `--token hunter2`. */
const SENSITIVE_FLAG_RE = /^--?([\w-]{1,64})$/;

const ASSIGNMENT_RE =
  /(--?[\w-]{1,128}|"[\w.-]{1,128}"|[\w.]{1,128})(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s'"`,}\]]*)/g;

/** Well-known credential formats worth catching wherever they appear. */
const CREDENTIAL_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{16,}/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\bsk-(?:ant|proj|live|test)-[A-Za-z0-9_-]{16,}/g,
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /\b[sr]k_(?:live|test)_[A-Za-z0-9]{10,}\b/g,
  /\bAIza[A-Za-z0-9_-]{35}\b/g,
  /\bnpm_[A-Za-z0-9]{30,}\b/g,
  /\bhf_[A-Za-z0-9]{30,}\b/g,
  /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g,
  /\b(?:AC|SK)[0-9a-f]{32}\b/g,
  /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g,
];

const ENTROPY_MIN_CHARS = 24;
const HIGH_ENTROPY_CANDIDATE_RE = new RegExp(
  `[A-Za-z0-9+=_-]{${ENTROPY_MIN_CHARS},512}`,
  'g',
);

const ENCODED_PAYLOAD_RE =
  /(?:;base64,|\bsha(?:256|384|512)-|\bsourceMappingURL=)[A-Za-z0-9+/=_-]+/g;

/**
 * @param {string} value
 * @returns {number}
 */
function entropyBits(value) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/**
 * @param {string} word
 * @returns {boolean}
 */
function looksLikeSecret(word) {
  if (isOrdered(word)) return false;
  return entropyBits(word) >= 0.9 * Math.log2(Math.min(word.length, 32));
}

/**
 * @param {string} word
 * @returns {boolean}
 */
function isOrdered(word) {
  if (word.length < 4) return false;
  let turns = 0;
  for (let i = 2; i < word.length; i += 1) {
    const a = word.charCodeAt(i - 2);
    const b = word.charCodeAt(i - 1);
    const c = word.charCodeAt(i);
    if ((b > a && c < b) || (b < a && c > b)) turns += 1;
  }
  return turns / (word.length - 2) < 0.25;
}

/** Credentials embedded in a URL's userinfo component. */
const URL_USERINFO_RE = /(\b[a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+(?::[^/\s@]*)?@/gi;

/** Email addresses. */
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/**
 * @param {string | undefined} key
 * @param {boolean} [named]
 * @returns {boolean}
 */
export function isSensitiveKey(key, named = true) {
  if (!key) return false;
  const lower = String(key).toLowerCase().replace(/[-_]/g, '');
  if (named && SENSITIVE_KEY_EXACT.has(lower)) return true;
  return SENSITIVE_KEY_PARTS.some(part => lower.includes(part));
}

/**
 * @param {string[]} argv
 * @param {Redactor} redact
 * @returns {unknown[]}
 */
export function redactArgv(argv, redact) {
  if (!Array.isArray(argv)) return /** @type {any} */ (redact(argv));
  let sensitiveNext = false;
  return argv.map(element => {
    const wasFlagged = sensitiveNext;
    const flag =
      typeof element === 'string' ? element.match(SENSITIVE_FLAG_RE) : null;
    sensitiveNext = Boolean(flag && isSensitiveKey(flag[1]));
    // A flag's own name is never the secret; the element AFTER it is.
    return wasFlagged ? REDACTED : redact(element);
  });
}

/**
 * Rewrite absolute paths so they carry structure but not identity: the home
 * directory becomes `~`, and a path inside the current project becomes a
 * project-relative one. A path outside both keeps only its last two segments,
 * which is enough to tell `/…/themes/ocean.ts` from `/…/src/App.tsx` without
 * revealing where on the machine it lives.
 *
 * @param {string} value
 * @param {{home: string, cwd: string, user: RegExp | null}} ctx
 * @returns {string}
 */
function scrubPaths(value, ctx) {
  let out = value;

  if (ctx.cwd && out.includes(ctx.cwd)) {
    out = out.split(ctx.cwd).join('.');
  }
  if (ctx.home && out.includes(ctx.home)) {
    out = out.split(ctx.home).join('~');
  }

  // Any absolute path still standing is outside both anchors — keep the tail
  // so the shape of the operation survives, drop the machine-specific prefix.
  //
  // The lead alternation matters as much as the path itself: the paths that
  // carry a username are the ones in a stack frame, and those arrive wrapped —
  // `at cliError (file:///Users/someone/…/redact.mjs:12:5)`. Anchoring on
  // whitespace alone leaves every one of them intact. A bare `:` leads too,
  // for the second and later entries of a `PATH`-style list, but not when it
  // starts a `://` scheme — that would chew the tail off every URL.
  out = out.replace(
    /(^|[\s"'`([{<=,;]|:(?!\/\/)|file:\/\/)(\/[^\s:;,"'`)\]}>]{2,})/g,
    (match, lead, abs) => {
      const parts = String(abs).split('/').filter(Boolean);
      if (parts.length <= 2) return match;
      return `${lead}${path.posix.join('/…', ...parts.slice(-2))}`;
    },
  );

  out = out.replace(
    /(^|[\s"'`([{<=,;])([A-Za-z]:\\|\\\\)([^\s"'`)\]}>]{2,})/g,
    (match, lead, root, rest) => {
      const parts = String(rest).split('\\').filter(Boolean);
      if (parts.length <= 2) return match;
      return `${lead}${root}…\\${parts.slice(-2).join('\\')}`;
    },
  );

  if (ctx.user) {
    out = out.replace(ctx.user, (whole, before) => `${before}${REDACTED}`);
  }

  return out;
}

/**
 * Apply every content rule to a single string.
 * @param {string} value
 * @param {{home: string, cwd: string, user: RegExp | null}} ctx
 * @returns {string}
 */
function scrubString(value, ctx) {
  let out = value;

  for (const pattern of CREDENTIAL_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  out = out.replace(URL_USERINFO_RE, (_m, scheme) => `${scheme}${REDACTED}@`);
  out = out.replace(EMAIL_RE, REDACTED);

  if (out.includes('=') || out.includes(':')) {
    out = out.replace(ASSIGNMENT_RE, (whole, key, sep, value) => {
      const raw = String(key);
      const flagged = raw.startsWith('-');
      const name = raw.replace(/^--?/, '').replace(/^"|"$/g, '');
      if (!isSensitiveKey(name, flagged)) return whole;
      const q = /^["']/.test(value) ? value[0] : '';
      return `${key}${sep}${q}${REDACTED}${q}`;
    });
  }

  out = scrubPaths(out, ctx);

  if (out.length >= ENTROPY_MIN_CHARS) {
    const skip = encodedPayloadRanges(out);
    out = out.replace(HIGH_ENTROPY_CANDIDATE_RE, (word, offset) => {
      if (inAnyRange(offset, skip)) return word;
      return looksLikeSecret(word) ? REDACTED : word;
    });
  }

  return out;
}

/**
 * @param {string} text
 * @returns {Array<[number, number]>}
 */
function encodedPayloadRanges(text) {
  /** @type {Array<[number, number]>} */
  const ranges = [];
  if (!/base64,|sha(?:256|384|512)-|sourceMappingURL=/.test(text))
    return ranges;
  ENCODED_PAYLOAD_RE.lastIndex = 0;
  let m;
  while ((m = ENCODED_PAYLOAD_RE.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

/**
 * @param {number} offset
 * @param {Array<[number, number]>} ranges
 * @returns {boolean}
 */
function inAnyRange(offset, ranges) {
  for (const [start, end] of ranges) {
    if (offset >= start && offset < end) return true;
  }
  return false;
}

/**
 * Clamp one string to {@link MAX_VALUE_CHARS}, noting what was dropped so the
 * record still shows that the original was oversized.
 * @param {string} value
 * @param {number} max
 * @returns {string}
 */
function clamp(value, max) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…[+${value.length - max} chars]`;
}

/**
 * A sanitizing function bound to one machine + project.
 * @typedef {(value: unknown, key?: string) => unknown} Redactor
 */

/**
 * Build a {@link Redactor}.
 *
 * @param {object} [options]
 * @param {boolean} [options.enabled] - Test seam: false skips the content
 *   rules while still applying the depth and length limits.
 * @param {string} [options.home] - overridable for tests.
 * @param {string} [options.cwd] - overridable for tests.
 * @param {string} [options.user] - overridable for tests.
 * @param {number} [options.maxLength] - Per-value character cap.
 * @returns {Redactor}
 */
export function createRedactor({
  enabled = true,
  home,
  cwd,
  user,
  maxLength = MAX_VALUE_CHARS,
} = {}) {
  /** @type {{home: string, cwd: string, user: RegExp | null}} */
  const ctx = {
    home: home ?? safeHomedir(),
    cwd: cwd ?? safeCwd(),
    user: usernamePattern(user ?? safeUsername()),
  };

  /**
   * @param {unknown} value
   * @param {string} [key]
   * @param {number} [depth]
   * @returns {unknown}
   */
  const redact = (value, key, depth = 0) => {
    // Bail out well before a pathological object can stall a command.
    if (depth > 6) return REDACTED;
    if (value == null) return value;
    if (enabled && isSensitiveKey(key)) return REDACTED;

    if (typeof value === 'string') {
      return clamp(enabled ? scrubString(value, ctx) : value, maxLength);
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.map(v => redact(v, key, depth + 1));

    if (typeof value === 'object') {
      /** @type {Record<string, unknown>} */
      const out = {};
      for (const [k, v] of Object.entries(/** @type {object} */ (value))) {
        // `out[k] = …` would invoke the prototype setter for `__proto__`,
        // silently reparenting `out` and dropping the field. defineProperty
        // writes it as an ordinary own property, so a hostile key is recorded
        // as data instead of changing the shape of the record.
        Object.defineProperty(out, k, {
          value: redact(v, k, depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return out;
    }

    // Functions, symbols, bigints — record the type, never the value.
    return `[${typeof value}]`;
  };

  return (value, key) => redact(value, key, 0);
}

/**
 * Which fields of the environment snapshot are recorded VERBATIM.
 *
 * Every one of these is DERIVED: this CLI produces it from a fixed vocabulary
 * (`process.platform`, the CI provider table, an Intl lookup, a SHA-256 of a
 * value we never keep), so none of them can carry something a person typed,
 * and their exact values are the whole reason the snapshot is useful.
 *
 * Everything else in `env` is free text handed to us by the invoking
 * environment — an agent name from `AGENT` or a known agent signal — so it
 * goes through the same content rules as argv.
 * The list is a positive allowlist rather than a denylist of risky fields: a
 * field added to the snapshot later is scrubbed until someone decides
 * otherwise, which is the safe direction to be wrong in.
 *
 * `agentSessionIdHash` earns its place twice over. It is a hash, so it cannot
 * leak what it was made from — and it is the only key that joins the runs of
 * one session, which is exactly why the raw identifier is not recorded at all.
 *
 * Exported so a test can assert the classification still covers the whole
 * snapshot: a field added later without a decision fails that test rather than
 * quietly inheriting one behaviour or the other.
 */
export const VERBATIM_ENV_FIELDS = new Set([
  'agentSessionIdHash',
  'agentSessionIdSource',
  'arch',
  'ci',
  'ciName',
  'cliVersion',
  'invocationSource',
  'locale',
  'nodeVersion',
  'oneOff',
  'packageManager',
  'platform',
  'timezone',
  'tty',
]);

/**
 * Apply the content rules to the environment snapshot.
 *
 * Deliberately NOT `redact(value, key)`: key-based redaction would match the
 * word "session" in three of these names and blank the hash, destroying the
 * join key the published contract promises. The classification above decides
 * instead, and only the CONTENT rules run on what it does not exempt.
 *
 * @template T
 * @param {T} env
 * @param {Redactor} redact
 * @returns {T}
 */
export function redactEnv(env, redact) {
  if (!env || typeof env !== 'object') return env;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    out[key] =
      typeof value === 'string' && !VERBATIM_ENV_FIELDS.has(key)
        ? redact(value)
        : value;
  }
  return /** @type {T} */ (/** @type {unknown} */ (out));
}

/** @returns {string} */
function safeHomedir() {
  try {
    return os.homedir() || '';
  } catch {
    return '';
  }
}

/** @returns {string} */
function safeCwd() {
  try {
    return process.cwd();
  } catch {
    return '';
  }
}

/** @returns {string} */
function safeUsername() {
  try {
    return os.userInfo().username || '';
  } catch {
    return '';
  }
}

/**
 * @param {string} name
 * @returns {RegExp | null}
 */
function usernamePattern(name) {
  const value = String(name ?? '');
  if (value.length < 3 || COMMON_WORD_USERNAMES.has(value.toLowerCase())) {
    return null;
  }
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`([/\\\\~])${escaped}(?![A-Za-z0-9_-])`, 'gi');
}

const COMMON_WORD_USERNAMES = new Set([
  'admin',
  'build',
  'core',
  'dev',
  'docs',
  'node',
  'root',
  'test',
  'user',
  'www',
]);
