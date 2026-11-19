// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The command that runs the CLI for this project, when something other
 * than the package-manager guess says what it is.
 *
 * `getCliInvocation` (package-manager.mjs) is the one picker every printed
 * command goes through. It asks, in order:
 *
 * 1. **The integrations** — the `cliCommand` field of each loaded
 *    integration's manifest. `Project.load` records them per project with
 *    {@link recordDeclaredSettings}, which also records each integration's
 *    `installGuidance` (read by {@link installGuidanceFor}). One command,
 *    declared by one or more integrations, is used. Two different commands cancel each other out: the
 *    picker falls back to its guess, even when a host set a door, and
 *    `astryx doctor` warns.
 * 2. **The door** — the command a host ran this call through. A host sets it
 *    for the duration of one call with {@link runWithCliDoor}; nothing in the
 *    public API sets it yet, so it is empty in every plain run.
 * 3. **The guess** — the package-manager prefix, as before.
 *
 * @input A host's door name; the loaded integrations of a project.
 * @output The declared command for a directory, or the conflict.
 * @position foundation/env — read by the picker and by `astryx doctor`.
 */

import {AsyncLocalStorage} from 'node:async_hooks';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * One integration's declared command.
 * @typedef {object} DeclaredCliCommand
 * @property {string} package the integration package that declared it
 * @property {string} command its `cliCommand` value
 */

/** @type {AsyncLocalStorage<{command: string}>} */
const doorScope = new AsyncLocalStorage();

/**
 * Run `fn` with `command` as the door printed commands start with. The slot a
 * host fills for one call. An integration's `cliCommand` still comes first,
 * and conflicting ones still fall back to the guess.
 * @template T
 * @param {string} command e.g. `astryx` for a global launcher
 * @param {() => T} fn
 * @returns {T}
 */
export function runWithCliDoor(command, fn) {
  return doorScope.run({command}, fn);
}

/**
 * The door of the current call, if a host set one.
 * @returns {string | undefined}
 */
export function cliDoor() {
  return doorScope.getStore()?.command;
}

/**
 * A setting an integration's manifest declares for the projects that load
 * it: the command that runs the CLI, or how an app adds a dependency.
 * @typedef {'cliCommand' | 'installGuidance'} DeclaredSetting
 */

/**
 * One integration's value for one setting.
 * @typedef {object} DeclaredValue
 * @property {string} package the integration package that declared it
 * @property {string} value
 */

/**
 * What a project's loaded integrations declare, per project: each one's
 * name and settings. One record for every setting, so each is read from the
 * same load.
 * @type {Map<string, Array<{name: string, cliCommand?: string, installGuidance?: string}>>}
 */
const declaredByProject = new Map();

/**
 * The directory a project is keyed by: the nearest one with a package.json,
 * the same root `Project.load` resolves; otherwise the directory itself.
 * @param {string} dir
 * @returns {string}
 */
