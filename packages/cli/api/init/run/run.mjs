// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file init.run leaf — non-interactive project setup + feature installer.
 *
 * `run(options, ctx)` is the default / `--features` / `--all` path behind
 * `astryx init`. It installs the agent-docs cheat sheet at the project root so
 * every agent reads it (AGENTS.md, a copy in the project's Claude Code file, and
 * a GEMINI.md import), points at the theme + page-building workflows, and
 * (optionally) scaffolds a starter template — with NO prompts, so it behaves
 * identically for humans, agents, CI, and piped I/O. It performs the side
 * effects and returns an
 * `init.run` receipt. Hard errors (unknown feature/template) throw AstryxError
 * with a stable code. Human output is emitted through the shared `logger`
 * (silent by default) so the CLI keeps its exact plain output and a
 * programmatic caller stays quiet.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import {CLI_ROOT} from '../../../foundation/fs/paths.mjs';
import {PathSafetyError, assertWithin} from '../../../foundation/fs/path-safety.mjs';
import {getCliInvocation} from '../../../foundation/env/package-manager.mjs';
import {isOutsideProject} from '../../../foundation/env/project-scope.mjs';
import {
  AgentDocsHomeError,
  assertAgentDocsTarget,
  installAgentDocs,
  renderAgentDocsBlock,
  agentDocsTargetDir,
} from '../../../foundation/agent-docs/agent-docs.mjs';
import {themeTemplate} from '../../theme/template/template.mjs';
import {listTemplates} from '../../template/template.mjs';
import {AstryxError} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {logger} from '../../logger.mjs';

const VALID_FEATURES = ['agents', 'theme', 'template'];
const VALID_AGENTS = ['claude', 'cursor', 'codex', 'hermes', 'muse', 'all'];

/**
 * Build the "Next steps" lines printed at the end of `astryx init`.
 *
 * Theme guidance follows the generated app-module workflow. `theme add` records
 * installed built themes and imports their production and font stylesheets. The
 * app imports that module once and passes its default to <Theme>.
 *
 * @param {string} invocation install-aware CLI invocation stem (e.g. `pnpm exec astryx`, `yarn astryx`, or `npx @astryxdesign/cli` for one-off runs)
 * @returns {string[]} ordered list of human-facing lines
 */
export function getNextSteps(invocation) {
  return [
    '',
    '  Next steps:',
    '    1. Ensure the @stylexjs/stylex peer dependency is met',
    `       (run \`${invocation} doctor\` to verify)`,
    "    2. Import base styles: import '@astryxdesign/core/reset.css'",
    "       and import '@astryxdesign/core/astryx.css'",
    "    3. Import components: import { Button } from '@astryxdesign/core/Button'",
    '    4. Add and wire a theme:',
    '       npm install @astryxdesign/theme-neutral',
    `       ${invocation} theme add neutral`,
    "       import { Theme } from '@astryxdesign/core/theme'",
    "       import { themes, defaultThemeSlug } from './astryx-themes'",
    '       <Theme theme={themes[defaultThemeSlug]}>...</Theme>',
    `       Extend an imported theme to customize it. Run \`${invocation} theme eject <slug>\` only to fork source.`,
    `    5. ${invocation} --help for all commands`,
    '',
  ];
}

/**
 * Whether two paths name one folder, links resolved.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function sameFolder(a, b) {
  /** @param {string} p */
  const real = p => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  return real(a) === real(b);
}

/**
 * Install the agent-docs block; records the outcome (or soft error) on `data`.
 * Mirrors the CLI's historical soft-error policy: a PathSafetyError surfaces its
 * precise message and flags a non-zero exit; any other failure prints the
 * generic retry hint and continues without changing the exit code.
 *
 * @param {string} cwd
 * @param {import('../init.type.mjs').InitOptions} options
 * @param {string} invocation
 * @param {import('../init.type.mjs').InitRunData} data
 */
