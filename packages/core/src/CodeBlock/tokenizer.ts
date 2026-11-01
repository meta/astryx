// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tokenizer.ts
 * @input Code string and language identifier
 * @output Array of per-line token arrays with line-relative offsets
 * @position Shared utility; consumed by CodeBlock and CodeEditor
 *
 * SYNC: When modified, update:
 * - /packages/core/src/CodeBlock/CodeBlock.tsx
 * - /packages/core/src/CodeBlock/highlightRanges.ts
 */

/**
 * The Scheduling API (scheduler.yield()) is not yet in TypeScript's DOM lib.
 * Declare the global to avoid TS2304 while keeping the runtime feature detection.
 */
declare const scheduler: {yield?: () => Promise<void>} | undefined;

import {
  BLOCK_COMMENT,
  CALL,
  CPP_WORDS,
  C_WORDS,
  DIRECTIVE,
  NUMBER,
  PUNCTUATION,
  cLike,
  codeLanguagePainter,
} from './grammar';
import type {CodeLanguage, CodeLanguageTokenize, Grammar} from './grammar';

export type {CodeLanguage} from './grammar';

/** A language identifier string or a language value (FR13). */
export type CodeLanguageInput = string | CodeLanguage;

export type SyntaxToken = {type: string; start: number; end: number};

/**
 * Per-line token structure. Each line stores its own tokens with
 * line-relative start/end offsets (0 = start of line).
 */
export type TokenLine = SyntaxToken[];

// ---------------------------------------------------------------------------
// Language definitions
// ---------------------------------------------------------------------------

type LangDef = {
  patterns: {type: string; regex: RegExp; anchored: RegExp}[];
  /** SyntaxToken type that matches the element's default text color (skipped in output). */
  defaultType: string;
};

/** Cache compiled language definitions to avoid re-creating regexes. */
const langCache = new Map<string, LangDef | null>();

const JS_KEYWORDS =
  /\b(const|let|var|function|class|if|else|for|while|return|import|export|from|default|async|await|try|catch|throw|new|typeof|instanceof|interface|type|enum|extends|implements|switch|case|break|continue|do|in|of|void|null|undefined|true|false|this|super|yield|delete|static|public|private|protected|readonly|abstract|as|is|keyof|declare|module|namespace|require)\b/;

const PYTHON_KEYWORDS =
  /\b(def|class|if|elif|else|for|while|return|import|from|as|with|try|except|raise|True|False|None|and|or|not|in|is|lambda|yield|async|await|pass|break|continue|del|global|nonlocal|assert|finally|print|self|cls)\b/;

const BASH_KEYWORDS =
  /\b(if|then|else|elif|fi|for|do|done|while|until|case|esac|function|in|select|return|exit|local|export|source|alias|unalias|readonly|shift|eval|exec|set|unset|trap|wait|read|echo|printf|test|true|false)\b/;

const CSS_KEYWORDS = /\b(important|inherit|initial|unset|revert|auto|none)\b/;

const PHP_KEYWORDS =
  /\b(function|class|if|else|elseif|for|foreach|while|return|echo|public|private|protected|static|new|try|catch|throw|namespace|use|require|require_once|include|include_once|extends|implements|interface|abstract|final|const|var|true|false|null|array|isset|unset|empty|list|match|enum|switch|case|break|continue|do|yield|fn)\b/;

const HACK_KEYWORDS =
  /\b(function|class|if|else|for|foreach|while|return|echo|public|private|protected|static|new|try|catch|throw|namespace|use|require|include|extends|implements|interface|abstract|final|const|shape|vec|dict|keyset|async|await|concurrent|enum|type|newtype|tuple|inout)\b/;

/** How each language value paints, compiled once per value. */
const valueCache = new WeakMap<
  CodeLanguage,
  LangDef | {tokenize: CodeLanguageTokenize; name: string} | null
>();

/**
 * How `language` paints: a compiled grammar (a built-in identifier, or an
 * Astryx module), a custom tokenize function, or null (plain code). An
 * identifier string selects only a built-in grammar (FR12).
 */
