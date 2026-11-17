// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The doc syntax for commands a reader runs: `{@command …}` for an
 * Astryx command, `{@pm …}` for a package-manager step, `{@pm-only <manager>
 * "<reason>" …}` for a step only one package manager can do, and `{@@…}` to
 * show a token as written. Each token is rendered for the reader: an Astryx
 * command with the reader's runner, a package-manager step in the reader's
 * package manager.
 *
 * @input Doc text, the reader's CLI invocation and package manager.
 * @output The text with each token rendered; each token's parse, for doctor;
 *   the token a plain-text command should be written as, for doctor's fix.
 * @position foundation/doc-compiler — pure; the env lookup lives in
 *   foundation/env/package-manager.mjs.
 */

/**
 * The package managers a `{@pm}` token renders for. `yarn-classic` is Yarn 1;
 * `yarn` is Yarn 2 and newer.
 * @typedef {'npm' | 'pnpm' | 'yarn' | 'yarn-classic' | 'bun'} DocPackageManager
 */

/** Every package manager a token renders for, in the order docs list them. */
export const DOC_PACKAGE_MANAGERS = /** @type {const} */ ([
  'npm',
  'pnpm',
  'yarn',
  'yarn-classic',
  'bun',
]);

/** The binary each package manager runs as. */
const BINARY = {
  npm: 'npm',
  pnpm: 'pnpm',
  yarn: 'yarn',
  'yarn-classic': 'yarn',
  bun: 'bun',
};

/** The verbs `{@pm}` takes, each portable across every package manager. */
export const PM_VERBS = /** @type {const} */ ([
  'install',
  'remove',
  'update',
  'run',
  'exec',
  'dlx',
  'create',
]);

/** The flags `{@pm}` takes, and the verbs each applies to. */
export const PM_FLAGS = {
  '--dev': ['install'],
  '--exact': ['install'],
  '--global': ['install', 'remove'],
  '--latest': ['update'],
};

/**
 * A token: `{@name body}`, or one written with more `@`s, which shows with one
 * `@` fewer (`{@@pm …}` shows as `{@pm …}`). The body may hold quoted text
 * and balanced braces (`pkg set 'exports={}'`), but never a line break or a
 * backtick: a token sits on one line of one code span or block, and one that
 * does not is an unclosed opening doctor names.
 */
