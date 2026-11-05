// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @description Static diff classifier that scores how likely a PR changes rendered
 *   appearance (issue #3667). Pure, dependency-free function over unified diff
 *   text — no git access, no rendering. Consumed by review-signal.yml as the
 *   content-based design signal (loaded from the BASE ref, run against the PR's
 *   API diff — complements the path-based signals, which cannot see an inline
 *   `stylex.create` edit in a component .tsx). Also runnable locally via
 *   classify-visual-pr.js for calibration.
 * @input Unified diff text (git diff <base>...<head>)
 * @output classifyVisualDiff: { score, bucket, signals, styleSurfacePaths, evidence,
 *   appearanceOnly, appearanceReasons }
 *
 * SYNC: review-signal.yml loads this file with new Function(module, exports,
 * require) — keep it dependency-free CJS with a plain module.exports object.
 *
 * Signals and weights:
 *   1. CSS-property edit (×3)   — added/removed line starting with a known CSS
 *      property + `:`. In this codebase such lines essentially only occur inside
 *      `stylex.create({...})` blocks, so one means a pixel moved.
 *   2. Design-token reference (×2) — `colorVars.accent`, `radiusVars.lg`, … —
 *      matched generically as `<something>Vars.<key>` so every token group
 *      (shadowVars, borderVars, durationVars, …) counts without a hardcoded list.
 *   3. Style-surface file (×3, per file) — any non-comment edit to `*.stylex.ts(x)`,
 *      `*.css`, or `packages/themes/<name>/src/**`. `*.markers.stylex.ts` files are
 *      excluded: they define stylex.when scoping markers, not appearance, so marker
 *      renames/refactors move no pixels (their content still counts via signals 1–2).
 *   4. JSX structural change (×1, capped at 10) — add/remove of a rendered element
 *      in a non-test `packages/**` .tsx file. Noisy (aria/VisuallyHidden wrappers),
 *      hence the low weight and cap.
 *
 * Deliberately NOT a signal: "touches a component .tsx". Many PRs edit component
 * files but change only logic/state/a11y — the classifier looks for
 * appearance-affecting content, not file paths.
 *
 * Scope: only product surfaces (packages/, apps/) are scanned. Tooling —
 * .github/, scripts/, root configs — can mention CSS-ish content (mocks,
 * fixtures, CSS generators) without moving a pixel.
 */

// CSS properties (camelCase, as written in stylex.create) that mark a line as a
// style edit. Kebab-case properties in .css files are normalized before lookup.
const CSS_PROPERTIES = new Set([
  // Layout & box model
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'insetBlock',
  'insetBlockStart',
  'insetBlockEnd',
  'insetInline',
  'insetInlineStart',
  'insetInlineEnd',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'blockSize',
  'inlineSize',
  'minBlockSize',
  'minInlineSize',
  'maxBlockSize',
  'maxInlineSize',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginBlock',
  'marginBlockStart',
  'marginBlockEnd',
  'marginInline',
  'marginInlineStart',
  'marginInlineEnd',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingBlock',
  'paddingBlockStart',
  'paddingBlockEnd',
  'paddingInline',
  'paddingInlineStart',
  'paddingInlineEnd',
  'boxSizing',
  'aspectRatio',
  'zIndex',
  'overflow',
  'overflowX',
  'overflowY',
  'overflowWrap',
  'overscrollBehavior',
  'visibility',
  'contain',
  'containerType',
  'containerName',
  'float',
  'clear',
  'objectFit',
  'objectPosition',
  // Flex & grid
  'flex',
  'flexDirection',
  'flexWrap',
  'flexFlow',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'justifyContent',
  'justifyItems',
  'justifySelf',
  'alignContent',
  'alignItems',
  'alignSelf',
  'placeContent',
  'placeItems',
  'placeSelf',
  'gap',
  'rowGap',
  'columnGap',
  'order',
  'grid',
  'gridArea',
  'gridAutoColumns',
  'gridAutoFlow',
  'gridAutoRows',
  'gridColumn',
  'gridColumnStart',
  'gridColumnEnd',
  'gridRow',
  'gridRowStart',
  'gridRowEnd',
  'gridTemplate',
  'gridTemplateAreas',
  'gridTemplateColumns',
  'gridTemplateRows',
  // Color & background
  'color',
  'background',
  'backgroundColor',
  'backgroundImage',
  'backgroundPosition',
  'backgroundRepeat',
  'backgroundSize',
  'backgroundClip',
  'backgroundAttachment',
  'backgroundBlendMode',
  'accentColor',
  'caretColor',
  'colorScheme',
  'mixBlendMode',
  'backdropFilter',
  'filter',
  // Border & outline
  'border',
  'borderTop',
  'borderRight',
  'borderBottom',
  'borderLeft',
  'borderWidth',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'borderColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderBlock',
  'borderBlockStart',
  'borderBlockEnd',
  'borderInline',
  'borderInlineStart',
  'borderInlineEnd',
  'borderInlineStartWidth',
  'borderInlineEndWidth',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'borderStartStartRadius',
  'borderStartEndRadius',
  'borderEndStartRadius',
  'borderEndEndRadius',
  'borderCollapse',
  'borderSpacing',
  'outline',
  'outlineWidth',
  'outlineStyle',
  'outlineColor',
  'outlineOffset',
  'boxShadow',
  // Typography
  'font',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'fontVariant',
  'fontVariantNumeric',
  'fontFeatureSettings',
  'fontStretch',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'textDecoration',
  'textDecorationLine',
  'textDecorationColor',
  'textDecorationStyle',
  'textDecorationThickness',
  'textUnderlineOffset',
  'textTransform',
  'textOverflow',
  'textWrap',
  'textShadow',
  'textIndent',
  'verticalAlign',
  'whiteSpace',
  'wordBreak',
  'wordSpacing',
  'hyphens',
  'lineClamp',
  'webkitLineClamp',
  'webkitBoxOrient',
  'tabSize',
  'userSelect',
  // Transform, transition & animation
  'transform',
  'transformOrigin',
  'transformStyle',
  'translate',
  'rotate',
  'scale',
  'perspective',
  'perspectiveOrigin',
  'transition',
  'transitionProperty',
  'transitionDuration',
  'transitionTimingFunction',
  'transitionDelay',
  'transitionBehavior',
  'animation',
  'animationName',
  'animationDuration',
  'animationTimingFunction',
  'animationDelay',
  'animationIterationCount',
  'animationDirection',
  'animationFillMode',
  'animationPlayState',
  'willChange',
  // Misc visual
  'opacity',
  'cursor',
  'pointerEvents',
  'resize',
  'appearance',
  'content',
  'listStyle',
  'listStyleType',
  'listStylePosition',
  'clipPath',
  'mask',
  'scrollbarWidth',
  'scrollbarGutter',
  'scrollBehavior',
  'scrollMargin',
  'scrollPadding',
  'scrollSnapType',
  'scrollSnapAlign',
  'touchAction',
  'strokeWidth',
  'stroke',
  'fill',
  'viewTransitionName',
]);

const INTERACTION_AFFECTING_STYLE_PROPERTIES = new Set([
  // Element operability and hit testing.
  'display',
  'visibility',
  'pointerEvents',
  'touchAction',
  'userSelect',
  'resize',
  'cursor',
  // Scrolling, clipping, snapping, and scrollbar affordance.
  'overflow',
  'overflowX',
  'overflowY',
  'overscrollBehavior',
  'scrollBehavior',
  'scrollMargin',
  'scrollPadding',
  'scrollSnapType',
  'scrollSnapAlign',
  'scrollbarWidth',
]);

// Values that mark a `prop: value` line as a TypeScript type member rather than
// a style declaration (e.g. `width: number;` in a Props interface).
const TYPE_ANNOTATION_VALUE =
  /^(?:string|number|boolean|void|never|unknown|any)(?:\[\])?[;,]?\s*(?:\/\/.*)?$/;

// `<something>Vars.<key>` or `<something>Vars['--key']` — matches every token
// group exported from packages/core/src/theme (colorVars, spacingVars,
// shadowVars, durationVars, …) in both dot and bracket access.
const TOKEN_REFERENCE = /\b[a-zA-Z][a-zA-Z0-9]*Vars\s*(?:\.[a-zA-Z$_]|\[)/;

// Opening or closing tag of a rendered element at line start. Fragments (`<>`,
// `</>`) render nothing and are excluded.
const JSX_TAG = /^<\/?[a-zA-Z][\w.]*(?:[\s/>]|$)/;

const WEIGHTS = {
  cssProperties: 3,
  tokenReferences: 2,
  styleSurfaceFiles: 3,
  jsxStructuralChanges: 1,
};
const JSX_CAP = 10;
const MAX_EVIDENCE_PER_SIGNAL = 5;

// Only product surfaces can change rendered appearance.
function isProductFile(file) {
  return /^(?:packages|apps)\//.test(file);
}

// Files whose diff content is never scanned (tests, docs, snapshots, generated).
// `.test[.-]` covers colocated tests and test fixtures alike (Button.test.tsx,
// Badge.test-violations.tsx — the ESLint-plugin fixture full of intentional
// style violations).
function isIgnoredFile(file) {
  return (
    /\.test[.-]/.test(file) ||
    /\.stories\.[jt]sx?$/.test(file) ||
    /\.doc\.mjs$/.test(file) ||
    /\.md$/.test(file) ||
    /\.snap$/.test(file) ||
    /(^|\/)__snapshots__\//.test(file) ||
    /(^|\/)__tests__\//.test(file)
  );
}

// Only these file types get line-level scanning — keeps YAML/JSON keys like
// `width:` in configs from matching the CSS-property signal.
function isScannableFile(file) {
  return /\.(?:tsx?|jsx?|mjs|css)$/.test(file);
}

function isStyleSurfaceFile(file) {
  if (/\.markers\.stylex\.tsx?$/.test(file)) return false;
  return (
    /\.stylex\.tsx?$/.test(file) ||
    /\.css$/.test(file) ||
    /^packages\/themes\/[^/]+\/src\/.+\.tsx?$/.test(file)
  );
}

function isCoreRuntimeFile(file) {
  return (
    /^packages\/core\/src\/.+\.tsx?$/.test(file) &&
    !/\.test\.tsx?$/.test(file) &&
    !/\.stories\.tsx?$/.test(file)
  );
}

function isPublicApiPath(file) {
  return (
    /^packages\/[^/]+\/package\.json$/.test(file) ||
    /^packages\/[^/]+\/src\/(?:.+\/)?index\.tsx?$/.test(file)
  );
}

function isHarmlessStylePunctuation(content) {
  return /^[{}()[\],;]+$/.test(content);
}

const SAFE_STYLE_TOKEN_ROOTS = new Set([
  'borderVars',
  'colorVars',
  'durationVars',
  'easeVars',
  'focusVars',
  'fontWeightVars',
  'radiusVars',
  'shadowVars',
  'sizeVars',
  'spacingVars',
  'textSizeVars',
  'typeScaleVars',
  'typographyVars',
]);

function isSafeStyleValue(value) {
  const trimmed = value.replace(/,\s*$/, '').trim();
  if (/^(?:true|false|null|undefined)$/.test(trimmed)) return true;
  if (/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[a-zA-Z%]+)?$/.test(trimmed)) {
    return true;
  }
  if (/^'(?:\\.|[^'\\])*'$/.test(trimmed)) return true;
  if (/^"(?:\\.|[^"\\])*"$/.test(trimmed)) return true;
  if (/^[A-Z][A-Z0-9_]*$/.test(trimmed)) return true;
  const token = trimmed.match(
    /^([A-Za-z_$][\w$]*Vars)(?:(?:\.[A-Za-z_$][\w$]*)|(?:\[['"][^'"\r\n]+['"]\]))+$/,
  );
  return token !== null && SAFE_STYLE_TOKEN_ROOTS.has(token[1]);
}

