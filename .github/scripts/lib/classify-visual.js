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
 *   appearanceOnly, appearanceReasons }; styleContextPaths: the file
 *   revisions the style-context test needs; styleContextLines
 *
 * SYNC: review-signal.yml loads this file with new Function(module, exports,
 * require) — keep it dependency-free CJS with a plain module.exports object.
 *
 * Signals and weights:
 *   1. CSS-property edit (×3)   — added/removed line starting with a known CSS
 *      property + `:` that sits in a style context of its file at that line's
 *      revision (styleContextLines: stylex style calls, themes, Web Animations,
 *      `Object.assign(el.style, …)`, style attributes and properties, and the
 *      named objects and functions they read). Given the file's bytes
 *      (`styleSources`), a data object such as a route's `{content: […]}`
 *      moves no pixel; without them the line counts as before.
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

// Calls whose arguments are style. `stylex.<name>(...)`: style objects, theme
// and variable values, keyframes, position fallbacks, view transitions.
const STYLEX_STYLE_CALLS = new Set([
  'create',
  'createTheme',
  'defineConsts',
  'defineVars',
  'keyframes',
  'positionTry',
  'viewTransitionClass',
]);
// A bare call: an Astryx theme and its code-syntax colors.
const THEME_CALLS = new Set(['defineTheme', 'defineSyntaxTheme']);
// A method call whose arguments are motion values: Web Animations keyframes
// and timing (`element.animate(...)`), and the motion system's targets
// (`handle.play({opacity: ...})`).
const STYLE_METHOD_CALLS = new Set(['animate', 'play']);
// A JSX attribute or an object property whose value is style: `style`,
// `xstyle`, and a named style slot such as `contentStyle` or `labelStyle`.
const STYLE_NAME = /^(?:x?style|[a-z][A-Za-z0-9]*Style)$/;
// A type that marks an object as style, in an annotation, `as` or `satisfies`.
const STYLE_TYPE =
  /\b(?:CSSProperties|StyleXStyles|StyleXStylesWithout|StyleXArray|CSSStyleDeclaration)\b/;
// After one of these tokens, `/` starts a regular expression and `<` may open
// JSX; after any other token they are operators.
const EXPRESSION_START = new Set([
  '',
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '<',
  '>',
  '~',
  '^',
  '=>',
  'return',
  'typeof',
  'case',
  'do',
  'else',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'yield',
  'await',
]);

/**
 * The 1-based lines of `source` that sit in a style context, decided by
 * reading the file's syntax, never a value's shape:
 *
 * - the arguments of `stylex.create(...)` and the other stylex style calls,
 *   of `defineTheme(...)` and `defineSyntaxTheme(...)`, of
 *   `element.animate(...)` and the motion system's `handle.play(...)`, and of
 *   a `stylex.create` dynamic style (`sheet.size(width)`);
 * - the objects after the first argument of `Object.assign(<x>.style, ...)`;
 * - a spread onto an intrinsic JSX element (`<svg {...svgProps}>`);
 * - the value of a JSX `style`, `xstyle` or `<name>Style` attribute, and of
 *   an object property with such a name;
 * - an object or function body bound to a name whose type, `as` or
 *   `satisfies` names a style type (`CSSProperties`, `StyleXStyles`, ...), or
 *   whose name is read inside another style context of the file; a name
 *   bound to a call's result passes that on to the function it calls.
 *
 * Not a style context: an object, named or inline, on a component prop whose
 * name is not style-named (a chart's `tick={...}`), and style values a helper
 * returns to another file.
 *
 * A small lexer reads the file, comments, strings, template literals, regular
 * expressions, type parameters and JSX text included, so a quote in JSX text
 * or a brace in a string moves no boundary. Returns null when the file does
 * not lex cleanly (an unclosed string, comment, bracket or tag), so the caller
 * can fall back.
 *
 * @param {string} source
 * @param {boolean} jsx whether the file may hold JSX (any file but .ts)
 * @returns {Set<number> | null}
 */