const TOKEN =
  /\{@(@*)([a-z][\w-]*)(?:[ \t]+((?:'[^'\n`]*'|"[^"\n`]*"|\{[^{}\n`]*\}|[^{}'"\n`])*?))?[ \t]*\}/g;

/** The token names this module renders (`{@link}` resolves elsewhere). */
const COMMAND_TOKENS = new Set(['command', 'pm', 'pm-only']);

/** A version range: anything after `@` that is not one exact version. */
const RANGE = /[\^~<>*| ]|(?:^|\.)x(?:\.|$)|^latest$|^next$/i;

/**
 * Split a token body into words, keeping a double-quoted run as one word.
 * @param {string} body
 * @returns {string[]}
 */
export function splitWords(body) {
  const words = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  for (const match of String(body).matchAll(pattern)) {
    words.push(match[1] !== undefined ? `"${match[1]}"` : match[2]);
  }
  return words;
}

/**
 * @typedef {object} PmStep
 * @property {'pm'} kind
 * @property {typeof PM_VERBS[number]} verb
 * @property {string[]} args packages, a script or binary and its arguments
 * @property {Set<string>} flags
 */

/**
 * @typedef {object} PmOnlyStep
 * @property {'pm-only'} kind
 * @property {DocPackageManager} manager
 * @property {string} reason
 * @property {string[]} args the command after the manager's name
 */

/**
 * @typedef {object} CliStep
 * @property {'command'} kind
 * @property {string[]} args the command after `astryx`
 */

/**
 * @typedef {PmStep | PmOnlyStep | CliStep} DocStep
 */

/**
 * Read one token. Returns the step, or `{error}` saying what is wrong and how
 * to write it.
 * @param {string} name the token name, `pm` in `{@pm install x}`
 * @param {string} body what follows the name
 * @returns {DocStep | {error: string}}
 */
export function parseCommandToken(name, body = '') {
  const words = splitWords(body);
  if (name === 'command') {
    if (words.length === 0) {
      return {error: '`{@command}` needs a command: `{@command docs theme}`'};
    }
    if (words[0] === 'astryx') {
      return {
        error: `\`{@command}\` takes the command without \`astryx\`: \`{@command ${words.slice(1).join(' ')}}\``,
      };
    }
    return {kind: 'command', args: words};
  }
  if (name === 'pm-only') {
    const [manager, reason, ...args] = words;
    if (!DOC_PACKAGE_MANAGERS.includes(/** @type {any} */ (manager))) {
      return {
        error: `\`{@pm-only}\` starts with the package manager, one of ${DOC_PACKAGE_MANAGERS.join(', ')}: \`{@pm-only npm "<why only npm>" pkg set name=x}\``,
      };
    }
    if (!reason || !/^".+"$/.test(reason)) {
      return {
        error: `\`{@pm-only ${manager}}\` needs a reason in double quotes after the package manager, which readers see: \`{@pm-only ${manager} "<why only ${manager}>" ${args.join(' ') || '<command>'}}\``,
      };
    }
    if (args.length === 0) {
      return {error: `\`{@pm-only ${manager} ${reason}}\` needs a command`};
    }
    return {
      kind: 'pm-only',
      manager: /** @type {DocPackageManager} */ (manager),
      reason: reason.slice(1, -1),
      args,
    };
  }
  if (name === 'pm') {
    const [verb, ...rest] = words;
    if (!PM_VERBS.includes(/** @type {any} */ (verb))) {
      return {
        error: `\`{@pm}\` starts with a verb, one of ${PM_VERBS.join(', ')}: \`{@pm install @acme/widgets}\``,
      };
    }
    const flags = new Set();
    const args = [];
    for (const word of rest) {
      if (
        word.startsWith('--') &&
        word in PM_FLAGS &&
        verb !== 'run' &&
        verb !== 'exec' &&
        verb !== 'dlx'
      ) {
        const allowed = /** @type {Record<string, readonly string[]>} */ (
          PM_FLAGS
        )[word];
        if (!allowed.includes(verb)) {
          return {
            error: `\`${word}\` applies to ${allowed.map(each => `\`{@pm ${each}}\``).join(' and ')}, not \`{@pm ${verb}}\``,
          };
        }
        flags.add(word);
      } else if (
        word.startsWith('-') &&
        verb !== 'run' &&
        verb !== 'exec' &&
        verb !== 'dlx' &&
        verb !== 'create'
      ) {
        return {
          error: `\`{@pm ${verb}}\` takes the flags ${
            Object.keys(PM_FLAGS)
              .filter(flag =>
                /** @type {Record<string, readonly string[]>} */ (PM_FLAGS)[
                  flag
                ].includes(verb),
              )
              .join(', ') || 'none'
          }, not \`${word}\`, so it reads the same in every package manager`,
        };
      } else {
        args.push(word);
      }
    }
    if (['run', 'exec', 'dlx', 'create'].includes(verb) && args.length === 0) {
      return {
        error: `\`{@pm ${verb}}\` needs a name: \`{@pm ${verb} <name>}\``,
      };
    }
    if (verb === 'remove' && args.length === 0) {
      return {error: '`{@pm remove}` needs a package'};
    }
    if (flags.has('--exact')) {
      const ranged = args.find(arg => {
        const at = arg.lastIndexOf('@');
        return at > 0 && RANGE.test(arg.slice(at + 1));
      });
      if (ranged) {
        return {
          error: `\`--exact\` with a range (\`${ranged}\`) keeps the range in every package manager but npm: write one version, or drop \`--exact\``,
        };
      }
    }
    if (flags.has('--latest') && args.length === 0) {
      return {error: '`{@pm update --latest}` needs the packages to move'};
    }
    return {
      kind: 'pm',
      verb: /** @type {PmStep['verb']} */ (verb),
      args,
      flags,
    };
  }
  return {error: `\`{@${name}}\` is not a doc token`};
}

/**
 * The command a package-manager step runs in one package manager.
 * @param {PmStep} step
 * @param {DocPackageManager} pm
 * @returns {string}
 */