async function applyAgents(cwd, options, invocation, data) {
  // Validate --agent up front (a hard error, not a swallowed install failure).
  // ERR_UNKNOWN_AGENT was defined but never wired — a typo like `--agent claud`
  // otherwise silently fell back to writing AGENTS.md. Mirrors --features.
  if (options.agent && !VALID_AGENTS.includes(options.agent)) {
    throw new AstryxError(
      `Unknown agent "${options.agent}". Valid agents: ${VALID_AGENTS.join(', ')}`,
      undefined,
      ERROR_CODES.ERR_UNKNOWN_AGENT,
    );
  }
  try {
    const paths = options.agentDocsPath
      ? Array.isArray(options.agentDocsPath)
        ? options.agentDocsPath
        : [options.agentDocsPath]
      : undefined;
    // The docs belong at the project root, not in the subfolder init ran in;
    // with no project above, they go where init ran, as before. Explicit
    // --agent-docs-path entries stay relative to where init ran.
    const root = agentDocsTargetDir(cwd);
    const targetDir = paths ? cwd : root;
    // With explicit paths, installAgentDocs checks each file's own folder.
    if (!paths) assertAgentDocsTarget(targetDir);
    const renderedBlock = await renderAgentDocsBlock(root);
    /** @type {string[]} */
    const skipped = [];
    const files = installAgentDocs(targetDir, {
      agent: options.agent,
      paths,
      renderedBlock,
      onSkipped: (rel, reason) => skipped.push(`${rel} (${reason})`),
      // Below the project root, 0.7.1 wrote in the folder init ran in, so a
      // project-root file that escapes the project is skipped and reported,
      // not refused.
      refuseEscapes: sameFolder(targetDir, cwd),
    });
    // Each file is reported from where init ran, as before.
    const written =
      path.resolve(targetDir) === path.resolve(cwd)
        ? files
        : files.map(rel =>
            path.relative(cwd, path.join(targetDir, rel)).split(path.sep).join('/'),
          );
    data.docsWritten = written;
    logger.log(`[ok] AI agent docs installed -> ${written.join(', ')}`);
    // A file 0.7.1 did not write (GEMINI.md, or a project-root file when init
    // runs below the root) that resolves outside the project is left as it
    // is, reported in docsError with one note; the exit code stays 0. A file
    // 0.7.1 wrote whose path escapes the project still fails the run (below).
    if (skipped.length > 0) {
      const message =
        `Left as ${skipped.length === 1 ? 'it is' : 'they are'}: ${skipped.join('; ')}. ` +
        'To have init write the Astryx block there, make it a regular file inside the project, or copy the block from AGENTS.md by hand.';
      logger.warn(`Note: ${message}`);
      data.docsError = {kind: 'install-failed', message};
    }
  } catch (err) {
    // PathSafetyError carries a precise, user-actionable message — surface it
    // (and flag exit 1) instead of the generic "could not install" warning so
    // misconfigured --agent-docs-path values aren't silently swallowed.
    if (err instanceof PathSafetyError) {
      logger.error(`Error: ${err.message}`);
      data.docsError = {kind: 'path-safety', message: err.message};
      return;
    }
    // The home folder, and a settings folder in it outside a project, are
    // refused: nothing is written, the reason is printed as a note, and the
    // exit code stays 0.
    if (err instanceof AgentDocsHomeError) {
      logger.warn(`Note: ${err.message}`);
      data.docsError = {kind: 'install-failed', message: err.message};
      return;
    }
    logger.error(
      `Could not install agent docs. Try again with \`${invocation} init --features agents\`.`,
    );
    data.docsError = {kind: 'install-failed'};
  }
}

/**
 * Write the annotated theme template, via the same leaf `astryx theme template`
 * uses — init is a convenience wrapper over the theme command, not a second
 * implementation of it.
 *
 * @param {string} cwd
 * @param {string} invocation
 * @param {import('../init.type.mjs').InitRunData} data
 */
function applyTheme(cwd, invocation, data) {
  data.theme = true;
  try {
    const {path: written, written: didWrite} = themeTemplate({cwd}).data;
    data.themeTemplate = didWrite ? 'created' : 'skipped';
    data.themeTemplatePath = didWrite ? written : null;
    logger.log(
      didWrite
        ? `[ok] Theme template written -> ${written}`
        : `- ${written} already exists - left as is.`,
    );
  } catch {
    // Soft failure, like agent docs: the guidance below is still useful.
    data.themeTemplate = 'failed';
    logger.error('Could not write the theme template.');
  }
  // Outside a project there is no app to add a theme to (spec AST-081 FR3).
  logger.log(
    isOutsideProject(cwd)
      ? `  Edit the blank template for a new theme, or run \`${invocation} theme eject <slug>\` to start from the source of a built theme (\`${invocation} theme list\` to browse).`
      : `  Edit the blank template for a new theme, or run \`${invocation} theme add <slug>\` to import an installed built theme (\`${invocation} theme list\` to browse). Extend an imported theme for ordinary customization; use \`${invocation} theme eject <slug>\` only to fork source.`,
  );
}

/**
 * Emit the template guidance, or (programmatic-only) scaffold a named template.
 * The CLI never passes `templateName`, so from the CLI this always emits the
 * build-workflow prose (or nothing when no templates are bundled).
 *
 * @param {string} cwd
 * @param {{templateName?: string}} opts
 * @param {string} invocation
 * @param {import('../init.type.mjs').InitRunData} data
 */