function styleContextLines(source, jsx) {
  const covered = new Set();
  const length = source.length;
  let line = 1;
  // Each frame: {kind, close, ...}. kind is 'code' (a bracket in code),
  // 'template' (`${` inside a template literal), 'tag' (inside a JSX tag),
  // 'children' (between a JSX tag and its close).
  const stack = [];
  // Open style contexts, each ending with the frame at its depth.
  const contexts = [];
  // Objects and function bodies bound to a name: {name, from, to, typed}.
  const bindings = [];
  // Names bound to a call's result (`const sizing = resolveSizing(...)`):
  // using the name as style uses what that function returns.
  const callResults = [];
  // Names bound to `stylex.create(...)`: calling one of its dynamic styles
  // (`sheet.size(width)`) takes style values.
  const styleSheets = new Set();
  // Each identifier read in code, with its line.
  const references = [];
  // Lines where a style-named property takes a bare value (`style: base`):
  // a name read there is used as style.
  const styleValueLines = new Set();
  // The tokens read so far: the last one, and the words before a `(`.
  let last = '';
  const words = [];
  let pendingAttribute = false;
  let pendingProperty = false;
  // A declaration in progress: `const <name> [: type] = {`.
  let declaration = null;
  // A function in progress, `function <name>(...)` or
  // `const <name> = (...) =>`, until its body opens.
  let pendingFunction = null;

  // The words a call's style test reads: the last few are enough.
  const pushWord = word => {
    words.push(word);
    if (words.length > 4) words.shift();
  };
  // Covered lines are skipped in one step: `nextOpen` points from a covered
  // line to the next line that may not be, compressed as it is followed, so
  // marking a range costs its uncovered lines and nothing for lines already
  // covered, however ranges nest or repeat.
  const nextOpen = new Map();
  const firstOpen = at => {
    let end = at;
    while (nextOpen.has(end)) end = nextOpen.get(end);
    while (nextOpen.has(at) && nextOpen.get(at) !== end) {
      const after = nextOpen.get(at);
      nextOpen.set(at, end);
      at = after;
    }
    return end;
  };
  const markLines = (from, to, onLine) => {
    for (let at = firstOpen(from); at <= to; at = firstOpen(at)) {
      covered.add(at);
      nextOpen.set(at, at + 1);
      if (onLine) onLine(at);
    }
  };
  const top = () => stack[stack.length - 1];
  const countLines = (from, to) => {
    for (let at = from; at < to; at += 1) {
      if (source[at] === '\n') line += 1;
    }
  };

  // Skips a quoted string starting at `index`; returns the index after it.
  // A template literal stops at `${`, with a frame for its expression.
  const skipString = (index, quote) => {
    for (let at = index + 1; at < length; at += 1) {
      const character = source[at];
      if (character === '\\') {
        at += 1;
        if (source[at] === '\n') line += 1;
        continue;
      }
      if (character === '\n') {
        if (quote !== '`') return -1;
        line += 1;
      }
      if (character === quote) return at + 1;
      if (quote === '`' && character === '$' && source[at + 1] === '{') {
        stack.push({kind: 'template', close: '}'});
        last = '{';
        return at + 2;
      }
    }
    return -1;
  };
  const skipRegex = index => {
    let inClass = false;
    for (let at = index + 1; at < length; at += 1) {
      const character = source[at];
      if (character === '\n') return -1;
      if (character === '\\') {
        at += 1;
        continue;
      }
      if (character === '[') inClass = true;
      else if (character === ']') inClass = false;
      else if (character === '/' && !inClass) {
        at += 1;
        while (at < length && /[a-z]/i.test(source[at])) at += 1;
        return at;
      }
    }
    return -1;
  };
  // Skips an angle-bracketed type list from `index`; returns the index after
  // its `>`, or -1.
  const skipAngles = index => {
    let depth = 0;
    for (let at = index; at < length; at += 1) {
      const character = source[at];
      if (character === '\n') line += 1;
      if (character === '<') depth += 1;
      if (character === '>' && source[at - 1] !== '=') depth -= 1;
      if (depth === 0) return at + 1;
    }
    return -1;
  };

  const startContext = () => contexts.push({depth: stack.length - 1, line});
  const open = (frame, startsStyle) => {
    stack.push(frame);
    if (startsStyle) startContext();
  };
  const close = closer => {
    const frame = stack.pop();
    if (frame == null || frame.close !== closer) return false;
    const context = contexts[contexts.length - 1];
    if (context != null && context.depth === stack.length) {
      contexts.pop();
      markLines(context.line, line);
    }
    if (frame.binding != null) {
      bindings.push({...frame.binding, to: line});
    }
    return true;
  };
  // Whether the call about to open takes style arguments, from the words
  // read before its `(`.
  const styleCall = () => {
    const [a, b, c] = words.slice(-3);
    if (b === '.' && a === 'stylex' && STYLEX_STYLE_CALLS.has(c)) return 'all';
    if (THEME_CALLS.has(c) && b !== '.') return 'all';
    if (b === '.' && STYLE_METHOD_CALLS.has(c)) return 'all';
    if (a === 'Object' && b === '.' && c === 'assign') return 'assign';
    if (b === '.' && styleSheets.has(a)) return 'all';
    return null;
  };

  let index = 0;
  while (index < length) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '\n') {
      line += 1;
      index += 1;
      continue;
    }

    // JSX text: only `{`, `<` and newlines matter; quotes are text.
    if (top()?.kind === 'children') {
      if (character === '{') {
        open({kind: 'code', close: '}'}, false);
        last = '{';
        index += 1;
      } else if (character === '<' && next === '/') {
        // A closing tag ends these children.
        const end = source.indexOf('>', index);
        if (end === -1) return null;
        countLines(index, end);
        stack.pop();
        last = ')';
        index = end + 1;
      } else if (character === '<') {
        open(
          {kind: 'tag', close: '>', intrinsic: /[a-z]/.test(next ?? '')},
          false,
        );
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      index = end === -1 ? length : end;
      continue;
    }
    if (character === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end === -1) return null;
      countLines(index, end);
      index = end + 2;
      continue;
    }

    // Inside a JSX tag: names, type arguments, strings, `{...}`, `>`, `/>`.
    if (top()?.kind === 'tag') {
      if (character === '"' || character === "'") {
        const end = skipString(index, character);
        if (end === -1) return null;
        index = end;
      } else if (character === '{') {
        // A spread onto an intrinsic element (`<svg {...svgProps}>`) sets
        // its presentation attributes.
        const spread =
          top().intrinsic &&
          /^\{\s*\.\.\./.test(source.slice(index, index + 8));
        open({kind: 'code', close: '}'}, pendingAttribute || spread);
        pendingAttribute = false;
        last = '{';
        index += 1;
      } else if (character === '<') {
        // Type arguments of a generic component, `<Table<Row> ...>`.
        const end = skipAngles(index);
        if (end === -1) return null;
        index = end;
      } else if (character === '/' && next === '>') {
        stack.pop();
        last = ')';
        index += 2;
      } else if (character === '>') {
        stack.pop();
        stack.push({kind: 'children', close: '<'});
        index += 1;
      } else if (/[A-Za-z_$]/.test(character)) {
        let end = index + 1;
        while (end < length && /[\w$.:-]/.test(source[end])) end += 1;
        let at = end;
        while (at < length && /[ \t]/.test(source[at])) at += 1;
        pendingAttribute =
          STYLE_NAME.test(source.slice(index, end)) && source[at] === '=';
        index = end;
      } else {
        index += 1;
      }
      continue;
    }

    if (character === '"' || character === "'" || character === '`') {
      const depth = stack.length;
      const end = skipString(index, character);
      if (end === -1) return null;
      index = end;
      // A template literal that stopped at `${` goes on as code.
      if (stack.length === depth) last = 'value';
      pushWord('value');
      continue;
    }
    if (character === '/' && EXPRESSION_START.has(last)) {
      const end = skipRegex(index);
      if (end === -1) return null;
      index = end;
      last = 'value';
      pushWord('value');
      continue;
    }
    // A generic arrow's type parameters (`<T,>(` or `<T extends U>(`), as
    // TypeScript tells them from a tag.
    if (
      character === '<' &&
      EXPRESSION_START.has(last) &&
      /^<\s*[A-Za-z_$][\w$]*\s*(?:,|extends\b)/.test(
        source.slice(index, index + 80),
      )
    ) {
      const end = skipAngles(index);
      if (end === -1) return null;
      index = end;
      continue;
    }
    if (
      jsx &&
      character === '<' &&
      EXPRESSION_START.has(last) &&
      (/[A-Za-z_$]/.test(next ?? '') || next === '>')
    ) {
      if (next === '>') {
        // A fragment: its children start at once.
        stack.push({kind: 'children', close: '<'});
        index += 2;
      } else {
        open({kind: 'tag', close: '>', intrinsic: /[a-z]/.test(next)}, false);
        index += 1;
      }
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      let end = index + 1;
      while (end < length && /[\w$]/.test(source[end])) end += 1;
      const word = source.slice(index, end);
      let after = end;
      while (after < length && /[ \t]/.test(source[after])) after += 1;
      if (last !== '.') references.push({name: word, line});
      // A style-named property: `style: {...}` or `labelStyle: base`.
      if (STYLE_NAME.test(word) && source[after] === ':' && last !== '.') {
        pendingProperty = true;
        styleValueLines.add(line);
      }
      // `as` or `satisfies` a style type marks the object just closed.
      if ((word === 'as' || word === 'satisfies') && bindings.length > 0) {
        const typed = source.slice(end, end + 120).match(/^\s*([\w$.<>]+)/);
        const binding = bindings[bindings.length - 1];
        if (typed && STYLE_TYPE.test(typed[1]) && binding.to === line) {
          binding.typed = true;
        }
      }
      if (word === 'const' || word === 'let' || word === 'var') {
        const named = source
          .slice(end, end + 400)
          .match(/^\s+([A-Za-z_$][\w$]*)\s*(?::([^=;]*))?=\s*\{/);
        declaration = named
          ? {name: named[1], typed: STYLE_TYPE.test(named[2] ?? '')}
          : null;
        const result = source.slice(end, end + 400).match(
          // The window is at most 400 characters and the pattern has no
          // nested repetition, so a declaration costs a bounded amount
          // whatever the match tries.
          /^\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]*)?=\s*(?:[^\s;=?][^;=?]*\?[^;:]*:\s*)?(stylex\s*\.\s*create|[A-Za-z_$][\w$]*)\s*\(/,
        );
        if (result && /^stylex/.test(result[2])) styleSheets.add(result[1]);
        else if (result)
          callResults.push({name: result[1], calls: result[2], line});
        const arrow = source
          .slice(end, end + 400)
          .match(/^\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]*)?=\s*(?:async\s*)?\(/);
        if (arrow) {
          pendingFunction = {name: arrow[1], depth: stack.length, arrow: true};
        }
      }
      if (word === 'function') {
        const named = source
          .slice(end, end + 200)
          .match(/^\s*\*?\s*([A-Za-z_$][\w$]*)/);
        if (named) {
          pendingFunction = {name: named[1], depth: stack.length, arrow: false};
        }
      }
      pushWord(word);
      last = EXPRESSION_START.has(word) ? word : 'value';
      index = end;
      continue;
    }
    if (/[0-9]/.test(character)) {
      let end = index + 1;
      while (end < length && /[\w.]/.test(source[end])) end += 1;
      index = end;
      last = 'value';
      pushWord('value');
      continue;
    }
    if (character === '(') {
      const kind = styleCall();
      const frame = {kind: 'code', close: ')', assign: kind === 'assign'};
      if (pendingFunction?.ready && pendingFunction.depth === stack.length) {
        // An arrow whose body is a parenthesized expression, `=> ({...})`.
        frame.binding = {name: pendingFunction.name, from: line, typed: false};
        pendingFunction = null;
      }
      open(frame, kind === 'all');
      last = '(';
      pushWord('(');
      index += 1;
      continue;
    }
    if (character === '{' || character === '[') {
      const frame = {kind: 'code', close: character === '{' ? '}' : ']'};
      if (character === '{' && declaration != null && last === '=') {
        frame.binding = {
          name: declaration.name,
          from: line,
          typed: declaration.typed,
        };
      } else if (
        character === '{' &&
        pendingFunction?.ready &&
        pendingFunction.depth === stack.length
      ) {
        // A function's body: what it returns is read where it is called.
        frame.binding = {name: pendingFunction.name, from: line, typed: false};
        pendingFunction = null;
      }
      declaration = null;
      open(frame, pendingProperty && (last === ':' || last === '('));
      pendingProperty = false;
      last = character;
      pushWord(character);
      index += 1;
      continue;
    }
    if (character === ')' || character === ']' || character === '}') {
      if (top()?.kind === 'template' && character === '}') {
        stack.pop();
        // The template literal goes on after its `${...}`.
        const depth = stack.length;
        const end = skipString(index, '`');
        if (end === -1) return null;
        index = end;
        if (stack.length === depth) last = 'value';
        continue;
      }
      if (!close(character)) return null;
      if (
        character === ')' &&
        pendingFunction != null &&
        !pendingFunction.arrow &&
        pendingFunction.depth === stack.length
      ) {
        pendingFunction.ready = true;
      }
      last = character === '}' ? '}' : 'value';
      pushWord('value');
      index += 1;
      continue;
    }
    // `Object.assign(<x>.style, ...)`: the arguments after the first.
    if (
      character === ',' &&
      top()?.assign &&
      !top().assigned &&
      /\.style$/.test(words.slice(-3).join(''))
    ) {
      top().assigned = true;
      startContext();
    }
    // A spread starts an expression; its name is read, not a member.
    if (source.startsWith('...', index)) {
      last = ',';
      pushWord(',');
      index += 3;
      continue;
    }
    if (character === ';' && pendingFunction?.depth === stack.length) {
      pendingFunction = null;
    }
    if (character === '=' && next === '>') {
      if (pendingFunction?.arrow && pendingFunction.depth === stack.length) {
        pendingFunction.ready = true;
      }
      last = '=>';
      index += 2;
      continue;
    }
    if (character !== ':' && character !== ' ') pendingProperty = false;
    last = character;
    pushWord(character);
    index += 1;
  }
  if (stack.length > 0 || contexts.length > 0) return null;

  // A named object or function is style when its type says so, or when its
  // name is read as style outside its own lines (inside another style
  // context, or as a style property's value); a name bound to a call's
  // result passes that on to the function it calls. Marking one can mark
  // another that it reads. Per name, the lowest and highest line it is read
  // as style decide every binding of it at once (`min < from || max > to`),
  // and its unmarked bindings wait in two lists sorted by `from` and by
  // `to`, so each binding is marked or passed over once, and a line is
  // marked once however many ranges hold it (markLines): the marking takes
  // time near linear in the file.
  const namesAt = new Map();
  const byName = new Map();
  const stateOf = name => {
    let state = byName.get(name);
    if (state == null) {
      state = {
        min: Infinity,
        max: -Infinity,
        waiting: [],
        byFrom: [],
        byTo: [],
      };
      byName.set(name, state);
    }
    return state;
  };
  for (const {name, line: at} of references) {
    if (!namesAt.has(at)) namesAt.set(at, new Set());
    namesAt.get(at).add(name);
    if (covered.has(at) || styleValueLines.has(at)) {
      const state = stateOf(name);
      state.min = Math.min(state.min, at);
      state.max = Math.max(state.max, at);
    }
  }
  const bindingsOf = new Map();
  for (const binding of bindings) {
    if (!bindingsOf.has(binding.name)) bindingsOf.set(binding.name, []);
    bindingsOf.get(binding.name).push(binding);
    stateOf(binding.name).waiting.push(binding);
  }
  // A call result waits like a binding of its name over its own line; when
  // it is used as style, the function it calls is marked.
  for (const result of callResults) {
    stateOf(result.name).waiting.push({
      from: result.line,
      to: result.line,
      calls: result.calls,
    });
  }
  for (const state of byName.values()) {
    // Popped from the end: the largest `from` first, the smallest `to` first.
    state.byFrom = [...state.waiting].sort((x, y) => x.from - y.from);
    state.byTo = [...state.waiting].sort((x, y) => y.to - x.to);
  }
  const done = new Set();
  const pending = [];
  const readsAt = at => {
    for (const name of namesAt.get(at) ?? []) {
      const state = stateOf(name);
      if (at < state.min || at > state.max) {
        state.min = Math.min(state.min, at);
        state.max = Math.max(state.max, at);
        pending.push(name);
      }
    }
  };
  // Each called function is expanded once, however many results read it.
  const expanded = new Set();
  const settle = entry => {
    if (done.has(entry)) return;
    done.add(entry);
    if (entry.calls != null) {
      if (expanded.has(entry.calls)) return;
      expanded.add(entry.calls);
      for (const binding of bindingsOf.get(entry.calls) ?? []) {
        if (done.has(binding)) continue;
        done.add(binding);
        markLines(binding.from, binding.to, readsAt);
      }
      return;
    }
    markLines(entry.from, entry.to, readsAt);
  };
  for (const binding of bindings) if (binding.typed) settle(binding);
  for (const name of byName.keys()) pending.push(name);
  while (pending.length > 0) {
    const state = byName.get(pending.pop());
    const {byFrom, byTo} = state;
    while (byFrom.length > 0 && byFrom[byFrom.length - 1].from > state.min) {
      settle(byFrom.pop());
    }
    while (byTo.length > 0 && byTo[byTo.length - 1].to < state.max) {
      settle(byTo.pop());
    }
  }
  return covered;
}

