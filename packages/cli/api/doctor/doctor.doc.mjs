// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `doctor()` / `astryx doctor`. Colocated with the API
 * function it documents; the shape source of truth stays in `doctor.type.mjs`.
 * @position packages/cli/api/doctor — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'doctor',
  namespace: 'cli/api',
  displayName: 'doctor()',
  summary:
    "Check a project's Astryx setup and get a pass/warn/fail report per check. Use it as a CI gate or before debugging a broken install.",
  description:
    'Runs a series of diagnostics: Node version, ' +
    "@astryxdesign/core install and version alignment with the CLI, whether the app loads Core's component styles (`core-stylesheets`, a warning: a stylesheet or module that imports `@astryxdesign/core/astryx.css` or a page that links it; not checked in an app that loads none and compiles Core from source with `@astryxdesign/build`), the Core buttons in the app's own source that do nothing when pressed (`button-actions`, a warning: a `Button` or `IconButton` from `@astryxdesign/core` with no `onClick`, `clickAction`, `href`, or `submit` or `reset` type, or with an empty handler or a link that goes nowhere (`#`, unless the app routes by the URL hash), that nothing around it can act on, each named by its file, line and label; test, story and fixture files are not read), the props the app's own source gives Core components that they do not take (`core-props`, a warning: a prop Core's docs for the component leave out and Core's own types, read with the project's TypeScript, do not take, up to eight named by file, line and component, with a documented prop that has the same words, and the rest counted; HTML, SVG, DOM and ARIA attributes and props JSX gives every component are never reported; not checked without TypeScript or with another JSX runtime; test, story and fixture files are not read), installed " +
    'themes and wiring, astryx.config validity, whether every integration ' +
    'astryx.config names loads (a failed one fails the run), integrations linked from ' +
    'package.json without a config entry, core peer dependencies, whether the @astryxdesign/core peer range of each loaded integration includes the installed Core (`integration-core-range`, a warning; added theme packages are checked by `theme-core-peers` instead), ' +
    'integration provider identity and contribution issues, agent docs, the ' +
    'detected package manager, and the health of the docs the CLI reads (authoring ' +
    'and CLI docs, the docs tree, doc size), and returns a structured ' +
    'report. Theme checks run when the generated app module exists; without one, doctor reports that the CLI manages no themes and names theme add, and the `themes` check counts a theme as wired when package.json `astryx.theme` names one or when the source of the app (JavaScript, TypeScript and CSS files, outside dependencies and build output; type-only imports do not count) imports the built module or stylesheet of a discovered theme, the same imports theme add writes, or passes one to Theme (followed through module-scope variables, defineTheme extends, re-exports and installed packages; only a theme whose package is installed, or a local theme, counts), naming the file; a theme passed to Theme that cannot be traced, such as a prop or a variable declared inside a component, is reported as unconfirmed (info), not as missing. Earlier descriptor-less copies are a non-failing upgrade warning. It never installs, writes, or mutates. It imports astryx.config, executes every added theme source while validating private inputs, and loads every recorded built theme module to prove its runtime imports work, including themes from installed packages. Local theme source also runs during build-freshness checks. Stylesheets are parsed without execution. Config and theme top-level code therefore run, so use doctor only with project code you trust. Outside a project it checks the computer instead: the Node version (`node-version`), the release that answered (`answering-release`), the newest release the computer knows of (`newest-release`), the astryx commands on the search path (`cli-on-path`), the integrations installed for the computer (`computer-integrations`: each one used outside a project, and a warning for one skipped because its peer range excludes the answering release or that fails to load), and the computer-level agent text (`computer-agent-text`): present and matching this release, present but different, edited, absent, or turned off, and where it is linked, with `{@command init --user}` as the fix for the stale and absent cases, and each folder outside a project that `{@command init} --to` saved. The agent-text check is always info. In a project that saves a skill place in astryx.config `skills.to`, or holds a project skill, the `skill-places` check passes when each saved skill file matches this release and warns when one is missing or stale, when the copies of one place differ (one edited or not written by Astryx, the other written by Astryx or missing), when the block and a project skill copy are both there without both being saved (both saved passes, with a note), when a project skill is named `astryx`, the name of the computer-level skill, when a saved place is linked out of the project (not checked), or when the project skill cannot be rendered; an edited skill file is kept and named. It also reports integration skills (`spec:AST-046` FR15): a missing, stale or kept copy, a leftover copy Astryx wrote for a skill that is no longer kept, and a skill an integration declares that is left out, the last also in a project that keeps only the AGENTS.md block. A project that saves no `agents-md` place gets its verdict from this check: `agent-docs` names its skill files and points here. The newest-release check also runs inside a project: it names a newer release when the computer knows of one; inside a project whose release is older it names the install and upgrade commands; outside one, when the CLI installed for the computer is older, it names the command of the package manager that installed it, after the Node the newest release needs when the computer runs an older one. With no update check recorded, it says the newest release is not known, that only a copy installed for the computer checks (once a day), that a project changes its own copy only when it upgrades it, and that a tool that runs its own copy chooses its release. It is always info and installs nothing. The `cli-on-path` check also runs inside a project: it lists every astryx command on the search path in order, passes when the first is a release that hands each project run to the release of that project, and warns when the first is another program or a release that predates the hand-off, naming `{@pm install @astryxdesign/cli@latest --global}`. Inside a project, `computer-integrations` lists, as info, the integrations installed for the computer that the project does not install, with its install command; they are not used there. It never fails a check because the folder has no project, and installs nothing.' +
    ' In global mode: with `cwd` outside a project, it checks the computer instead (the Node version, the version that answered, the newest version it knows of, the astryx commands on the search path, the integrations installed globally, and the agent guide for the computer) and never fails a check because the folder has no project. See {@link namespace:global} and {@link generic:who-answers}.',
  importPath: '@astryxdesign/cli/api',
  signature: 'doctor(options?: DoctorOptions): Promise<DoctorResponse>',
  keywords: ['doctor', 'diagnose', 'health', 'check', 'verify', 'environment'],
  params: [
    {
      name: 'options.cwd',
      type: 'string',
      description:
        'Directory to diagnose. A directory outside any project, a missing one included, gets the computer checks.',
      default: 'process.cwd()',
    },
    {
      name: 'options.built',
      type: 'string',
      description:
        "A finished build to check before you deliver it: a project folder, a build output folder, or one built `.html` file, relative to `cwd`. Adds its checks after the others. `built-astryx-usage` fails when the path holds no value import from an Astryx package (any `@astryxdesign/*` package or an integration the project installs), no component imported from one, and no Astryx styles in built CSS or HTML. When the output uses Astryx, `built-astryx-styles` warns when no built stylesheet or page under the path carries Core's component styles (the `astryx-base` layer of `@astryxdesign/core/astryx.css`) and no source file or stylesheet there imports them, since the components then render unstyled; it is info, not checked, when the path holds no built stylesheet or page, or when the project that holds the path compiles Core's styles from source (`withAstryx()` or `astryxStylex()` from `@astryxdesign/build` in its `next.config` or `vite.config`, an `@astryx;` rule in a stylesheet, or an `@stylex;` rule while its PostCSS config loads `@astryxdesign/build`). `built-astryx-purity` warns with the source check of `astryx docs is-my-code-good`: raw elements Astryx has a component for, raw SVG and icon-library icons, inline styles, classes, `stylex.create` and imported stylesheets (except the stylesheets a registered theme loads, and a setup stylesheet that only imports Astryx packages' CSS), each with its file and line, in `.tsx` and `.jsx` files and JSX in `.js` source, found by parsing it; it is info, not inspected, when the path holds no source with JSX, such as a bundle. It reads at most 20,000 files, each up to 5 MB, skipping installs and version control; when either limit leaves source unread and nothing was found, the purity check is info, not fully inspected, and when the file limit ends the read before any Astryx turns up, `built-astryx-usage` warns that the rest went unread instead of failing. Given one built `.html` file, it also reads the local stylesheets and scripts that page links, finding a root-relative link from the nearest folder above the page that holds it; a linked file that is not there makes `built-astryx-usage` warn instead of fail. An empty folder fails with nothing checked, like a missing path. A source tree counts as using Astryx through an import, a re-export (`export … from`) or a stylesheet `@import` of an Astryx package; a type-only import or re-export (`import type`, `export type`, or a list whose names are all `type`) does not count, since the build erases it. `--built` goes with `doctor` alone; a `doctor integration` check refuses it. A path that does not exist fails `built-astryx-usage` with nothing checked, and the purity check is left out. The integrations that count are the dependencies the nearest package.json above the path declares whose installed copy, found the way the CLI autolinks (a hoisted workspace copy included), has an integration manifest. The files under the path, and that configuration, are only read, never run. Without it, doctor runs exactly as before.",
    },
  ],
  returns: [
    {
      type: 'doctor',
      description:
        'The diagnostic report: `data.checks`, each with a stable id, label, `status` (`pass` | `warn` | `fail` | `info`), a one-line message, an optional `brief` (a short form of a long message, which text output prints in its place; `--json` keeps the whole message), and an optional `fix` (always present on `warn` and `fail`; some `info` checks carry one too); plus `data.summary` with counts per status.',
    },
  ],
  examples: [
    {
      label: 'Fail a CI step on any failed check',
      code: 'const r = await doctor();\nif (r.data.summary.fail > 0) process.exitCode = 1;',
    },
    {
      label: 'Diagnose a directory',
      code: "await doctor({cwd: '/path/to/app'});",
    },
    {
      label: 'Check a finished build before delivering it',
      code: "const r = await doctor({built: 'dist'});\nif (r.data.summary.fail > 0) throw new Error('Not built with Astryx');",
    },
  ],
  command: 'doctor',
  related: ['init', 'upgrade'],
};
