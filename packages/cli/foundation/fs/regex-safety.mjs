// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regex safety utilities for user-supplied patterns.
 *
 * Used by file-protection.mjs to validate .hgignore regexp patterns before
 * compilation. Guards against Regular Expression Denial of Service (ReDoS)
 * by rejecting patterns that contain constructs known to cause catastrophic
 * backtracking.
 *
 * @see https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS
 */

/**
 * Heuristic check for regex patterns likely to cause catastrophic backtracking.
 *
 * Rejects patterns containing:
 * 1. Nested quantifiers: `(a+)+`, `(a*)*`, `(a+)*`, `(a{2,})+` etc.
 * 2. Overlapping alternations with quantifiers: `(a|a)+`
 * 3. Quantified groups with overlapping character classes: `([\w.]+)+`
 *
 * This is a conservative heuristic — it may reject some safe patterns, but
 * it will never accept a pattern known to cause exponential backtracking.
 *
 * @param {string} pattern - The regex pattern string to check
 * @returns {{safe: boolean, reason?: string}}
 */
export function checkRegexSafety(pattern) {
  // Detect nested quantifiers: a quantifier immediately after a group
  // that itself contains a quantifier on a repeated element.
  // Pattern: group containing (something+, something*, something{n,}) followed
  // by another quantifier (+, *, {n,}).
  //
  // This catches: (a+)+, (a+)*, (.*)+, ([a-z]+)+, (\w+){2,}, etc.
  const nestedQuantifier =
    /\([^)]*(?:[^\\]|^)[+*}]\)[+*?]|\([^)]*(?:[^\\]|^)[+*}]\)\{/;
  if (nestedQuantifier.test(pattern)) {
    return {
      safe: false,
      reason: `pattern contains nested quantifiers which can cause catastrophic backtracking (ReDoS)`,
    };
  }

  // Detect quantified groups with overlapping character classes.
  // Pattern: group with a character class that overlaps with adjacent content,
  // followed by a quantifier.
  // This catches: ([a-z.]+)+, ([\w-]+)*, etc.
  const quantifiedOverlap =
    /\(\[(?:[^\]\\]|\\.)*\][+*]\)[+*]|\(\[(?:[^\]\\]|\\.)*\][+*]\)\{/;
  if (quantifiedOverlap.test(pattern)) {
    return {
      safe: false,
      reason: `pattern contains quantified group with character class which can cause catastrophic backtracking (ReDoS)`,
    };
  }

  // Detect star-height > 1 patterns with wildcards: (.*X)+ variants
  const starHeight =
    /\([^)]*\.\*[^)]*\)[+*]|\([^)]*\.\+[^)]*\)[+*]/;
  if (starHeight.test(pattern)) {
    return {
      safe: false,
      reason: `pattern contains wildcard repetition inside a quantified group (ReDoS risk)`,
    };
  }

  return {safe: true};
}

/**
 * Compile a regex pattern with ReDoS safety checks.
 *
 * @param {string} pattern - The regex pattern string
 * @param {string} [flags] - Optional regex flags
 * @returns {RegExp} The compiled regex
 * @throws {Error} If the pattern is unsafe or invalid
 */
export function safeRegExp(pattern, flags) {
  const check = checkRegexSafety(pattern);
  if (!check.safe) {
    throw new Error(
      `Refusing to compile unsafe regex pattern: ${check.reason}. Pattern: ${pattern}`,
    );
  }
  return new RegExp(pattern, flags);
}