export function renderPmStep(step, pm) {
  const {verb, args, flags} = step;
  const join = (/** @type {Array<string | string[]>} */ ...parts) =>
    parts.flat().filter(Boolean).join(' ');
  const global = flags.has('--global');
  // Yarn 2 and newer has no global install: npm, which every Node carries.
  const manager = global && pm === 'yarn' ? 'npm' : pm;
  switch (verb) {
    case 'install': {
      if (args.length === 0 && !global) return join(BINARY[manager], 'install');
      const dev = flags.has('--dev') ? (manager === 'bun' ? '-d' : '-D') : '';
      const exact = flags.has('--exact')
        ? manager === 'bun'
          ? '--exact'
          : '-E'
        : '';
      if (global) {
        return {
          npm: join('npm install -g', exact, args),
          pnpm: join('pnpm add -g', exact, args),
          yarn: join('npm install -g', exact, args),
          'yarn-classic': join('yarn global add', exact, args),
          bun: join('bun add -g', exact, args),
        }[manager];
      }
      const add = manager === 'npm' ? 'npm install' : `${BINARY[manager]} add`;
      return join(add, dev, exact, args);
    }
    case 'remove': {
      if (global) {
        return {
          npm: join('npm uninstall -g', args),
          pnpm: join('pnpm remove -g', args),
          yarn: join('npm uninstall -g', args),
          'yarn-classic': join('yarn global remove', args),
          bun: join('bun remove -g', args),
        }[manager];
      }
      return join(
        manager === 'npm' ? 'npm uninstall' : `${BINARY[manager]} remove`,
        args,
      );
    }
    case 'update': {
      if (flags.has('--latest')) {
        return {
          npm: join(
            'npm install',
            args.map(arg => `${arg}@latest`),
          ),
          pnpm: join('pnpm update --latest', args),
          yarn: join('yarn up', args),
          'yarn-classic': join('yarn upgrade --latest', args),
          bun: join('bun update --latest', args),
        }[pm];
      }
      return {
        npm: join('npm update', args),
        pnpm: join('pnpm update', args),
        // `yarn up` moves to the newest release; -R stays in the range.
        yarn: join('yarn up -R', args),
        'yarn-classic': join('yarn upgrade', args),
        bun: join('bun update', args),
      }[pm];
    }
    case 'run': {
      const [script, ...rest] = args;
      // npm passes arguments to a script after `--`; pnpm and Yarn 2 pass a
      // `--` on to the script itself, so only npm writes one.
      if (pm === 'npm') {
        return join('npm run', script, rest.length > 0 ? ['--', ...rest] : []);
      }
      return join(BINARY[pm], 'run', script, rest);
    }
    case 'exec':
      return join(
        {
          npm: 'npx',
          pnpm: 'pnpm exec',
          yarn: 'yarn run',
          'yarn-classic': 'yarn run',
          bun: 'bunx',
        }[pm],
        args,
      );
    case 'dlx':
      return join(
        {
          npm: 'npx',
          pnpm: 'pnpm dlx',
          yarn: 'yarn dlx',
          // Yarn 1 has no dlx: npx, which every Node carries.
          'yarn-classic': 'npx',
          bun: 'bunx',
        }[pm],
        args,
      );
    case 'create': {
      // npm passes flags to the initializer only after `--`.
      const flagAt = args.findIndex(arg => arg.startsWith('-'));
      if (pm === 'npm' && flagAt > 0) {
        return join('npm create', [
          ...args.slice(0, flagAt),
          '--',
          ...args.slice(flagAt),
        ]);
      }
      return join(BINARY[pm], 'create', args);
    }
    default:
      return join(BINARY[pm], verb, args);
  }
}

/**
 * @typedef {object} RenderOptions
 * @property {string} stem how the reader runs the CLI, e.g. `pnpm exec astryx`
 * @property {DocPackageManager} pm the reader's package manager
 */

/**
 * One step as the reader runs it, and, for a one-manager step, the line
 * readers see beside it.
 * @param {DocStep} step
 * @param {RenderOptions} options
 * @returns {{command: string, note: string | null}}
 */
