// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Compiler diagnostics — one shape for every problem the doc compiler
 *   finds.
 *
 * @input A diagnostic code, the package and file it concerns, and a message.
 * @output A plain-JSON diagnostic: a stable code, the phase that found it,
 *   severity, provider, source, field, message, remediation, and the scope of
 *   what it invalidates. Lists sort into one deterministic order.
 * @position Shared by every compiler phase: listing inputs, loading, parsing,
 *   overlaying, lowering, linking, serializing, and reading a bundle back. A
 *   code fixes its phase, severity, scope, and remediation, so no phase or
 *   reader can report the same problem two ways or downgrade it.
 */

/** Compiler phases, in the order a descriptor passes through them. */
export const DIAGNOSTIC_PHASES = /** @type {const} */ ([
  'discover',
  'load',
  'parse',
  'overlay',
  'lower',
  'link',
  'serialize',
  'bundle',
]);

/**
 * What a failure invalidates: the one node it concerns, or the whole
 * compilation (a bundle that cannot be read at all).
 * @typedef {'node' | 'compilation'} DiagnosticScope
 */

/**
 * @typedef {typeof DIAGNOSTIC_PHASES[number]} DiagnosticPhase
 * @typedef {'error' | 'warning'} DiagnosticSeverity
 */

/**
 * @typedef {object} CompilerDiagnostic
 * @property {string} code stable; one of {@link DIAGNOSTIC_CODES}
 * @property {DiagnosticPhase} phase
 * @property {DiagnosticSeverity} severity
 * @property {DiagnosticScope} scope
 * @property {string | null} provider the package the problem is in
 * @property {string | null} source `<package>/<path>` of the file, never a
 *   machine path
 * @property {string | null} field the field or reference at fault, when known
 * @property {string} message
 * @property {string} remediation what to do about it
 */

/**
 * @typedef {object} DiagnosticRule
 * @property {DiagnosticPhase} phase
 * @property {DiagnosticSeverity} severity
 * @property {DiagnosticScope} scope
 * @property {string} remediation
 */

/** Every code the compiler emits, with the facts it fixes. */
export const DIAGNOSTIC_CODES = Object.freeze(
  /** @type {Record<string, DiagnosticRule>} */ ({
    duplicate_file: {
      phase: 'discover',
      severity: 'error',
      scope: 'node',
      remediation:
        'Give each descriptor one reader: move it out of all but one of the roots that read it.',
    },
    duplicate_id: {
      phase: 'discover',
      severity: 'error',
      scope: 'node',
      remediation:
        'Rename one of the descriptors, so each name in a root belongs to one file.',
    },
    load_failed: {
      phase: 'load',
      severity: 'error',
      scope: 'node',
      remediation: 'Fix the error the file throws when it is loaded.',
    },
    missing_export: {
      phase: 'load',
      severity: 'error',
      scope: 'node',
      remediation: 'Export the doc as the default export of the file.',
    },
    invalid_doc: {
      phase: 'parse',
      severity: 'error',
      scope: 'node',
      remediation:
        'Fix the fields the message names; `astryx docs authoring` lists every field of each doc kind.',
    },
    wrong_kind: {
      phase: 'parse',
      severity: 'error',
      scope: 'node',
      remediation:
        'Stamp the doc with a type its root reads, or move it to the root for its type.',
    },
    overlay_failed: {
      phase: 'overlay',
      severity: 'error',
      scope: 'node',
      remediation:
        'Fix the translation file, or remove it to read the authored text.',
    },
    invalid_topic: {
      phase: 'lower',
      severity: 'error',
      scope: 'node',
      remediation:
        'Fix the topic or the extension the message names; an extension that breaks its base withdraws the whole topic.',
    },
    unresolved_reference: {
      phase: 'link',
      severity: 'warning',
      scope: 'node',
      remediation:
        'Point the token reference at a topic and section that exist; `astryx docs <topic> --index` lists the section keys.',
    },
    invalid_namespace: {
      phase: 'link',
      severity: 'error',
      scope: 'node',
      remediation:
        'Give each namespace a route-safe name (lowercase letters and digits joined by hyphens) that no other namespace in its package uses.',
    },
    invalid_placement: {
      phase: 'link',
      severity: 'error',
      scope: 'node',
      remediation:
        'Point placement.parent at a namespace of the same package ("namespace:<name>"), name one of its slots, and use a slot that accepts the doc\'s kind; `astryx docs authoring namespace-doc` lists the fields.',
    },
    overlapping_adoption: {
      phase: 'link',
      severity: 'error',
      scope: 'node',
      remediation:
        'Change the adoption rules so exactly one namespace adopts the doc, or give the doc an explicit placement.',
    },
    duplicate_route: {
      phase: 'link',
      severity: 'error',
      scope: 'node',
      remediation:
        'Rename or move one of the two docs, so each route in the docs tree belongs to one doc.',
    },
    not_json: {
      phase: 'serialize',
      severity: 'error',
      scope: 'node',
      remediation:
        'Keep a doc to plain data: no cycles, BigInt values, or objects that cannot be written as JSON.',
    },
    unsupported_schema: {
      phase: 'bundle',
      severity: 'error',
      scope: 'compilation',
      remediation: 'Compile the docs again with this CLI.',
    },
    invalid_bundle: {
      phase: 'bundle',
      severity: 'error',
      scope: 'compilation',
      remediation:
        'Compile the docs again with this CLI; a compiled bundle is never edited by hand.',
    },
  }),
);

