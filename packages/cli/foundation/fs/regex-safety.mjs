// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regex safety guard for user-supplied patterns.
 *
 * `.hgignore` files may contain arbitrary regular expressions.  A
 * pathological pattern such as `(a+)+$` causes catastrophic backtracking
 * (ReDoS), freezing the CLI.  This module provides a lightweight static
 * check that rejects the most common dangerous constructs and a
 * `safeRegExp` wrapper that should be used in place of bare `new RegExp`.
 */

/**
 * Heuristic check for common ReDoS patterns.
 *
 * Detected families:
 *   1. Nested quantifiers on a group — `(a+)+`, `(a*)*`, `(a+){2,}`
 *   2. Quantified group whose body contains a quantifier — `(\w+\s?)+`
 *   3. Alternation with overlapping arms inside a quantified group —
 *      `(a|aa)+`, `(\d|\d\d)+`
 *   4. Quantifier inside alternation inside a quantified group —
 *      `(a+|b)+`
 *
 * The check intentionally avoids flagging `?` **as the outer quantifier
 * on a group** — `(x)?` is at most one attempt and cannot cause
 * exponential blowup.
 *
 * @param {string} pattern  The regex source string.
 * @returns {{safe: boolean, reason?: string}}
 */
export function checkRegexSafety(pattern) {
  // Phase 1 — strip character classes so their contents don't confuse the
  // group parser.  `[...]` cannot contain groups or quantifiers in the
  // regex grammar, so they are noise for this analysis.
  const stripped = pattern.replace(/\\.|\[(?:[^\\\]]|\\.)*\]/g, '##');

  // Phase 2 — parse groups: find `(` ... `)` and what quantifier (if any)
  // follows the closing `)`.
  //
  // We use a simple stack-based parser rather than a regex so that we
  // correctly handle nested groups.
  /** @type {{start: number, end: number, body: string, quantifier: string}[]} */
  const groups = [];
  /** @type {number[]} */
  const stack = [];

  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i] === '(' && (i === 0 || stripped[i - 1] !== '\\')) {
      stack.push(i);
    } else if (stripped[i] === ')' && (i === 0 || stripped[i - 1] !== '\\')) {
      if (stack.length > 0) {
        const start = stack.pop();
        const end = i;
        const body = stripped.slice(start + 1, end);
        // Look at the character immediately after ')'
        const after = stripped[end + 1] || '';
        let quantifier = '';
        if (after === '+' || after === '*') {
          quantifier = after;
        } else if (after === '{') {
          // Check for {n,m} style quantifier
          const braceMatch = stripped.slice(end + 1).match(/^\{\d+,\d*\}/);
          if (braceMatch) {
            quantifier = braceMatch[0];
          }
        }
        // Note: '?' is NOT treated as a dangerous outer quantifier —
        // it means "zero or one" and cannot cause exponential blowup.
        groups.push({start, end, body, quantifier});
      }
    }
  }

  // Phase 3 — check each quantified group for danger signals.
  for (const g of groups) {
    if (!g.quantifier) continue; // group is not repeated — safe

    const body = g.body;

    // --- Check 1: nested quantifier on a sub-group inside this group ---
    // e.g. (a+)+  — the inner `a+` is a quantifier inside a quantified group
    // We look for +, *, or {n,m} that are NOT inside a nested group's
    // own quantifier context (simplified: any quantifier on an atom).
    if (/(?:[^\\]|^)[^()\[\]]\+/.test(body) ||
        /(?:[^\\]|^)[^()\[\]]\*/.test(body) ||
        /(?:[^\\]|^)\)\+/.test(body) ||
        /(?:[^\\]|^)\)\*/.test(body) ||
        /(?:[^\\]|^)\)\{/.test(body)) {
      // But we need to be careful — `(/.*)?$` should NOT trigger this.
      // The outer quantifier must be + or * or {n,}, not just {n}.
      // We already excluded ? above, so if we're here the outer quantifier
      // IS repeating. Check if the inner quantifier could cause overlap.

      // Simple inner quantifier on a character class or dot — dangerous
      if (/(?:[^\\]|^)(?:\.|\\[wWdDsS]|[^()\[\]\\])\+/.test(body) ||
          /(?:[^\\]|^)(?:\.|\\[wWdDsS]|[^()\[\]\\])\*/.test(body)) {
        return {
          safe: false,
          reason: `Nested quantifier detected: a quantified atom inside group "${g.body.slice(0, 30)}..." which is itself quantified with "${g.quantifier}".`,
        };
      }

      // Inner group with quantifier — `(a+)+` pattern
      if (/\)[+*]/.test(body) || /\)\{/.test(body)) {
        return {
          safe: false,
          reason: `Nested quantified group detected inside outer quantified group.`,
        };
      }
    }

    // --- Check 2: alternation inside a quantified group ---
    // e.g. (a|aa)+  — alternation with overlapping arms
    // e.g. (a+|b)+ — quantifier inside alternation arm
    if (body.includes('|')) {
      const arms = splitAlternation(body);

      // Check 2a: any arm contains a quantifier — `(a+|b)+`
      for (const arm of arms) {
        if (/[+*]/.test(arm) || /\{\d+,/.test(arm)) {
          return {
            safe: false,
            reason: `Quantifier inside alternation arm "${arm.slice(0, 20)}" within a quantified group — potential ReDoS.`,
          };
        }
      }

      // Check 2b: overlapping arms — `(a|aa)+`, `(\d|\d\d)+`
      // Simplified: if any arm is a prefix/suffix of another, they overlap.
      for (let i = 0; i < arms.length; i++) {
        for (let j = i + 1; j < arms.length; j++) {
          const a = arms[i].replace(/[\\()]/g, '');
          const b = arms[j].replace(/[\\()]/g, '');
          if (a.length > 0 && b.length > 0) {
            if (a.startsWith(b) || b.startsWith(a) ||
                a.endsWith(b) || b.endsWith(a)) {
              return {
                safe: false,
                reason: `Overlapping alternation arms "${arms[i]}" and "${arms[j]}" inside a quantified group — potential ReDoS.`,
              };
            }
          }
        }
      }
    }
  }

  return {safe: true};
}

/**
 * Split a group body by top-level `|` (not inside nested groups).
 * @param {string} body
 * @returns {string[]}
 */
function splitAlternation(body) {
  const arms = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (ch === '|' && depth === 0) {
      arms.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  arms.push(current);
  return arms;
}

/**
 * Drop-in replacement for `new RegExp(pattern)` that rejects patterns
 * likely to cause catastrophic backtracking.
 *
 * @param {string} pattern  The regex source string.
 * @param {string} [flags]  Optional regex flags.
 * @returns {RegExp}
 * @throws {Error} If the pattern is likely to cause ReDoS.
 */
export function safeRegExp(pattern, flags) {
  const result = checkRegexSafety(pattern);
  if (!result.safe) {
    throw new Error(
      `Potentially dangerous regex pattern rejected: ${result.reason} ` +
        `Pattern: ${pattern}`,
    );
  }
  return new RegExp(pattern, flags);
}
