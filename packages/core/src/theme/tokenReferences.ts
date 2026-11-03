// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tokenReferences.ts
 * @input A flat map of token names to raw CSS values
 * @output `resolveTokenReferences`, which follows `var(--name[, fallback])`
 *   references through the map, and the CSS parsing helpers it shares
 *   (`splitTopLevelComma`, `findMatchingParen`)
 * @position Theme utility with no imports: tokens.ts resolves a theme's token
 *   graph on it (evaluating color functions as it goes), and themeMotion.ts
 *   resolves motion tokens written as references on it. Pure; safe on the
 *   server.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/theme/tokens.ts
 * - /packages/core/src/theme/themeMotion.ts
 */

/**
 * Split the arguments of a CSS function body on the first top-level comma.
 * Handles nested functions such as rgba(), color-mix(), var(), and quoted strings.
 */
export function splitTopLevelComma(input: string): [string, string] | null {
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let isEscaped = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (quote !== null) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '(') {
      depth++;
      continue;
    }

    if (char === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (char === ',' && depth === 0) {
      return [input.slice(0, i).trim(), input.slice(i + 1).trim()];
    }
  }

  return null;
}

/** Index of the `)` matching the `(` at `openIndex`, or -1 when unbalanced. */
export function findMatchingParen(input: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < input.length; i++) {
    const char = input[i];
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Resolves every value in `raw` to a concrete one: each `var(--name[,
 * fallback])` is replaced by `name`'s resolved value, or by its fallback when
 * `raw` has no `name`, and is kept as written when neither exists or the
 * references form a cycle. `evaluate` then runs on each substituted value
 * (tokens.ts evaluates CSS color functions there).
 */
export function resolveTokenReferences(
  raw: Readonly<Record<string, string>>,
  evaluate: (expr: string) => string = expr => expr,
): Record<string, string> {
  const cache: Record<string, string> = {};

  // `seen` tracks the reference chain, so a cycle resolves to the literal
  // reference instead of recursing forever.
  const substitute = (expr: string, seen: Set<string>): string => {
    const start = expr.indexOf('var(');
    if (start === -1) {
      return expr;
    }
    const openIndex = start + 'var'.length;
    const closeIndex = findMatchingParen(expr, openIndex);
    if (closeIndex === -1) {
      return expr;
    }

    const inner = expr.slice(openIndex + 1, closeIndex);
    const commaSplit = splitTopLevelComma(inner);
    const name = (commaSplit ? commaSplit[0] : inner).trim();
    const fallback = commaSplit ? commaSplit[1] : null;

    let replacement: string;
    if (seen.has(name)) {
      replacement = expr.slice(start, closeIndex + 1);
    } else if (name in raw) {
      seen.add(name);
      replacement = reference(name, seen);
      seen.delete(name);
    } else if (fallback !== null) {
      replacement = substitute(fallback.trim(), seen);
    } else {
      replacement = expr.slice(start, closeIndex + 1);
    }

    const rest = substitute(expr.slice(closeIndex + 1), seen);
    return expr.slice(0, start) + replacement + rest;
  };

  const reference = (name: string, seen: Set<string>): string => {
    if (name in cache) {
      return cache[name];
    }
    const value = raw[name];
    if (value === undefined) {
      return '';
    }
    const resolved = evaluate(
      value.includes('var(') ? substitute(value, seen) : value,
    );
    cache[name] = resolved;
    return resolved;
  };

  for (const name of Object.keys(raw)) {
    reference(name, new Set<string>());
  }
  return cache;
}