function resolveLanguage(
  language: CodeLanguageInput,
): LangDef | {tokenize: CodeLanguageTokenize; name: string} | null {
  if (typeof language !== 'string') {
    const cachedValue = valueCache.get(language);
    if (cachedValue !== undefined) {
      return cachedValue;
    }
    const painter = codeLanguagePainter(language);
    const resolved =
      painter == null
        ? null
        : painter.kind === 'grammar'
          ? compile(painter.grammar)
          : {tokenize: painter.tokenize, name: language.name};
    valueCache.set(language, resolved);
    return resolved;
  }
  const cached = langCache.get(language);
  if (cached !== undefined) {
    return cached;
  }
  const def = buildLanguageUncached(language);
  langCache.set(language, def);
  return def;
}

/** A compiled grammar for `language`, or null for a custom or plain one. */
function buildLanguage(language: CodeLanguageInput): LangDef | null {
  const resolved = resolveLanguage(language);
  return resolved != null && 'patterns' in resolved ? resolved : null;
}

/** The tokens of a custom language, or null when `language` is not one. */
function customTokens(
  code: string,
  language: CodeLanguageInput,
): TokenLine[] | null {
  const resolved = resolveLanguage(language);
  if (resolved == null || !('tokenize' in resolved)) {
    return null;
  }
  // A missing function paints nothing rather than throwing, as an absent
  // `tokenizer` prop does.
  return typeof resolved.tokenize === 'function'
    ? flatTokensToLines(resolved.tokenize(code, resolved.name), code)
    : null;
}

function buildLanguageUncached(lang: string): LangDef | null {
  const raw = buildLanguagePatterns(lang);
  return raw ? compile(raw) : null;
}

function compile(raw: Grammar): LangDef {
  return {
    defaultType: raw.defaultType,
    patterns: raw.patterns.map(p => {
      const flags = p.regex.flags.replace(/[gy]/g, '') + 'y';
      return {...p, anchored: new RegExp(p.regex.source, flags)};
    }),
  };
}