export function renderStep(step, {stem, pm}) {
  if (step.kind === 'command') {
    return {command: [stem, ...step.args].join(' '), note: null};
  }
  if (step.kind === 'pm-only') {
    return {
      command: [BINARY[step.manager], ...step.args].join(' '),
      note: `only with ${managerName(step.manager)}: ${step.reason}`,
    };
  }
  return {command: renderPmStep(step, pm), note: null};
}

/**
 * A package manager's name as readers read it.
 * @param {DocPackageManager} pm
 * @returns {string}
 */
export function managerName(pm) {
  return {
    npm: 'npm',
    pnpm: 'pnpm',
    yarn: 'Yarn',
    'yarn-classic': 'Yarn 1',
    bun: 'Bun',
  }[pm];
}

/** Code-fence languages whose lines are shell commands. */
const SHELL_LANGS = new Set(['', 'bash', 'sh', 'shell', 'zsh', 'console']);

/**
 * Text with each `{@command}`, `{@pm}` and `{@pm-only}` token rendered for the
 * reader, and each `{@@…}` shown as `{@…}`. A token in prose prints as a code
 * span; in a code span or code block, as the bare command. A one-manager
 * step's reason follows it: in prose right after the command, after a code
 * span, in parentheses; in a shell block as a comment. A Markdown fence in
 * prose is a code block in its language. A token that does not parse prints
 * as written, and doctor names it.
 * @param {string} text
 * @param {RenderOptions} options
 * @param {string | null} [lang] the code block's language when `text` is one
 *   block's body; omit for prose
 * @returns {string}
 */
export function renderCommandTokens(text, options, lang = null) {
  const source = String(text);
  if (!source.includes('{@')) return source;
  const inBlock = lang != null;
  const shell = inBlock && SHELL_LANGS.has(lang.toLowerCase());
  /**
   * @param {string} part
   * @param {string[]} notes where a one-manager step's reason goes
   * @param {boolean} wrap print a rendered command as a code span
   */
  const render = (part, notes, wrap) =>
    part.replace(TOKEN, (whole, escaped, name, body = '') => {
      if (escaped) return whole.replace('{@@', '{@');
      if (!COMMAND_TOKENS.has(name)) return whole;
      const step = parseCommandToken(name, body);
      if ('error' in step) return whole;
      const {command, note} = renderStep(step, options);
      // In prose the reason follows its own command, inside the sentence.
      if (note != null && wrap) return `\`${command}\` (${note})`;
      if (note != null) notes.push(note);
      return wrap ? `\`${command}\`` : command;
    });
  if (inBlock) {
    return source
      .split('\n')
      .map(line => {
        /** @type {string[]} */
        const notes = [];
        const out = render(line, notes, false);
        if (notes.length === 0) return out;
        return shell
          ? `${out}  # ${notes.join('; ')}`
          : `${out} (${notes.join('; ')})`;
      })
      .join('\n');
  }
  /** @param {string} line */
  const prose = line =>
    line
      .split(/(`[^`\n]*`)/)
      .map(part => {
        /** @type {string[]} */
        const notes = [];
        const isSpan =
          part.length > 1 && part.startsWith('`') && part.endsWith('`');
        const out = render(part, notes, !isSpan);
        return notes.length === 0 ? out : `${out} (${notes.join('; ')})`;
      })
      .join('');
  // A fence inside prose is a code block: its lines render as one, in the
  // fence's language.
  /** @type {{marker: string, lang: string} | null} */
  let fence = null;
  return source
    .split('\n')
    .map(line => {
      const marker = /^\s*(`{3,}|~{3,})\s*([\w-]*)/.exec(line);
      if (marker) {
        if (fence == null) {
          fence = {marker: marker[1], lang: marker[2].toLowerCase()};
        } else if (marker[1].startsWith(fence.marker)) {
          fence = null;
        }
        return line;
      }
      return fence == null
        ? prose(line)
        : renderCommandTokens(line, options, fence.lang);
    })
    .join('\n');
}

/**
 * Every command token in a text, with its parse, for doctor.
 * @param {string} text
 * @returns {Array<{token: string, name: string, step: DocStep | {error: string}}>}
 */
export function commandTokensIn(text) {
  const found = [];
  for (const match of String(text).matchAll(TOKEN)) {
    if (match[1] || !COMMAND_TOKENS.has(match[2])) continue;
    found.push({
      token: match[0],
      name: match[2],
      step: parseCommandToken(match[2], match[3] ?? ''),
    });
  }
  return found;
}