function isSafeStyleDeclarationLine(content, file) {
  if (!isCssPropertyLine(content, file)) return false;
  const match = content.match(/^[a-zA-Z][a-zA-Z0-9]*\s*:\s*(.+)$/);
  return match !== null && isSafeStyleValue(match[1]);
}

function scanStylexStructureLine(line, state, startIndex = 0) {
  let code = '';
  let unsafeSlash = false;
  for (let index = startIndex; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (state.blockComment) {
      if (character === '*' && next === '/') {
        state.blockComment = false;
        code += '  ';
        index += 1;
      } else {
        code += ' ';
      }
      continue;
    }
    if (state.quote) {
      code += ' ';
      if (state.escaped) {
        state.escaped = false;
      } else if (character === '\\') {
        state.escaped = true;
      } else if (character === state.quote) {
        state.quote = null;
      }
      continue;
    }
    if (character === '/' && next === '/') {
      code += ' '.repeat(line.length - index);
      break;
    }
    if (character === '/' && next === '*') {
      state.blockComment = true;
      code += '  ';
      index += 1;
      continue;
    }
    if (character === '/' && next !== '/' && next !== '*') {
      unsafeSlash = true;
    }
    if (character === "'" || character === '"' || character === '`') {
      state.quote = character;
      state.escaped = false;
      code += ' ';
      continue;
    }
    code += character;
  }
  return {code, unsafeSlash};
}