function projectKey(dir) {
  const start = path.resolve(dir);
  let current = start;
  for (;;) {
    if (fs.existsSync(path.join(current, 'package.json'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}

/**
 * The values a set of loaded integrations declares for `setting`, in load
 * order. An integration that failed to load, or was set aside for a provider
 * conflict, contributes nothing, so it declares nothing either.
 * @param {ReadonlyArray<{name?: string, __spec?: string, cliCommand?: string, installGuidance?: string, __loadError?: string, __providerConflict?: unknown}>} integrations
 * @param {DeclaredSetting} setting
 * @returns {DeclaredValue[]}
 */
export function declaredValuesOf(integrations, setting) {
  /** @type {DeclaredValue[]} */
  const declared = [];
  for (const integration of integrations) {
    if (integration.__loadError != null) continue;
    if (integration.__providerConflict != null) continue;
    const value = integration[setting];
    if (typeof value !== 'string') continue;
    declared.push({
      package: integration.name ?? integration.__spec ?? '(unnamed)',
      value,
    });
  }
  return declared;
}

/**
 * Choose among declarations: one value, declared by one or more
 * integrations, is used; different values are a conflict.
 * @param {DeclaredValue[]} declared
 * @returns {{value?: string, conflict: boolean, declared: DeclaredValue[]}}
 */
export function chooseDeclaredValue(declared) {
  const values = new Set(declared.map(entry => entry.value));
  if (values.size === 1) {
    return {value: declared[0].value, conflict: false, declared};
  }
  return {conflict: values.size > 1, declared};
}

/**
 * The commands a set of loaded integrations declares, in load order.
 * @param {Parameters<typeof declaredValuesOf>[0]} integrations
 * @returns {DeclaredCliCommand[]}
 */
export function declaredCliCommandsOf(integrations) {
  return declaredValuesOf(integrations, 'cliCommand').map(entry => ({
    package: entry.package,
    command: entry.value,
  }));
}

/**
 * Choose among declarations: one command, declared by one or more
 * integrations, is used; different commands are a conflict.
 * @param {DeclaredCliCommand[]} declared
 * @returns {{command?: string, conflict: boolean, declared: DeclaredCliCommand[]}}
 */
export function chooseDeclaredCliCommand(declared) {
  const {value, conflict} = chooseDeclaredValue(
    declared.map(entry => ({package: entry.package, value: entry.command})),
  );
  return value == null
    ? {conflict, declared}
    : {command: value, conflict, declared};
}

/**
 * Record the settings a project's loaded integrations declare. Called by
 * `Project.load` each time it resolves the integration set; the latest load
 * wins.
 * @param {string} projectDir
 * @param {Parameters<typeof declaredValuesOf>[0]} integrations
 * @returns {void}
 */
export function recordDeclaredSettings(projectDir, integrations) {
  declaredByProject.set(
    projectKey(projectDir),
    integrations
      .filter(
        each => each.__loadError == null && each.__providerConflict == null,
      )
      .map(each => ({
        name: each.name ?? each.__spec ?? '(unnamed)',
        ...(typeof each.cliCommand === 'string'
          ? {cliCommand: each.cliCommand}
          : {}),
        ...(typeof each.installGuidance === 'string'
          ? {installGuidance: each.installGuidance}
          : {}),
      })),
  );
}

/**
 * Whether this process has loaded the project at `targetDir`.
 * @param {string} [targetDir=process.cwd()]
 * @returns {boolean}
 */
export function hasRecordedProject(targetDir = process.cwd()) {
  return declaredByProject.has(projectKey(targetDir));
}

/**
 * What the integrations of the project at `targetDir` declare for `setting`,
 * as recorded by its last `Project.load` in this process; see
 * {@link chooseDeclaredValue}.
 * @param {DeclaredSetting} setting
 * @param {string} [targetDir=process.cwd()]
 * @returns {{value?: string, conflict: boolean, declared: DeclaredValue[]}}
 */
export function declaredSetting(setting, targetDir = process.cwd()) {
  return chooseDeclaredValue(
    declaredValuesOf(
      declaredByProject.get(projectKey(targetDir)) ?? [],
      setting,
    ),
  );
}

/**
 * How an app in the project at `targetDir` adds `packages`, when its
 * integrations say the package manager's add command is the wrong step there
 * (`installGuidance`): their one line with `{packages}` filled in. Undefined
 * when no loaded integration gives one, when two give different lines, or
 * when this process has not loaded the project.
 * @param {string[]} packages the packages to add, each as the step names it
 * @param {string} [targetDir=process.cwd()]
 * @returns {string | undefined}
 */
export function installGuidanceFor(packages, targetDir = process.cwd()) {
  return declaredSetting('installGuidance', targetDir).value?.replaceAll(
    '{packages}',
    packages.join(' '),
  );
}

/**
 * What the integrations of the project at `targetDir` declare, as recorded by
 * its last `Project.load` in this process; see
 * {@link chooseDeclaredCliCommand}.
 * @param {string} [targetDir=process.cwd()]
 * @returns {{command?: string, conflict: boolean, declared: DeclaredCliCommand[]}}
 */
export function declaredCliCommand(targetDir = process.cwd()) {
  return chooseDeclaredCliCommand(
    declaredCliCommandsOf(declaredByProject.get(projectKey(targetDir)) ?? []),
  );
}