function applyTemplate(cwd, {templateName}, invocation, data) {
  const templates = listTemplates();
  if (templates.length === 0) {
    data.template = 'skipped';
    return;
  }

  if (!templateName) {
    // Point agents at the build workflow rather than dumping page-template
    // names — `build` surfaces pages AND blocks AND components for an idea,
    // and `build` with no args is the full how-to-build playbook.
    logger.log('[ok] To build UI, use these commands:');
    logger.log('');
    logger.log(
      `    ${invocation} build "<what you're building>"   build a page - kit: closest template + blocks + components`,
    );
    logger.log(
      `    ${invocation} build                            the how-to-build workflow (read this first)`,
    );
    logger.log(
      `    ${invocation} search <query>                   find anything - components, docs, templates, blocks`,
    );
    logger.log('');
    data.template = 'workflow';
    return;
  }

  if (!templates.includes(templateName)) {
    throw new AstryxError(
      `Unknown template "${templateName}". Available: ${templates.join(', ')}`,
      undefined,
      ERROR_CODES.ERR_UNKNOWN_TEMPLATE,
    );
  }

  let destFile;
  try {
    destFile = assertWithin(path.join('src', 'pages', templateName, 'page.tsx'), cwd, {
      label: 'template output path',
    });
  } catch (err) {
    if (err instanceof PathSafetyError) {
      throw new AstryxError(err.message, undefined, ERROR_CODES.ERR_PATH_TRAVERSAL);
    }
    throw err;
  }
  const outputDir = path.dirname(destFile);
  const srcPath = path.join(CLI_ROOT, 'assets', 'templates', 'pages', templateName, 'page.tsx');
  // Don't clobber a user's existing page — same guard the peer template/copy and
  // theme/add write-leaves apply (init is a public API surface too).
  if (fs.existsSync(destFile)) {
    const relDest = path.relative(cwd, destFile) || destFile;
    throw new AstryxError(
      `Refusing to overwrite existing file ${relDest}.`,
      undefined,
      ERROR_CODES.ERR_FILE_EXISTS,
    );
  }
  fs.mkdirSync(outputDir, {recursive: true});
  fs.copyFileSync(srcPath, destFile);
  const rel = path.relative(cwd, outputDir);
  logger.log(`[ok] Template created at ${rel}/page.tsx`);
  data.template = 'created';
  data.templatePath = rel;
}

/**
 * Run the install path of the non-interactive init flow (the default no-flags
 * install plus `--features` / `--all`). Performs the side effects (agent-docs
 * install, template scaffold) and returns an `init.run` receipt. Progress is
 * emitted through `logger` (silent by default); unknown feature or template
 * names throw AstryxError with a stable code.
 *
 * @param {import('../init.type.mjs').InitOptions} [options]
 * @param {{cwd?: string}} [ctx]
 * @returns {Promise<import('../init.type.mjs').InitRunResponse>}
 */
export async function run(options = {}, {cwd = process.cwd()} = {}) {
  const invocation = getCliInvocation();

  // Non-interactive feature install: --features or --all.
  if (options.features || options.all) {
    const features = options.all
      ? VALID_FEATURES
      : String(options.features)
          .split(',')
          .map(f => f.trim().toLowerCase());

    const invalid = features.filter(f => !VALID_FEATURES.includes(f));
    if (invalid.length > 0) {
      throw new AstryxError(
        `Unknown features: ${invalid.join(', ')}. Valid features: ${VALID_FEATURES.join(', ')}`,
        undefined,
        ERROR_CODES.ERR_UNKNOWN_FEATURE,
      );
    }

    /** @type {import('../init.type.mjs').InitRunData} */
    const data = {
      mode: 'features',
      features,
      docsWritten: [],
      docsError: null,
      theme: false,
      themeTemplate: null,
      themeTemplatePath: null,
      template: null,
      templatePath: null,
      nextSteps: false,
    };
    for (const feature of features) {
      if (feature === 'agents') await applyAgents(cwd, options, invocation, data);
      if (feature === 'theme') applyTheme(cwd, invocation, data);
      if (feature === 'template') {
        applyTemplate(cwd, {templateName: options.templateName}, invocation, data);
      }
    }
    return {type: 'init.run', data};
  }

  // No flags: TTY-free default — install the AI agent cheat sheet with NO
  // prompts, then print the getting-started guidance. Outside a project the
  // steps would set up a project the folder does not have, so they are left
  // out (spec AST-081 FR3).
  const outside = isOutsideProject(cwd);
  /** @type {import('../init.type.mjs').InitRunData} */
  const data = {
    mode: 'default',
    features: ['agents'],
    docsWritten: [],
    docsError: null,
    theme: false,
    themeTemplate: null,
    themeTemplatePath: null,
    template: null,
    templatePath: null,
    nextSteps: !outside,
  };
  await applyAgents(cwd, options, invocation, data);
  logger.log('');
  logger.log(
    `  Tip: \`${invocation} init --all\` also points you to the theme and page-building workflows.`,
  );
  if (outside) {
    logger.log('');
    return {type: 'init.run', data};
  }
  for (const line of getNextSteps(invocation)) logger.log(line);
  return {type: 'init.run', data};
}