function buildLanguagePatterns(lang: string): Grammar | null {
  switch (lang) {
    case 'typescript':
    case 'javascript':
    case 'tsx':
    case 'jsx':
    case 'ts':
    case 'js':
      return {
        defaultType: 'variable',
        patterns: [
          {type: 'comment', regex: /\/\*[\s\S]*?\*\//},
          {type: 'comment', regex: /\/\/[^\n]*/},
          {type: 'string', regex: /`(?:[^`\\]|\\.)*`/},
          {type: 'string', regex: /"(?:[^"\\]|\\.)*"/},
          {type: 'string', regex: /'(?:[^'\\]|\\.)*'/},
          {type: 'constant', regex: /@[\w]+/},
          {type: 'number', regex: /\b0[xX][0-9a-fA-F_]+\b/},
          {type: 'number', regex: /\b0[bB][01_]+\b/},
          {type: 'number', regex: /\b0[oO][0-7_]+\b/},
          {type: 'number', regex: /\b\d[\d_]*\.?[\d_]*(?:[eE][+-]?\d+)?\b/},
          {type: 'keyword', regex: JS_KEYWORDS},
          {type: 'function', regex: /\b[a-zA-Z_$][\w$]*(?=\s*\()/},
          {type: 'type', regex: /\b[A-Z][a-zA-Z0-9_]*\b/},
          {type: 'operator', regex: /[+\-*/%=!<>&|^~?:]+/},
          // eslint-disable-next-line no-useless-escape
          {type: 'punctuation', regex: /[{}()\[\];,.]/},
          {type: 'variable', regex: /\b[a-zA-Z_$][\w$]*\b/},
        ],
      };

    case 'json':
      return {
        defaultType: 'punctuation',
        patterns: [
          {type: 'property', regex: /"(?:[^"\\]|\\.)*"(?=\s*:)/},
          {type: 'string', regex: /"(?:[^"\\]|\\.)*"/},
          {type: 'number', regex: /-?\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/},
          {type: 'constant', regex: /\b(true|false|null)\b/},
          // eslint-disable-next-line no-useless-escape
          {type: 'punctuation', regex: /[{}()\[\]:,]/},
        ],
      };

    case 'html':
    case 'xml':
    case 'svg':
      return {
        defaultType: 'variable',
        patterns: [
          {type: 'comment', regex: /<!--[\s\S]*?-->/},
          {type: 'keyword', regex: /<!DOCTYPE[^>]*>/i},
          {type: 'tag', regex: /<\/[a-zA-Z][\w-]*\s*>/},
          {type: 'tag', regex: /<[a-zA-Z][\w-]*/},
          {type: 'tag', regex: /\/?>/},
          {type: 'string', regex: /"(?:[^"\\]|\\.)*"/},
          {type: 'string', regex: /'(?:[^'\\]|\\.)*'/},
          {type: 'attribute', regex: /\b[a-zA-Z_:][\w:.-]*(?=\s*=)/},
          {type: 'operator', regex: /=/},
        ],
      };

    case 'css':
    case 'scss':
    case 'less':
      return {
        defaultType: 'variable',
        patterns: [
          {type: 'comment', regex: /\/\*[\s\S]*?\*\//},
          {type: 'comment', regex: /\/\/[^\n]*/},
          {type: 'string', regex: /"(?:[^"\\]|\\.)*"/},
          {type: 'string', regex: /'(?:[^'\\]|\\.)*'/},
          {type: 'variable', regex: /--[a-zA-Z_-][\w-]*/},
          {
            type: 'number',
            regex:
              /-?\b\d+\.?\d*(?:px|em|rem|%|vh|vw|vmin|vmax|ch|ex|deg|rad|turn|s|ms|fr)?\b/,
          },
          {type: 'constant', regex: /#[0-9a-fA-F]{3,8}\b/},
          {type: 'keyword', regex: CSS_KEYWORDS},
          {type: 'keyword', regex: /@[a-zA-Z][\w-]*/},
          {type: 'tag', regex: /[.#][a-zA-Z_-][\w-]*/},
          {type: 'keyword', regex: /::?[a-zA-Z][\w-]*/},
          {type: 'function', regex: /\b[a-zA-Z_-][\w-]*(?=\s*\()/},
          {type: 'property', regex: /[a-zA-Z_-][\w-]*(?=\s*:)/},
          // eslint-disable-next-line no-useless-escape
          {type: 'punctuation', regex: /[{}()\[\];:,]/},
          {type: 'operator', regex: /[+~>*=|^$]/},
        ],
      };

    case 'python':
    case 'py':
      return {
        defaultType: 'variable',
        patterns: [
          {type: 'string', regex: /"""[\s\S]*?"""/},
          {type: 'string', regex: /'''[\s\S]*?'''/},
          {type: 'string', regex: /f"(?:[^"\\]|\\.)*"/},
          {type: 'string', regex: /f'(?:[^'\\]|\\.)*'/},
          {type: 'comment', regex: /#[^\n]*/},
          {type: 'string', regex: /"(?:[^"\\]|\\.)*"/},
          {type: 'string', regex: /'(?:[^'\\]|\\.)*'/},
          {type: 'constant', regex: /@[\w.]+/},
          {type: 'number', regex: /\b0[xX][0-9a-fA-F_]+\b/},
          {type: 'number', regex: /\b0[bB][01_]+\b/},
          {type: 'number', regex: /\b0[oO][0-7_]+\b/},
          {type: 'number', regex: /\b\d[\d_]*\.?[\d_]*(?:[eE][+-]?\d+)?j?\b/},
          {type: 'keyword', regex: PYTHON_KEYWORDS},
          {type: 'function', regex: /\b[a-zA-Z_][\w]*(?=\s*\()/},
          {type: 'type', regex: /\b[A-Z][a-zA-Z0-9_]*\b/},
          {type: 'operator', regex: /[+\-*/%=!<>&|^~@:]+/},
          // eslint-disable-next-line no-useless-escape
          {type: 'punctuation', regex: /[{}()\[\];,.]/},
          {type: 'variable', regex: /\b[a-zA-Z_][\w]*\b/},
        ],
      };

    case 'bash':
    case 'sh':
    case 'zsh':
    case 'shell':
      return {
        defaultType: 'variable',
        patterns: [
          {type: 'comment', regex: /#[^\n]*/},
          {type: 'string', regex: /"(?:[^"\\]|\\.)*"/},
          {type: 'string', regex: /'[^']*'/},
          {type: 'variable', regex: /\$\{[^}]+\}/},
          {type: 'variable', regex: /\$[a-zA-Z_][\w]*/},
          {type: 'variable', regex: /\$[0-9@#?*!$-]/},
          {type: 'number', regex: /\b\d+\b/},
          {type: 'keyword', regex: BASH_KEYWORDS},
          {type: 'function', regex: /\b[a-zA-Z_][\w]*(?=\s*\()/},
          {type: 'operator', regex: /[|&<>;!]+/},
          // eslint-disable-next-line no-useless-escape
          {type: 'punctuation', regex: /[{}()\[\]]/},
        ],
      };

    case 'php':
      return {
        defaultType: 'variable',
        patterns: [
          {type: 'comment', regex: /\/\*[\s\S]*?\*\//},
          {type: 'comment', regex: /\/\/[^\n]*/},
          {type: 'comment', regex: /#[^\n]*/},
          {type: 'string', regex: /"(?:[^"\\]|\\.)*"/},
          {type: 'string', regex: /'(?:[^'\\]|\\.)*'/},
          {type: 'variable', regex: /\$[a-zA-Z_][\w]*/},
          {type: 'number', regex: /\b0[xX][0-9a-fA-F]+\b/},
          {type: 'number', regex: /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/},
          {type: 'keyword', regex: PHP_KEYWORDS},
          {type: 'function', regex: /\b[a-zA-Z_][\w]*(?=\s*\()/},
          {type: 'type', regex: /\b[A-Z][a-zA-Z0-9_]*\b/},
          {type: 'operator', regex: /[+\-*/%=!<>&|^~?:.]+/},
          {type: 'constant', regex: /@[\w]+/},
          // eslint-disable-next-line no-useless-escape
          {type: 'punctuation', regex: /[{}()\[\];,.]/},
        ],
      };

    case 'hack':
      return {
        defaultType: 'variable',
        patterns: [
          {type: 'comment', regex: /\/\*[\s\S]*?\*\//},
          {type: 'comment', regex: /\/\/[^\n]*/},
          {type: 'string', regex: /"(?:[^"\\]|\\.)*"/},
          {type: 'string', regex: /'(?:[^'\\]|\\.)*'/},
          {type: 'variable', regex: /\$[a-zA-Z_][\w]*/},
          {type: 'number', regex: /\b0[xX][0-9a-fA-F]+\b/},
          {type: 'number', regex: /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/},
          {type: 'keyword', regex: HACK_KEYWORDS},
          {type: 'type', regex: /\b[A-Z][a-zA-Z0-9_]*\b/},
          {type: 'function', regex: /\b[a-zA-Z_][\w]*(?=\s*\()/},
          {type: 'property', regex: /(?<=->|::)\b[a-zA-Z_][\w]*\b/},
          {type: 'operator', regex: /[+\-*/%=!<>&|^~?:.]+/},
          {type: 'constant', regex: /<<[\w]+/},
          // eslint-disable-next-line no-useless-escape
          {type: 'punctuation', regex: /[{}()\[\];,.]/},
        ],
      };

    case 'yaml':
    case 'yml':
      return {
        defaultType: 'variable',
        patterns: [
          {type: 'comment', regex: /#[^\n]*/},
          {type: 'string', regex: /"(?:[^"\\]|\\.)*"/},
          {type: 'string', regex: /'(?:[^'\\]|\\.)*'/},
          {type: 'constant', regex: /\b(true|false|yes|no|on|off|null|~)\b/i},
          {type: 'variable', regex: /[&*][\w]+/},
          {type: 'type', regex: /!!\w+/},
          {type: 'number', regex: /\b-?\d+\.?\d*(?:[eE][+-]?\d+)?\b/},
          {type: 'property', regex: /^[ \t]*[\w][\w ./-]*(?=\s*:)/m},
          {type: 'keyword', regex: /---/},
          {type: 'keyword', regex: /\.\.\./},
          {type: 'operator', regex: /[:|>\-?]/},
          // eslint-disable-next-line no-useless-escape
          {type: 'punctuation', regex: /[{}()\[\],]/},
          {type: 'variable', regex: /\b[a-zA-Z_][\w]*\b/},
        ],
      };

    case 'markdown':
    case 'md':
      return {
        defaultType: 'variable',
        patterns: [
          {type: 'keyword', regex: /^```[\w]*$/m},
          {type: 'keyword', regex: /^#{1,6}\s+.*/m},
          {type: 'keyword', regex: /^---$/m},
          {type: 'keyword', regex: /^\*\*\*$/m},
          {type: 'string', regex: /\*\*(?:[^*]|\*(?!\*))+\*\*/},
          {type: 'string', regex: /\*(?:[^*])+\*/},
          {type: 'constant', regex: /`[^`]+`/},
          {type: 'function', regex: /\[(?:[^\]])+\]\([^)]+\)/},
          {type: 'comment', regex: /^>\s+.*/m},
          {type: 'operator', regex: /^\s*[-*+]\s/m},
          {type: 'number', regex: /^\s*\d+\.\s/m},
        ],
      };

    case 'c':
    case 'h':
      return cLike(C_WORDS, [{type: 'keyword', regex: DIRECTIVE}]);

    case 'cpp':
    case 'c++':
    case 'cc':
    case 'cxx':
    case 'hpp':
    case 'hh':
      return cLike(CPP_WORDS, [
        {type: 'keyword', regex: DIRECTIVE},
        {
          type: 'string',
          regex: /\b(?:u8|[uUL])?R"([^()\\\s]{0,16})\([\s\S]*?\)\1"/,
        },
      ]);

    case 'sql':
      return {
        defaultType: 'variable',
        patterns: [
          {type: 'comment', regex: /--[^\n]*/},
          {type: 'comment', regex: BLOCK_COMMENT},
          {type: 'string', regex: /'(?:[^']|'')*'/},
          {type: 'property', regex: /"[^"\n]*"|`[^`\n]*`/},
          {type: 'number', regex: NUMBER},
          {
            type: 'keyword',
            regex:
              /\b(?:select|from|where|and|or|not|in|is|null|as|join|inner|left|right|full|outer|cross|on|group|by|order|having|limit|offset|union|all|distinct|insert|into|values|update|set|delete|create|table|view|index|drop|alter|add|primary|key|foreign|references|with|case|when|then|else|end|exists|between|like|asc|desc|true|false|default|returning|interval)\b/i,
          },
          {type: 'function', regex: CALL},
          {type: 'operator', regex: /[+\-*/%=<>!|]+/},
          {type: 'punctuation', regex: PUNCTUATION},
        ],
      };

    case 'rust':
    case 'rs':
      return cLike(
        'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while',
        [
          {type: 'constant', regex: /#!?\[[^\]\n]*\]/},
          {type: 'function', regex: /\b[a-zA-Z_]\w*!(?=\s*[([{])/},
          {type: 'string', regex: /\bb?r(#*)"[\s\S]*?"\1/},
          {type: 'type', regex: /'[a-z_]\w*\b(?!')/},
        ],
      );

    case 'kotlin':
    case 'kt':
    case 'kts':
      return cLike(
        'as break class continue do else false for fun if in interface is null object package return super this throw true try typealias val var when while by constructor init companion data sealed enum open override private protected public internal suspend inline lateinit import',
        [
          {type: 'constant', regex: /@\w+/},
          {type: 'string', regex: /"""[\s\S]*?"""/},
        ],
      );

    case 'swift':
      return cLike(
        'associatedtype class deinit enum extension func import init inout internal let open operator private protocol public static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as catch false is nil rethrows super self Self throw throws true try async await actor some any',
        [
          {type: 'string', regex: /(#+)"[\s\S]*?"\1/},
          {type: 'constant', regex: /[@#]\w+/},
          {type: 'string', regex: /"""[\s\S]*?"""/},
        ],
      );

    case 'go':
    case 'golang':
      return cLike(
        'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil iota',
        [{type: 'string', regex: /`[^`]*`/}],
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Diff lines
// ---------------------------------------------------------------------------

/** How a unified-diff line reads: what it adds, removes, frames, or keeps. */
export type DiffLineKind = 'added' | 'removed' | 'header' | 'context';

/**
 * Read a Markdown fence info string the way CodeBlock renders it: `diff` is
 * the diff layer over plaintext, `diff-<lang>` (the common convention) is the
 * diff layer over `<lang>`, anything else is a language.
 */
export function parseFenceLanguage(info: string | undefined): {
  language: string;
  isDiff: boolean;
} {
  const value = (info ?? '').trim();
  if (value === 'diff') {
    return {language: 'plaintext', isDiff: true};
  }
  const layered = /^diff-(.+)$/.exec(value);
  if (layered) {
    return {language: layered[1], isDiff: true};
  }
  return {language: value || 'plaintext', isDiff: false};
}

/**
 * Split a diff into the glyph column and the code the base language sees:
 * every added, removed, or space-led context line loses its first character
 * (the `+`, `-`, or space); a context line with no leading space keeps all
 * of it; header lines contribute an empty line so offsets stay per line.
 */
export function splitDiffLines(lines: ReadonlyArray<string>): {
  kinds: DiffLineKind[];
  glyphs: string[];
  content: string[];
} {
  const kinds: DiffLineKind[] = [];
  const glyphs: string[] = [];
  const content: string[] = [];
  const fileHeaders = fileHeaderLines(lines);
  lines.forEach((line, index) => {
    const kind = diffLineKind(line, {isFileHeader: fileHeaders.has(index)});
    kinds.push(kind);
    if (kind === 'header') {
      glyphs.push('');
      content.push('');
    } else if (kind === 'context' && !line.startsWith(' ')) {
      // A context line without its leading space (an unindented diff, or
      // an empty line) has no glyph: the marker column is empty and the
      // whole line is code.
      glyphs.push('');
      content.push(line);
    } else {
      glyphs.push(line.slice(0, 1));
      content.push(line.slice(1));
    }
  });
  return {kinds, glyphs, content};
}

/**
 * Classify one line of a unified diff by its first character: `+` added,
 * `-` removed, `@@` header, anything else context. A `--- ` line (with its
 * space) directly followed by a `+++ ` line and then an `@@` line is a file
 * header (both lines), wherever it occurs; every other `---`/`+++` line is
 * removed or added, so a removed line that starts with `--` — `---i;`
 * included — is never misread. The glyph is part of the text and is never
 * removed.
 */
export function diffLineKind(
  line: string,
  {isFileHeader = false}: {isFileHeader?: boolean} = {},
): DiffLineKind {
  if (line.startsWith('@@') || isFileHeader) {
    return 'header';
  }
  if (line.startsWith('+')) {
    return 'added';
  }
  if (line.startsWith('-')) {
    return 'removed';
  }
  return 'context';
}

/**
 * The indexes of the `--- `/`+++ ` lines (unified-diff form, with the space)
 * that form a file header directly before an `@@`; `---i;` is a change.
 */
export function fileHeaderLines(lines: ReadonlyArray<string>): Set<number> {
  const headers = new Set<number>();
  for (let i = 0; i + 2 < lines.length; i++) {
    if (
      lines[i].startsWith('--- ') &&
      lines[i + 1].startsWith('+++ ') &&
      lines[i + 2].startsWith('@@')
    ) {
      headers.add(i);
      headers.add(i + 1);
    }
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Core tokenizer
// ---------------------------------------------------------------------------

/** Threshold below which we tokenize synchronously (characters). */
export const SYNC_TOKENIZE_THRESHOLD = 2000;

/** Characters to process per chunk in async tokenization. */
const ASYNC_CHUNK_SIZE = 800;

/**
 * Yield to the main thread. Uses `scheduler.yield()` when available,
 * falling back to `setTimeout(resolve, 0)`.
 */
async function yieldToMain(): Promise<void> {
  if (
    typeof scheduler !== 'undefined' &&
    typeof scheduler.yield === 'function'
  ) {
    return scheduler.yield();
  }
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Tokenize a single line. Tokens whose type matches `defaultType`
 * are omitted — the element's base color handles them.
 * Returns tokens with line-relative offsets (0 = start of line).
 */
function tokenizeLine(
  code: string,
  langDef: LangDef,
  lineStart: number,
  lineEnd: number,
): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  let pos = lineStart;
  const limit = Math.min(lineEnd, code.length);

  while (pos < limit) {
    let matched = false;

    for (const pattern of langDef.patterns) {
      pattern.anchored.lastIndex = pos;
      const match = pattern.anchored.exec(code);

      if (match && match.index === pos && match[0].length > 0) {
        if (pattern.type !== langDef.defaultType) {
          tokens.push({
            type: pattern.type,
            start: pos - lineStart,
            end: pos - lineStart + match[0].length,
          });
        }
        pos += match[0].length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      pos++;
    }
  }

  return tokens;
}

/**
 * Tokenizes a code string into per-line token arrays.
 *
 * Each line's tokens use line-relative offsets. Tokens matching the
 * language's default color type are omitted (~30% reduction).
 *
 * @param code - The source code string to tokenize
 * @param language - A built-in identifier (e.g. 'typescript') or a language value
 * @returns Array of token arrays, one per line
 */
export function tokenize(
  code: string,
  language: CodeLanguageInput,
): TokenLine[] {
  const custom = customTokens(code, language);
  if (custom != null) {
    return custom;
  }
  const langDef = buildLanguage(language);
  if (!langDef) {
    return [];
  }

  const result: TokenLine[] = [];
  let lineStart = 0;

  for (let i = 0; i <= code.length; i++) {
    if (i === code.length || code[i] === '\n') {
      result.push(tokenizeLine(code, langDef, lineStart, i));
      lineStart = i + 1;
    }
  }

  return result;
}

/**
 * Async tokenizer that yields to the main thread between batches
 * of lines (~800 chars per batch).
 */
export async function tokenizeAsync(
  code: string,
  language: CodeLanguageInput,
  signal?: AbortSignal,
): Promise<TokenLine[]> {
  // A custom language runs synchronously, as the `tokenizer` prop does.
  const custom = customTokens(code, language);
  if (custom != null) {
    return custom;
  }
  const langDef = buildLanguage(language);
  if (!langDef) {
    return [];
  }

  const result: TokenLine[] = [];
  let lineStart = 0;
  let charsInChunk = 0;

  for (let i = 0; i <= code.length; i++) {
    if (i === code.length || code[i] === '\n') {
      result.push(tokenizeLine(code, langDef, lineStart, i));
      charsInChunk += i - lineStart + 1;
      lineStart = i + 1;

      if (charsInChunk >= ASYNC_CHUNK_SIZE && i < code.length) {
        if (signal?.aborted) {
          return result;
        }
        charsInChunk = 0;
        await yieldToMain();
      }
    }
  }

  return result;
}

/**
 * Streaming tokenizer with per-batch callback. Tokenizes lines in
 * batches and invokes `onBatch` after each so consumers can apply
 * highlights progressively.
 */
export async function tokenizeStreaming(
  code: string,
  language: CodeLanguageInput,
  onBatch: (lines: TokenLine[], startLine: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const custom = customTokens(code, language);
  if (custom != null) {
    onBatch(custom, 0);
    return;
  }
  const langDef = buildLanguage(language);
  if (!langDef) {
    return;
  }

  let lineStart = 0;
  let lineIndex = 0;
  let charsInChunk = 0;
  let batch: TokenLine[] = [];
  let batchStartLine = 0;

  for (let i = 0; i <= code.length; i++) {
    if (i === code.length || code[i] === '\n') {
      batch.push(tokenizeLine(code, langDef, lineStart, i));
      charsInChunk += i - lineStart + 1;
      lineIndex++;
      lineStart = i + 1;

      if (charsInChunk >= ASYNC_CHUNK_SIZE && i < code.length) {
        if (signal?.aborted) {
          return;
        }
        onBatch(batch, batchStartLine);
        batch = [];
        batchStartLine = lineIndex;
        charsInChunk = 0;
        await yieldToMain();
      }
    }
  }

  if (batch.length > 0) {
    onBatch(batch, batchStartLine);
  }
}

/**
 * Convert legacy flat tokens (absolute offsets) to per-line tokens
 * (line-relative offsets). For backwards compatibility with custom
 * tokenizers that return the old format.
 */
export function flatTokensToLines(
  tokens: {type: string; start: number; end: number}[],
  code: string,
): TokenLine[] {
  const lineStarts: number[] = [0];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '\n') {
      lineStarts.push(i + 1);
    }
  }

  const result: TokenLine[] = Array.from({length: lineStarts.length}, () => []);
  let lineIdx = 0;

  for (const token of tokens) {
    while (
      lineIdx < lineStarts.length - 1 &&
      token.start >= lineStarts[lineIdx + 1]
    ) {
      lineIdx++;
    }

    const lineStart = lineStarts[lineIdx];
    result[lineIdx].push({
      type: token.type,
      start: token.start - lineStart,
      end: token.end - lineStart,
    });
  }

  return result;
}
