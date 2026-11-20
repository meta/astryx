// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build.help leaf — the "how to build a page" playbook.
 *
 * `build` with no query returns this envelope. The playbook is data — steps,
 * rules, and related lookups — so a `--json` or programmatic caller gets the
 * same guidance the terminal shows. Commands are bare subcommands with no
 * package-manager prefix, which keeps the JSON environment-agnostic; the CLI
 * renders each one with the caller's invocation, as it does build.kit's
 * `hint.commands`.
 *
 * The workflow starts every page from a template, because a template already
 * has the frame, spacing, and section rhythm that a page composed from
 * components has to rediscover.
 *
 * The theme rule names the exact wiring for the project the call names, as
 * `theme add` prints it: the import and the value `<Theme>` takes, or the
 * provider an installed package names to take it. When no theme is added yet,
 * a last step adds one, as a command. A rule that leaves the value open gets
 * guessed as a theme name, and `<Theme>` with a name crashes on hydrate.
 */

import {appThemeWiring} from '../_adapter.mjs';

/**
 * The rule that wires the app's theme, for one project's theme state.
 * @param {import('../_adapter.mjs').AppThemeWiring} wiring
 * @returns {string}
 */
export function themeRule(wiring) {
  const module =
    wiring.state === 'wired'
      ? `the generated ${wiring.modulePath}`
      : 'the astryx-themes module the theme step writes';
  const notAName =
    'The theme prop takes that theme object, never a name such as "light".';
  /** The module's names some markup uses: `themeModes` only when it passes a mode. */
  const names = (/** @type {string} */ markup) =>
    markup.includes('themeModes[')
      ? 'themes, defaultThemeSlug, themeModes'
      : 'themes, defaultThemeSlug';
  const {provider} = wiring;
  if (provider) {
    return `Pass the theme to the app's ${provider.export}, which wires it: ${provider.line} (import {${provider.export}} from '${provider.from}', and {${names(provider.line)}} from ${module}), and import core reset.css + astryx.css. ${notAName}`;
  }
  const modes = wiring.state !== 'none' && wiring.hasModes;
  const mode = modes ? " mode={themeModes[defaultThemeSlug] ?? 'system'}" : '';
  return `Wrap the app in <Theme theme={themes[defaultThemeSlug]}${mode}> (import {Theme} from '@astryxdesign/core/theme', and {${names(mode)}} from ${module}) and import core reset.css + astryx.css. ${notAName}`;
}

/**
 * The step that adds the app's theme, when the project has none added yet.
 * @param {import('../_adapter.mjs').AppThemeWiring} wiring
 * @returns {import('../build.type.mjs').BuildPlaybookStep | null}
 */
export function themeStep(wiring) {
  if (wiring.state === 'wired') return null;
  return {
    title:
      wiring.state === 'none'
        ? `Install ${wiring.package}, then add it as the app's theme (once)`
        : "Add your installed theme as the app's theme (once)",
    commands: [
      {
        command: `theme add ${wiring.slug}`,
        purpose:
          'write the astryx-themes module the app root takes its theme from',
      },
    ],
  };
}

/**
 * The page-building playbook (emitted when `build` runs with no query).
 *
 * @param {{cwd?: string}} [options] the project whose theme the rules wire
 * @returns {Promise<import('../build.type.mjs').BuildHelpResponse>}
 */
export async function buildHelp(options = {}) {
  const wiring = await appThemeWiring(options.cwd ?? process.cwd());
  return {
    type: 'build.help',
    data: {
      playbook: true,
      title: 'How to build a page with Astryx',
      steps: [
        {
          title: 'Find the page template to start from',
          commands: [{command: 'build "<what you\'re building>"'}],
          returns:
            'the [page] template to start from (always one: the closest match, or the app shell when nothing matches), the next two templates, the [component]s for the parts it lacks, and [block] examples to read',
        },
        {
          title: 'Scaffold that template into your project',
          commands: [
            {
              command: 'template <name> <path>',
              purpose: 'write the page template to <path>',
            },
          ],
        },
        {
          title: 'Adapt it: keep its frame and spacing, replace its content',
          commands: [
            {
              command: 'template <BlockName>',
              purpose:
                "read a block example for a part the template lacks, then write that part in the template's style",
            },
            {
              command: 'component <Name>',
              purpose: 'read props before you change a component',
            },
          ],
        },
        ...[themeStep(wiring)].filter(step => step != null),
      ],
      rules: [
        'Start every page from a page template. Never lay out a page from scratch.',
        'Changing a page you already have? Keep it. Add components inside its sections; read a block example when it helps.',
        "Keep the template's page frame, gap, and padding values. Replace its data, copy, and sections.",
        'No <div>/raw HTML for layout — use VStack/HStack/Grid/Stack/Card etc.',
        'No style={{}} — use component props, and design tokens for values.',
        themeRule(wiring),
      ],
      related: [
        {
          command: 'template --list --type page',
          purpose: 'every page template',
        },
        {command: 'docs tokens', purpose: 'the design tokens'},
        {
          command: 'search <query>',
          purpose: 'a neutral lookup of any component, doc, or template',
        },
      ],
    },
  };
}