function hasCanonicalStylexImport(source) {
  const state = {blockComment: false, escaped: false, quote: null};
  for (const line of source.split(/\r?\n/)) {
    const startsInCode = !state.blockComment && state.quote === null;
    const isCanonicalImport =
      startsInCode &&
      /^\s*import\s+\*\s+as\s+stylex\s+from\s+['"]@stylexjs\/stylex['"]\s*;?\s*$/.test(
        line,
      );
    scanStylexStructureLine(line, state);
    if (isCanonicalImport) return true;
  }
  return false;
}

function stylexCreateLineNumbers(source) {
  if (typeof source !== 'string' || !hasCanonicalStylexImport(source)) {
    return new Set();
  }
  const lines = source.split(/\r?\n/);
  const lexicalState = {blockComment: false, escaped: false, quote: null};
  const codeLines = lines.map(line => {
    const startsInCode =
      !lexicalState.blockComment && lexicalState.quote === null;
    const scanned = scanStylexStructureLine(line, lexicalState);
    return startsInCode ? scanned.code : '';
  });
  const covered = new Set();
  const opener =
    /^\s*(?:(?:export\s+)?const\s+[A-Za-z_$][\w$]*\s*=\s*)?stylex\.create\s*\(\s*\{\s*$/;

  for (let start = 0; start < lines.length; start += 1) {
    if (!opener.test(codeLines[start])) continue;
    const state = {blockComment: false, escaped: false, quote: null};
    let depth = 0;
    let unsafe = false;
    let end = null;
    for (let lineIndex = start; lineIndex < lines.length; lineIndex += 1) {
      const scanned = scanStylexStructureLine(lines[lineIndex], state);
      unsafe ||= scanned.unsafeSlash;
      for (let index = 0; index < scanned.code.length; index += 1) {
        const character = scanned.code[index];
        if (character === '{') depth += 1;
        if (character !== '}') continue;
        depth -= 1;
        if (depth !== 0) continue;
        const remainder = scanned.code.slice(index + 1);
        if (!/^\s*\)\s*;?\s*$/.test(remainder)) unsafe = true;
        end = lineIndex;
        break;
      }
      if (end !== null || unsafe) break;
    }
    if (end === null || unsafe || state.blockComment || state.quote) continue;
    for (let lineIndex = start; lineIndex <= end; lineIndex += 1) {
      covered.add(lineIndex + 1);
    }
    start = end;
  }
  return covered;
}

function sourceProofFor(sources, file, side) {
  const source = sources?.[file]?.[side];
  if (typeof source !== 'string') return null;
  return {
    lines: source.split(/\r?\n/),
    stylexLines: stylexCreateLineNumbers(source),
  };
}

function isVisualEvidenceFile(file) {
  return /\.(?:png|jpe?g|gif|webp|svg)$/.test(file);
}

// kebab-case → camelCase for properties in plain .css files
function toCamelCase(prop) {
  return prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function isCssPropertyLine(content, file) {
  if (/\.css$/.test(file)) {
    // Custom property definitions (`--brand-accent: …`) are visual by definition.
    if (/^--[\w-]+\s*:/.test(content)) return true;
    const match = content.match(/^([a-z][a-z-]*)\s*:/);
    return match !== null && CSS_PROPERTIES.has(toCamelCase(match[1]));
  }
  const match = content.match(/^([a-zA-Z][a-zA-Z0-9]*)\s*:\s*(.*)$/);
  if (!match || !CSS_PROPERTIES.has(match[1])) return false;
  // `width: number;` in a Props type is not a style edit.
  return !TYPE_ANNOTATION_VALUE.test(match[2]);
}

function isCommentLine(content) {
  return (
    content.startsWith('//') ||
    content.startsWith('/*') ||
    content.startsWith('*')
  );
}

// Advance the block-comment state across one line. Returns [wasInside,
// nowInside]: whether the line began inside a `/* … */` comment, and the state
// after consuming it. Best-effort — does not understand string literals.
function advanceBlockComment(content, inside) {
  const wasInside = inside;
  // A line comment consumes the rest of the line — `/*` after `//` is inert.
  if (!inside && content.startsWith('//')) return [false, false];
  let i = 0;
  while (i < content.length) {
    if (inside) {
      const close = content.indexOf('*/', i);
      if (close === -1) return [wasInside, true];
      inside = false;
      i = close + 2;
    } else {
      const open = content.indexOf('/*', i);
      if (open === -1) return [wasInside, false];
      inside = true;
      i = open + 2;
    }
  }
  return [wasInside, inside];
}

/**
 * Classify a unified diff as visual / likely-visual / maybe-visual / non-visual.
 *
 * @param {string} diffText - output of `git diff <base>...<head>`
 * @param {{ignorePath?: (file: string) => boolean, sources?: Record<string, {base: string, head: string}>}} [opts] - `ignorePath`
 *   excludes additional paths beyond the built-in rules (e.g. review-signal
 *   passes its safe-space predicate so lab/sandbox/storybook never count).
 *   `sources` provides trusted base/head bytes used for appearance-only proof.
 * @returns {{
 *   score: number,
 *   bucket: 'visual'|'likely-visual'|'maybe-visual'|'non-visual',
 *   signals: {cssProperties: number, tokenReferences: number, styleSurfaceFiles: number, jsxStructuralChanges: number},
 *   styleSurfacePaths: string[],
 *   evidence: {cssProperties: Array<{file: string, line: string}>, tokenReferences: Array<{file: string, line: string}>, jsxStructuralChanges: Array<{file: string, line: string}>},
 *   appearanceOnly: boolean,
 *   appearanceReasons: string[],
 * }}
 */
function classifyVisualDiff(diffText, opts = {}) {
  const ignorePath =
    typeof opts.ignorePath === 'function' ? opts.ignorePath : null;
  const sources =
    opts.sources != null && typeof opts.sources === 'object'
      ? opts.sources
      : {};
  const signals = {
    cssProperties: 0,
    tokenReferences: 0,
    styleSurfaceFiles: 0,
    jsxStructuralChanges: 0,
  };
  const evidence = {
    cssProperties: [],
    tokenReferences: [],
    jsxStructuralChanges: [],
  };
  const styleSurfacePaths = [];
  const touchedStyleSurfaces = new Set();
  const appearanceReasons = new Set();
  const appearancePunctuation = {added: new Map(), removed: new Map()};
  let sawCoreRuntime = false;
  let sawAppearanceDeclaration = false;

  const rejectAppearance = reason => appearanceReasons.add(reason);
  const countPunctuation = (side, file, content) => {
    const key = `${file}\0${content}`;
    appearancePunctuation[side].set(
      key,
      (appearancePunctuation[side].get(key) ?? 0) + 1,
    );
  };

  let currentFile = null;
  let currentOldPath = null;
  let oldLineNumber = null;
  let newLineNumber = null;
  let sawHunk = false;
  const sourceProofCache = new Map();
  // Block-comment state per diff side: a `-` line opening a comment must not
  // silence subsequent `+` lines. Context lines advance both sides. State
  // resets at file and hunk boundaries — a hunk can start mid-comment we never
  // saw, which the tracker accepts rather than guessing (cf. the cross-hunk
  // brace-tracking failure noted in #3667).
  const inComment = {added: false, removed: false};

  const addEvidence = (signal, content) => {
    if (evidence[signal].length < MAX_EVIDENCE_PER_SIGNAL) {
      evidence[signal].push({file: currentFile, line: content.slice(0, 120)});
    }
  };

  const diffLines = (diffText || '').split('\n');
  for (let lineIndex = 0; lineIndex < diffLines.length; lineIndex += 1) {
    const line = diffLines[lineIndex];
    // File boundary — `diff --git a/<old> b/<new>`; the b-side names the file
    // for adds/renames, and still identifies deleted style files.
    const fileMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (fileMatch) {
      const oldPath = fileMatch[1];
      const newPath = fileMatch[2];
      currentOldPath = oldPath;
      currentFile = newPath;
      oldLineNumber = null;
      newLineNumber = null;
      sawHunk = false;
      inComment.added = false;
      inComment.removed = false;
      if (oldPath !== newPath) rejectAppearance('renamed path');
      if (isPublicApiPath(oldPath) || isPublicApiPath(newPath)) {
        rejectAppearance('public API or package path');
      }
      for (const candidate of [oldPath, newPath]) {
        if (ignorePath && ignorePath(candidate)) continue;
        if (
          !isCoreRuntimeFile(candidate) &&
          !isIgnoredFile(candidate) &&
          !isVisualEvidenceFile(candidate)
        ) {
          rejectAppearance('unknown runtime path');
        }
      }
      continue;
    }
    if (currentFile === null) continue;
    if (/^(?:new|deleted) file mode\s/.test(line)) {
      if (isCoreRuntimeFile(currentFile)) {
        rejectAppearance('new or deleted Core runtime file');
      }
      continue;
    }
    if (/^rename (?:from|to)\s/.test(line)) {
      rejectAppearance('renamed path');
      continue;
    }
    if (!isProductFile(currentFile)) continue;
    if (ignorePath && ignorePath(currentFile)) continue;
    if (isIgnoredFile(currentFile) || !isScannableFile(currentFile)) continue;

    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      sawHunk = true;
      inComment.added = false;
      inComment.removed = false;
      oldLineNumber = Number(hunk[1]);
      newLineNumber = Number(hunk[2]);
      continue;
    }
    if (
      !sawHunk &&
      (line === `--- a/${currentOldPath}` ||
        line === `+++ b/${currentFile}` ||
        line === '--- /dev/null' ||
        line === '+++ /dev/null')
    ) {
      continue;
    }

    // Context lines advance the comment state and both source positions.
    if (!/^[+-]/.test(line)) {
      if (line.startsWith(' ')) {
        const context = line.slice(1).trim();
        [, inComment.added] = advanceBlockComment(context, inComment.added);
        [, inComment.removed] = advanceBlockComment(context, inComment.removed);
        if (oldLineNumber !== null) oldLineNumber += 1;
        if (newLineNumber !== null) newLineNumber += 1;
      }
      continue;
    }

    const side = line[0] === '+' ? 'added' : 'removed';
    const sourceSide = side === 'added' ? 'head' : 'base';
    const sourcePath = side === 'added' ? currentFile : currentOldPath;
    const lineNumber = side === 'added' ? newLineNumber : oldLineNumber;
    const rawContent = line.slice(1);
    const content = rawContent.trim();
    if (side === 'added' && newLineNumber !== null) newLineNumber += 1;
    if (side === 'removed' && oldLineNumber !== null) oldLineNumber += 1;
    const [wasInsideComment, nowInsideComment] = advanceBlockComment(
      content,
      inComment[side],
    );
    inComment[side] = nowInsideComment;

    if (isCoreRuntimeFile(currentFile)) {
      sawCoreRuntime = true;
      const cacheKey = `${sourcePath}\0${sourceSide}`;
      if (!sourceProofCache.has(cacheKey)) {
        sourceProofCache.set(
          cacheKey,
          sourceProofFor(sources, sourcePath, sourceSide),
        );
      }
      const proof = sourceProofCache.get(cacheKey);
      const sourceMatches =
        proof !== null &&
        Number.isInteger(lineNumber) &&
        proof.lines[lineNumber - 1] === rawContent;
      const insideStylex = sourceMatches && proof.stylexLines.has(lineNumber);
      if (!insideStylex) {
        rejectAppearance(
          'changed line lacks source-backed stylex.create proof',
        );
      } else if (content === '') {
        // Whitespace-only changes inside a proven style object are harmless.
      } else if (wasInsideComment || isCommentLine(content)) {
        rejectAppearance('changed Core runtime comment');
      } else if (JSX_TAG.test(content)) {
        rejectAppearance('JSX structure');
      } else if (
        INTERACTION_AFFECTING_STYLE_PROPERTIES.has(
          content.match(/^([a-zA-Z][a-zA-Z0-9]*)\s*:/)?.[1],
        )
      ) {
        rejectAppearance('interaction-affecting style property');
      } else if (isSafeStyleDeclarationLine(content, currentFile)) {
        sawAppearanceDeclaration = true;
      } else if (isHarmlessStylePunctuation(content)) {
        countPunctuation(side, currentFile, content);
      } else {
        rejectAppearance('non-style Core runtime line');
      }
    }

    if (content === '' || wasInsideComment || isCommentLine(content)) continue;

    if (
      isStyleSurfaceFile(currentFile) &&
      !touchedStyleSurfaces.has(currentFile)
    ) {
      touchedStyleSurfaces.add(currentFile);
      styleSurfacePaths.push(currentFile);
      signals.styleSurfaceFiles++;
    }

    if (isCssPropertyLine(content, currentFile)) {
      signals.cssProperties++;
      addEvidence('cssProperties', content);
    }

    if (TOKEN_REFERENCE.test(content)) {
      signals.tokenReferences++;
      addEvidence('tokenReferences', content);
    }

    if (
      /^packages\//.test(currentFile) &&
      /\.tsx$/.test(currentFile) &&
      JSX_TAG.test(content)
    ) {
      signals.jsxStructuralChanges++;
      addEvidence('jsxStructuralChanges', content);
    }
  }

  const score =
    signals.cssProperties * WEIGHTS.cssProperties +
    signals.tokenReferences * WEIGHTS.tokenReferences +
    signals.styleSurfaceFiles * WEIGHTS.styleSurfaceFiles +
    Math.min(signals.jsxStructuralChanges, JSX_CAP) *
      WEIGHTS.jsxStructuralChanges;

  let bucket;
  if (score >= 12) bucket = 'visual';
  else if (score >= 5) bucket = 'likely-visual';
  else if (score >= 2) bucket = 'maybe-visual';
  else bucket = 'non-visual';

  for (const side of ['added', 'removed']) {
    for (const [key, count] of appearancePunctuation[side]) {
      const other = side === 'added' ? 'removed' : 'added';
      if (appearancePunctuation[other].get(key) !== count) {
        rejectAppearance('unbalanced style punctuation');
      }
    }
  }
  if (!sawCoreRuntime) rejectAppearance('no Core runtime change');
  if (!sawAppearanceDeclaration) {
    rejectAppearance('no recognized visual declaration');
  }
  const appearanceOnly = appearanceReasons.size === 0;

  return {
    score,
    bucket,
    signals,
    styleSurfacePaths,
    evidence,
    appearanceOnly,
    appearanceReasons: [...appearanceReasons],
  };
}

module.exports = {classifyVisualDiff, WEIGHTS, JSX_CAP};