/** The token names a doc may write: these and `{@link}`. */
export const DOC_TOKEN_NAMES = new Set([...COMMAND_TOKENS, 'link']);

/**
 * Every `{@name …}` whose name is not a doc token, for doctor.
 * @param {string} text
 * @returns {string[]}
 */
export function unknownTokensIn(text) {
  const found = [];
  for (const match of String(text).matchAll(TOKEN)) {
    if (!match[1] && !DOC_TOKEN_NAMES.has(match[2])) found.push(match[0]);
  }
  return found;
}

/**
 * Each `{@command`, `{@pm` or `{@pm-only` opening (escaped with more `@`s
 * too) that no whole token starts at: one with no closing brace, or with a
 * quote it never closes. It prints as written, so doctor names it.
 * @param {string} text
 * @returns {string[]} the opening and the rest of its line
 */
export function unclosedTokensIn(text) {
  const source = String(text);
  const starts = new Set(
    [...source.matchAll(TOKEN)].map(
      match => /** @type {number} */ (match.index),
    ),
  );
  const found = [];
  for (const match of source.matchAll(/\{@@*(?:command|pm-only|pm)\b/g)) {
    const at = /** @type {number} */ (match.index);
    if (starts.has(at)) continue;
    const end = source.indexOf('\n', at);
    found.push(source.slice(at, end < 0 ? undefined : end).slice(0, 80));
  }
  return found;
}

/** Package-manager binaries a plain-text command may start with. */
const PM_BINARIES = new Set(['npm', 'npx', 'pnpm', 'yarn', 'bun', 'bunx']);

/**
 * The token a plain-text package-manager command should be written as, for
 * doctor's fix: `{@pm …}` when every package manager can run it, `{@pm-only
 * <manager> "<why>" …}` when only that one can, or null when the text is not
 * a package-manager command. A runner in front of `astryx` is an Astryx
 * command: `{@command …}`.
 * @param {string} command one command, such as `npm install -D @acme/x`
 * @returns {string | null}
 */
export function tokenForCommand(command) {
  const words = String(command).trim().split(/\s+/);
  const [bin, ...rest] = words;
  if (bin === 'astryx')
    return `{@command ${rest.join(' ')}}`.replace(' }', '}');
  if (!PM_BINARIES.has(bin)) return null;
  // A runner in front of astryx.
  const astryxAt = rest.indexOf('astryx');
  const runnerWords =
    bin === 'npx' || bin === 'bunx'
      ? 0
      : bin === 'pnpm' && (rest[0] === 'exec' || rest[0] === 'dlx')
        ? 1
        : bin === 'yarn' &&
            (rest[0] === 'run' || rest[0] === 'dlx' || rest[0] === 'exec')
          ? 1
          : bin === 'npm' && (rest[0] === 'exec' || rest[0] === 'x')
            ? 1
            : bin === 'bun' && rest[0] === 'x'
              ? 1
              : 0;
  if (
    astryxAt === runnerWords ||
    (astryxAt >= 0 &&
      rest.slice(runnerWords, astryxAt).every(w => w.startsWith('-')))
  ) {
    const after = rest.slice(astryxAt + 1).filter(w => w !== '--');
    return after.length > 0 ? `{@command ${after.join(' ')}}` : null;
  }
  if (bin === 'npm' && rest[0] === 'run' && rest[1] === 'astryx') {
    const after = rest.slice(2).filter(w => w !== '--');
    return after.length > 0 ? `{@command ${after.join(' ')}}` : null;
  }
  const flags = [];
  const args = [];
  const pmOnly = (/** @type {string} */ manager) =>
    `{@pm-only ${manager} "<why only ${manager}>" ${rest.join(' ')}}`;
  if (bin === 'npx' || bin === 'bunx') {
    const plain = rest.filter(w => w !== '-y' && w !== '--yes');
    // npx runs the project's own binary when it has one: an unscoped,
    // unversioned name such as `tsc` is that, so it is `exec`. A scoped or
    // versioned package, or `--yes`, downloads one: `dlx`.
    const target = plain.find(w => !w.startsWith('-')) ?? '';
    const downloads =
      plain.length < rest.length ||
      target.startsWith('@') ||
      /^[^@]+@/.test(target);
    return `{@pm ${downloads ? 'dlx' : 'exec'} ${plain.join(' ')}}`;
  }
  let verb = rest[0];
  let tail = rest.slice(1);
  if (bin === 'yarn' && verb === 'global') {
    if (tail[0] === 'add' || tail[0] === 'remove') {
      flags.push('--global');
      verb = tail[0];
      tail = tail.slice(1);
    } else {
      return pmOnly('yarn-classic');
    }
  }
  if (verb === undefined) return '{@pm install}';
  const VERBS = {
    install: 'install',
    i: 'install',
    add: 'install',
    uninstall: 'remove',
    un: 'remove',
    rm: 'remove',
    remove: 'remove',
    update: 'update',
    up: 'update',
    upgrade: 'update',
    run: 'run',
    'run-script': 'run',
    exec: 'exec',
    dlx: 'dlx',
    create: 'create',
    x: 'exec',
  };
  const mapped = /** @type {Record<string, string>} */ (VERBS)[verb];
  // npm's script shortcuts run a script every package manager can run.
  if (
    !mapped &&
    bin === 'npm' &&
    ['test', 'start', 'stop', 'restart'].includes(verb)
  ) {
    // The token puts npm's `--` back itself, as for `run`.
    return `{@pm run ${[verb, ...tail.filter(word => word !== '--')].join(' ')}}`;
  }
  if (!mapped) {
    // `pnpm build`, `yarn test`: a script run without `run`.
    if (
      bin !== 'npm' &&
      bin !== 'bun' &&
      /^[\w:.-]+$/.test(verb) &&
      !NPM_TOOLS.has(verb)
    ) {
      return `{@pm run ${[verb, ...tail].join(' ')}}`;
    }
    return pmOnly(bin === 'yarn' ? 'yarn' : /** @type {string} */ (bin));
  }
  // A script, a binary or an initializer takes every word after it as its
  // own, flags included; the token puts back any `--` npm needs.
  const passesThrough = ['run', 'exec', 'dlx', 'create'].includes(mapped);
  for (const word of tail) {
    if (passesThrough) {
      if (word !== '--') args.push(word);
      continue;
    }
    if (['-D', '-d', '--save-dev', '--dev', '-DE', '-ED'].includes(word))
      flags.push('--dev');
    if (['-E', '--exact', '--save-exact', '-DE', '-ED'].includes(word))
      flags.push('--exact');
    if (['-g', '--global'].includes(word)) flags.push('--global');
    if (word === '--latest' || word === '-L') flags.push('--latest');
    if (!word.startsWith('-')) args.push(word);
  }
  const unique = [...new Set(flags)];
  // A flag no other package manager shares: one manager only.
  const known = new Set([
    '-D',
    '-d',
    '--save-dev',
    '--dev',
    '-E',
    '--exact',
    '--save-exact',
    '-g',
    '--global',
    '--latest',
    '-L',
    '-DE',
    '-ED',
    '--',
  ]);
  if (
    mapped !== 'run' &&
    mapped !== 'exec' &&
    mapped !== 'dlx' &&
    mapped !== 'create' &&
    tail.some(w => w.startsWith('-') && !known.has(w))
  ) {
    return pmOnly(bin === 'yarn' ? 'yarn' : /** @type {string} */ (bin));
  }
  const token = `{@pm ${[mapped, ...args, ...unique].join(' ')}}`;
  const parsed = parseCommandToken(
    'pm',
    [mapped, ...args, ...unique].join(' '),
  );
  return 'error' in parsed
    ? pmOnly(bin === 'yarn' ? 'yarn' : /** @type {string} */ (bin))
    : token;
}

/** Commands only npm itself runs: `npm pkg`, `npm pack` and the rest. */
const NPM_TOOLS = new Set([
  'pkg',
  'pack',
  'publish',
  'version',
  'view',
  'info',
  'config',
  'prefix',
  'setup',
  'link',
  'why',
  'ls',
  'list',
  'outdated',
  'cache',
  'init',
  'dist-tag',
  'login',
  'whoami',
  'audit',
  'ci',
  'store',
  'global',
  'dedupe',
]);
