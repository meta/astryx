// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx upgrade`. The terminal binding of the `upgrade()`
 * function (referenced via `fn`); its args/flags map to that function's params
 * so a converter can build Commander config + --help from one source of truth.
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'upgrade',
  displayName: 'astryx upgrade',
  namespace: 'cli/commands',
  summary:
    'Update your code after upgrading Astryx, and refresh ShadCN-copied components',
  description:
    'Migrates project source from a previous Astryx version to the installed one by ' +
    'running the registered codemods, and refreshes the fully rendered managed ' +
    'agent-docs block when Core or configured integration guidance changes. ' +
    'Dry-run by default. --apply writes codemod and receipt changes, runs hooks, then refreshes agent docs. ' +
    'Anything a post-codemod hook prints goes to stderr, so stdout carries only the result. ' +
    'Run from a folder inside a project, it upgrades that project and names files in the result relative to the folder you ran it in. ' +
    'ShadCN-copied compositions are checked automatically during a normal upgrade, or alone with --registry. ' +
    'Outside a project, --list lists the codemods this release ships and --registry finds no copied compositions to update; ' +
    'a migration writes nothing and fails with ERR_VERSION_DETECT, because no installed Core names its target.',
  fn: 'upgrade',
  options: [
    {
      flag: '--from <version>',
      param: 'options.from',
      description:
        'Previous version before the dependency upgrade; required unless --list or --registry is set. ' +
        'The target is the installed @astryxdesign/core version, or legacy @xds/core when @astryxdesign/core is not installed',
    },
    {
      flag: '--apply',
      param: 'options.apply',
      description: 'Write changes to disk; without it, the run is a dry run',
      default: false,
    },
    {
      flag: '--force',
      param: 'options.force',
      description:
        'Run codemods even if --from is newer than the installed version',
      default: false,
    },
    {
      flag: '--codemod <name>',
      param: 'options.codemod',
      description:
        'Run only the named codemod. Optional codemods run only when named here; a normal run skips them. ' +
        'Also skips the check of ShadCN-copied compositions. An unknown name exits 1 with ERR_UNKNOWN_CODEMOD when the version range has codemods',
    },
    {
      flag: '--skip-codemod <name...>',
      param: 'options.skipCodemod',
      description:
        'Exclude named codemods (repeatable). Re-run past a failed codemod by skipping it.',
    },
    {
      flag: '--integration <package>',
      param: 'options.integration',
      description:
        'Explicit integration specifier (repeatable). Resolved beneath node_modules; absolute paths and `.` or `..` segments are rejected.',
      default: [],
    },
    {
      flag: '--path <dir>',
      param: 'options.path',
      description:
        "Source directory to scan, relative to where you run the command, however you spell it. Without --path, the project's src folder, from any folder in the project",
      default: './src at the project root',
    },
    {
      flag: '--install-deps',
      param: 'options.installDeps',
      description:
        'Install jscodeshift when it is missing. Without it, a missing jscodeshift fails the command with ERR_DEP_MISSING',
      default: false,
    },
    {
      flag: '--registry',
      param: 'options.registry',
      description:
        'Only update ShadCN-copied compositions from their install receipts: unchanged files are updated, ' +
        'edits that do not overlap are merged, and conflicts are left untouched; --from is not required. ' +
        'Combining it with --list, --from, --force, --codemod, --skip-codemod, --integration or --install-deps exits 1 with ERR_INVALID_ARGUMENT',
      default: false,
    },
    {
      flag: '--list',
      param: 'options.list',
      description:
        'List available codemods and do nothing else. Every other flag is refused, as is --registry (exit 1)',
      default: false,
    },
  ],
  examples: [
    {label: 'List available codemods', cli: 'astryx upgrade --list --json'},
    {
      label: 'Update ShadCN-copied compositions',
      cli: 'astryx upgrade --registry --apply',
    },
    {label: 'Apply a migration', cli: 'astryx upgrade --from 0.1.0 --apply'},
  ],
  outsideProject: 'own',
  exitCodes: [
    {code: 0, when: 'success, including complete dry-run previews'},
    {
      code: 1,
      when:
        'missing or invalid --from, --registry with --list or a migration flag, a --path escape, ' +
        'no installed @astryxdesign/core (or legacy @xds/core), jscodeshift missing and not installed by --install-deps, ' +
        'an astryx.config that fails validation and that no pending config codemod repairs, ' +
        'an unreadable or invalid protection declaration, a protected file that still requires a codemod change, ' +
        'an unknown codemod, a codemod or post-codemod hook failure, or unresolved registry items',
    },
  ],
  related: ['init', 'doctor'],
  notes: [
    {
      type: 'prose',
      text: "In global mode: in a project, upgrade runs the codemods of the project's own CLI, whichever astryx command you start; in a project with no CLI of its own, the astryx command you started runs them, so install the CLI at the new Core's version first (`{@command doctor}` prints the command). Outside a project, `--list` lists this version's codemods, `--registry` finds no copied compositions, and a migration writes nothing and stops with `ERR_VERSION_DETECT`. See {@link namespace:global} and {@link generic:who-answers}.",
    },
    {type: 'heading', level: 3, text: 'A CLI older than your Core'},
    {
      type: 'prose',
      text:
        'Core codemods ship inside the CLI, so a CLI older than the installed @astryxdesign/core has none for ' +
        'the releases after its own version. upgrade then says it cannot finish, never reports your code as up to date, ' +
        'and prints the same upgrade pinned to the CLI release that matches your Core, such as ' +
        '`cd <project> && npx @astryxdesign/cli@<core-version> upgrade --from <old-version> --path <source-dir> --apply`. ' +
        'It changes to the folder this run used and names the directory it scanned as an absolute path, both with ' +
        'symbolic links resolved, so pasted from any folder it upgrades the same code. It is written for a POSIX shell (sh, bash, zsh), or for PowerShell on Windows, ' +
        'with each argument quoted for that shell; cmd.exe is not a target. The codemods this CLI has still run. ' +
        'It exits 0, so a script checks the JSON: the result carries `cliBehindCore` with `cliVersion` (the newest release ' +
        'this CLI has codemods for) and `command`.',
    },
    {type: 'heading', level: 3, text: 'Protected files'},
    {
      type: 'prose',
      text:
        'Codemods never write to a file your project marks as generated, vendored, or ignored. ' +
        'upgrade reads these marks from the files on disk, so the answer is the same with any version control, or none. ' +
        'A file is protected when:',
    },
    {
      type: 'list',
      style: 'unordered',
      items: [
        'a `.gitattributes` file marks it `linguist-generated` or `linguist-vendored`',
        'its leading comment says `@generated`, `@partially-generated`, or `Code generated ... DO NOT EDIT.`',
        'a `.gitignore`, or the `.hgignore` at the project root, excludes it',
        'it is an installed dependency (such as anything in `node_modules`), is inside `.git`, `.hg`, or `.sl`, is a symbolic link, or is outside the project',
      ],
    },
    {
      type: 'prose',
      text:
        'upgrade does not scan installed dependencies or version-control folders at all, including through a symbolic link: ' +
        'a symlinked `node_modules`, or a link whose target is inside one or inside a package store such as `.yarn/cache`, is skipped. ' +
        'Other symbolically linked folders are scanned so a change they need is reported, but nothing is written through them.',
    },
    {
      type: 'prose',
      text:
        'Rules work as they do in Git: a later rule wins, so `linguist-generated=false` or a `!` line in an ignore file ' +
        'returns a file to normal handling. A folder name such as `dist` or `generated` protects nothing by itself. ' +
        'If a protection file cannot be read or parsed, upgrade stops with ERR_CODEMOD_PROTECTION_SOURCE before it writes anything.',
    },
    {
      type: 'code',
      lang: 'text',
      code:
        '# .gitattributes\n' +
        'generated/** linguist-generated=true\n' +
        'vendor/** linguist-vendored=true\n' +
        '\n' +
        '# A later rule returns one authored file to normal handling\n' +
        'generated/hand-authored.ts linguist-generated=false',
    },
    {
      type: 'prose',
      text:
        'When a codemod would change a protected file, upgrade makes the change only in memory and leaves the file as it is. ' +
        'The rest of the upgrade goes ahead. With --apply, your other files are written, then upgrade runs the ' +
        '`hooks.postCodemod` commands from astryx.config (see `{@command docs authoring config}`) and checks the protected ' +
        'files again. If one still needs the change, the run is incomplete: it exits 1, prints ' +
        'ERR_CODEMOD_PROTECTED with each file and the rule that protects it, and does not refresh the agent docs. ' +
        'Regenerate or edit those files, then run the same upgrade again. A dry run reports the same files and writes nothing.',
    },
    {
      type: 'prose',
      text:
        'With --json, the receipt says `complete: false` and `errorCode: "ERR_CODEMOD_PROTECTED"`. `modifiedFiles` lists the files ' +
        'upgrade changed (or would change), and `protectedFiles` lists each blocked file with its `reasons`, `declarations` ' +
        '(the rules that protect it), `codemods`, and `commands`. A generated file can name the command that rebuilds it on a ' +
        '`Command:` line in its header, such as `// Command: pnpm run gen:panel`; upgrade prints it as ' +
        '`Regenerate with: <command>` and lists it in `commands`.',
    },
    {
      type: 'prose',
      text:
        'A protected file a codemod cannot parse, such as a vendored bundle written for another toolchain, cannot need a ' +
        'change the codemod can prove, and upgrade never writes it. upgrade skips it, lists it under ' +
        '`declinedCandidates` with the parse error and where it occurred, and carries on; on its own it does not fail the run. ' +
        'If another codemod in the same upgrade still requires a change to that file (the 0.6.0 theme selector migration, for one, ' +
        'adds a TODO comment above a selector it cannot parse), the file is listed once, under `protectedFiles`, and the run is ' +
        'incomplete as for any protected file. A file upgrade owns that does not parse still fails the run with ERR_CODEMOD_FAILED.',
    },
    {type: 'heading', level: 3, text: 'A failed codemod'},
    {
      type: 'prose',
      text:
        'When a codemod or a `hooks.postCodemod` command fails, upgrade still makes every other change, exits 1 with ERR_CODEMOD_FAILED, and does not refresh the agent docs. ' +
        'With --json, the result is the usual error, `{"error": ..., "code": "ERR_CODEMOD_FAILED"}`, plus a `receipt`: the same fields a finished run returns, with `complete: false`, ' +
        'each failure in `errors`, and every file upgrade changed (or would change) in `modifiedFiles`, so a script can review, keep, or revert them. ' +
        'An error that stops the run after codemods have written files, such as an astryx.config that fails validation, carries a `receipt` too. ' +
        'Rerun past a failed codemod with --skip-codemod.',
    },
  ],
};
