// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file codeLineTokens.ts
 * @input Core CodeBlock's tokenizer (`tokenize`) and token line type.
 * @output Exports CodeLineTokens, which keeps core CodeBlock's tokens for a
 *   block of code line by line and re-tokenizes only the lines an edit can
 *   change.
 * @position Used by CodeSyntaxPlugin. Its tokens always equal what `tokenize`
 *   returns for the whole code. An edit re-tokenizes only its own line, and
 *   at most the line above it, for the built-in TypeScript, JavaScript,
 *   Python, and shell grammars while every line passes `standsAlone`;
 *   anything else re-tokenizes all of it. The checks follow those grammars'
 *   patterns in core CodeBlock's tokenizer.ts, and codeLineTokens.test.ts
 *   compares edits against a full `tokenize`, so a grammar change that
 *   breaks them fails there.
 */

import {
  tokenize,
  type CodeLanguage,
  type TokenLine,
} from '@astryxdesign/core/CodeBlock';

type Family = 'javascript' | 'python' | 'shell';

const FAMILIES: ReadonlyMap<string, Family> = new Map([
  ['typescript', 'javascript'],
  ['javascript', 'javascript'],
  ['tsx', 'javascript'],
  ['jsx', 'javascript'],
  ['ts', 'javascript'],
  ['js', 'javascript'],
  ['python', 'python'],
  ['py', 'python'],
  ['bash', 'shell'],
  ['sh', 'shell'],
  ['zsh', 'shell'],
  ['shell', 'shell'],
]);

/** What can open a string or comment that runs on past its line. */
const OPENERS: Readonly<Record<Family, RegExp>> = {
  javascript: /['"`]|\/\*/,
  python: /['"]/,
  shell: /['"`]|\$\{|\$\(|<</,
};

/** A line whose last visible character can end a function name. */
const NAME_END = /[\w$]\s*$/;

/**
 * Whether the name that ends a line can change color with the code after
 * it: its last visible character is a name character outside every string,
 * comment, number, keyword, and constant, whose patterns come before
 * function names.
 */
function endsInOpenName(text: string, tokens: TokenLine): boolean {
  const last = text.trimEnd().length - 1;
  return (
    NAME_END.test(text) &&
    !tokens.some(
      token =>
        token.start <= last &&
        token.end > last &&
        token.type !== 'function' &&
        token.type !== 'type',
    )
  );
}

/** A line's first visible character, or '' when it has none. */
function firstVisible(line: string): string {
  return /\S/.exec(line)?.[0] ?? '';
}

/**
 * Whether a line's strings and comments all close on it. Their patterns
 * match line breaks, so an opener left open can run on to a later line.
 * Only a string or comment the tokenizer emitted shields an opener: one that
 * another token swallowed, such as `/*` in the operator `+/*`, still counts
 * as open. Python tries triple quotes first, so `"""` can pair with another
 * line even where its quotes close as single strings on this one.
 */
function standsAlone(text: string, tokens: TokenLine, family: Family): boolean {
  if (family === 'python' && /'''|"""/.test(text)) {
    return false;
  }
  const opener = OPENERS[family];
  let position = 0;
  for (const token of tokens) {
    if (token.end > text.length) {
      return false;
    }
    if (token.type === 'string' || token.type === 'comment') {
      if (opener.test(text.slice(position, token.start))) {
        return false;
      }
      position = token.end;
    }
  }
  return !opener.test(text.slice(position));
}

/**
 * Core CodeBlock's tokens for a block of code, kept line by line with
 * line-relative offsets, exactly as `tokenize` returns them for the whole
 * code.
 */
export class CodeLineTokens {
  readonly language: string | CodeLanguage;
  /** Where each line starts in the code. */
  starts: number[] = [];
  /** Each line's tokens. */
  tokens: TokenLine[] = [];
  private lines: string[] = [];
  private readonly family: Family | null;
  /** Whether every line stands alone, so an edit re-tokenizes lines alone. */
  private linesStandAlone = false;

  constructor(text: string, language: string | CodeLanguage) {
    this.language = language;
    this.family =
      typeof language === 'string' ? (FAMILIES.get(language) ?? null) : null;
    this.tokenizeAll(text);
  }

  /** The code. */
  get text(): string {
    return this.lines.join('\n');
  }

  /** The line that holds `offset` in the code. */
  lineAt(offset: number): number {
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >>> 1;
      if (this.starts[mid] <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low;
  }

  /**
   * Replaces `removed` characters at `offset` in the code with `inserted`.
   * Returns the lines it re-tokenized when the edit stays inside one line
   * and every line still stands alone; otherwise it re-tokenizes all the
   * code and returns null.
   */
  replace(offset: number, removed: number, inserted: string): number[] | null {
    const line = this.lineAt(offset);
    const before = this.lines[line];
    const column = offset - this.starts[line];
    if (
      this.family == null ||
      !this.linesStandAlone ||
      column + removed > before.length ||
      inserted.includes('\n')
    ) {
      const text = this.text;
      this.tokenizeAll(
        text.slice(0, offset) + inserted + text.slice(offset + removed),
      );
      return null;
    }
    const after =
      before.slice(0, column) + inserted + before.slice(column + removed);
    this.lines[line] = after;
    const tokens = this.tokenizeLine(line);
    if (!standsAlone(after, tokens, this.family)) {
      this.tokenizeAll(this.text);
      return null;
    }
    this.tokens[line] = tokens;
    for (let i = line + 1; i < this.starts.length; i++) {
      this.starts[i] += inserted.length - removed;
    }
    const changed = [line];
    // A name that ends an earlier line looks past blank lines for `(`, so a
    // new first visible character here can change that name's color.
    if (firstVisible(before) !== firstVisible(after)) {
      let above = line - 1;
      while (above >= 0 && firstVisible(this.lines[above]) === '') {
        above--;
      }
      if (
        above >= 0 &&
        endsInOpenName(this.lines[above], this.tokens[above] ?? [])
      ) {
        this.tokens[above] = this.tokenizeLine(above);
        changed.unshift(above);
      }
    }
    return changed;
  }

  /**
   * A line's tokens as `tokenize` finds them in the whole code. A function
   * name is a name followed by `(` past any whitespace, line breaks
   * included, so when the line ends in a name, the code up to the next
   * visible character is tokenized with it.
   */
  private tokenizeLine(line: number): TokenLine {
    let text = this.lines[line];
    if (NAME_END.test(text)) {
      for (let next = line + 1; next < this.lines.length; next++) {
        const visible = /\S/.exec(this.lines[next]);
        text +=
          '\n' +
          (visible == null
            ? this.lines[next]
            : this.lines[next].slice(0, visible.index + 1));
        if (visible != null) {
          break;
        }
      }
    }
    return tokenize(text, this.language)[0] ?? [];
  }

  private tokenizeAll(text: string): void {
    this.lines = text.split('\n');
    let start = 0;
    this.starts = this.lines.map(line => {
      const lineStart = start;
      start += line.length + 1;
      return lineStart;
    });
    this.tokens = tokenize(text, this.language);
    const family = this.family;
    this.linesStandAlone =
      family != null &&
      this.lines.every((line, i) =>
        standsAlone(line, this.tokens[i] ?? [], family),
      );
  }
}