/**
 * @param {string} code
 * @param {object} at
 * @param {string | null} [at.provider]
 * @param {string | null} [at.source]
 * @param {string | null} [at.field]
 * @param {string} at.message
 * @returns {CompilerDiagnostic}
 */
export function diagnostic(
  code,
  {provider = null, source = null, field = null, message},
) {
  if (!Object.hasOwn(DIAGNOSTIC_CODES, code)) {
    throw new Error(`Unknown compiler diagnostic code "${code}".`);
  }
  const rule = DIAGNOSTIC_CODES[code];
  return {
    code,
    phase: rule.phase,
    severity: rule.severity,
    scope: rule.scope,
    provider,
    source,
    field,
    message,
    remediation: rule.remediation,
  };
}

/** @param {string | null} value */
const orderable = value => value ?? '\uffff';

/**
 * Diagnostics in one order, whatever order the phases found them in: by
 * source, then phase, then code, field, and message.
 * @param {CompilerDiagnostic[]} list
 * @returns {CompilerDiagnostic[]} a new array
 */
export function sortDiagnostics(list) {
  const phase = (/** @type {CompilerDiagnostic} */ d) =>
    DIAGNOSTIC_PHASES.indexOf(d.phase);
  return [...list].sort(
    (a, b) =>
      compare(orderable(a.source), orderable(b.source)) ||
      phase(a) - phase(b) ||
      compare(a.code, b.code) ||
      compare(orderable(a.field), orderable(b.field)) ||
      compare(a.message, b.message),
  );
}

/**
 * Code-point order: the same on every machine and locale.
 * @param {string} a
 * @param {string} b
 */
function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

const DIAGNOSTIC_FIELDS = new Set([
  'code',
  'phase',
  'severity',
  'scope',
  'provider',
  'source',
  'field',
  'message',
  'remediation',
]);

/**
 * What is wrong with a value that claims to be a diagnostic, or null. A known
 * code must carry its own phase, severity, scope, and remediation: a reader
 * never reinterprets them.
 * @param {unknown} value
 * @returns {string | null}
 */
export function diagnosticProblem(value) {
  const d = /** @type {any} */ (value);
  if (d == null || typeof d !== 'object' || Array.isArray(d)) {
    return 'expected a diagnostic object';
  }
  const unknown = Object.keys(d).filter(key => !DIAGNOSTIC_FIELDS.has(key));
  if (unknown.length > 0) return `unknown fields: ${unknown.join(', ')}`;
  if (typeof d.code !== 'string' || !Object.hasOwn(DIAGNOSTIC_CODES, d.code)) {
    return `code: ${JSON.stringify(d.code)} is not a compiler diagnostic code`;
  }
  const rule = DIAGNOSTIC_CODES[d.code];
  for (const key of /** @type {const} */ ([
    'phase',
    'severity',
    'scope',
    'remediation',
  ])) {
    if (d[key] !== rule[key]) {
      return `${key}: "${d.code}" always has ${key} ${JSON.stringify(rule[key])}`;
    }
  }
  for (const key of ['provider', 'source', 'field']) {
    if (d[key] !== null && (typeof d[key] !== 'string' || d[key] === '')) {
      return `${key}: expected text or null`;
    }
  }
  if (d.source !== null && !isPortableSource(d.source)) {
    return 'source: expected a path inside a package, not a location on one machine';
  }
  if (typeof d.message !== 'string' || d.message === '') {
    return 'message: expected text';
  }
  return null;
}

/**
 * A `<package>/<path>` that names no location on one machine: not absolute,
 * no drive letter or URL scheme, no backslash, no `..` segment.
 * @param {string} source
 * @returns {boolean}
 */
export function isPortableSource(source) {
  return (
    !source.startsWith('/') &&
    !/^[A-Za-z]:/u.test(source) &&
    !source.includes('\\') &&
    !/(^|\/)\.\.(\/|$)/u.test(source)
  );
}