// A file the style-context test cannot finish reading counts as one that does
// not lex: its CSS-named keys count as before.
function styleContextsOrNull(source, jsx) {
  try {
    return styleContextLines(source, jsx);
  } catch {
    return null;
  }
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
 * @param {{ignorePath?: (file: string) => boolean, sources?: Record<string, {base: string, head: string}>, styleSources?: Record<string, {base?: string, head?: string}>}} [opts] - `ignorePath`
 *   excludes additional paths beyond the built-in rules (e.g. review-signal
 *   passes its safe-space predicate so lab/sandbox/storybook never count).
 *   `sources` provides trusted base/head bytes used for appearance-only proof.
 *   `styleSources` provides each file's bytes at the revision a changed line
 *   comes from (base for a removed line, head for an added one, by that
 *   side's path), so a CSS-named key scores only in a style context; the
 *   paths styleContextPaths lists need them.
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
  const styleSources =
    opts.styleSources != null && typeof opts.styleSources === 'object'
      ? opts.styleSources
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
  // A CSS-named key scores only in a style context of its file at its own
  // revision (styleContextLines). A style-surface file is style throughout.
  // Without that file's bytes, or when they do not lex or do not hold the
  // diff's line, the key scores as a style edit.
  const styleContextCache = new Map();
  const inStyleContext = (path, side, lineNumber, rawContent) => {
    if (isStyleSurfaceFile(currentFile)) return true;
    const key = `${path}\0${side}`;
    if (!styleContextCache.has(key)) {
      const source = styleSources?.[path]?.[side];
      styleContextCache.set(
        key,
        typeof source === 'string'
          ? {
              lines: source.split(/\r?\n/),
              style: styleContextsOrNull(source, !/\.ts$/.test(path)),
            }
          : null,
      );
    }
    const proof = styleContextCache.get(key);
    if (proof === null || proof.style === null) return true;
    if (!Number.isInteger(lineNumber)) return true;
    if (proof.lines[lineNumber - 1] !== rawContent) return true;
    return proof.style.has(lineNumber);
  };
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

    if (
      isCssPropertyLine(content, currentFile) &&
      inStyleContext(sourcePath, sourceSide, lineNumber, rawContent)
    ) {
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

/**
 * The file revisions a diff's CSS-named keys need for the style-context test:
 * for each changed line that names a CSS property in a scanned product file
 * that is not a style surface, its path at that side (`base` for a removed
 * line, `head` for an added one).
 *
 * @param {string} diffText
 * @param {{ignorePath?: (file: string) => boolean}} [opts]
 * @returns {Record<string, {base?: boolean, head?: boolean}>}
 */
function styleContextPaths(diffText, opts = {}) {
  const ignorePath =
    typeof opts.ignorePath === 'function' ? opts.ignorePath : null;
  const needed = {};
  let oldPath = null;
  let newPath = null;
  let scanned = false;
  for (const line of (diffText || '').split('\n')) {
    const fileMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (fileMatch) {
      [, oldPath, newPath] = fileMatch;
      scanned =
        isProductFile(newPath) &&
        !(ignorePath && ignorePath(newPath)) &&
        !isIgnoredFile(newPath) &&
        isScannableFile(newPath) &&
        !isStyleSurfaceFile(newPath);
      continue;
    }
    if (!scanned || /^(?:\+\+\+|---) /.test(line)) continue;
    if (line[0] !== '+' && line[0] !== '-') continue;
    if (!isCssPropertyLine(line.slice(1).trim(), newPath)) continue;
    const side = line[0] === '+' ? 'head' : 'base';
    const path = side === 'head' ? newPath : oldPath;
    needed[path] = {...needed[path], [side]: true};
  }
  return needed;
}

module.exports = {
  classifyVisualDiff,
  styleContextLines,
  styleContextPaths,
  WEIGHTS,
  JSX_CAP,
};
