// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx integration add theme` — scaffold one strongly typed,
 * same-stem source/descriptor pair into an integration package, declare the
 * themes root on first use, and add the built module and stylesheet exports.
 *
 * `--from <base>` forks an existing theme's source files as the starting point
 * instead of writing a blank `defineTheme` skeleton.
 */

import * as fs from 'node:fs';
import {isBuiltin} from 'node:module';
import * as path from 'node:path';
import {AstryxError} from '../error.mjs';
import {CLI_ROOT} from '../../foundation/fs/paths.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {
  assertWithin,
  PathSafetyError,
} from '../../foundation/fs/path-safety.mjs';
import {
  discoverBundledThemes,
  discoverThemeDirectory,
  themeFileImports,
} from '../../foundation/discovery/theme-discovery.mjs';
import {
  findLocalIntegrationManifestOrNull,
  IntegrationRootConflictError,
  patchIntegrationRoot,
} from '../../foundation/integrations/manifest-writer.mjs';
import {loadManifestObject} from '../../foundation/integrations/integrations.mjs';
import {themeDescriptorSource} from '../../foundation/integrations/theme-descriptor.mjs';
import {assertContributionVisible} from '../../foundation/integrations/contribution-inventory.mjs';
import {
  THEMES_CLI,
  themesCliProblem,
  withCliPeer,
} from '../../foundation/integrations/cli-requirement.mjs';
import {stripCopyrightHeader} from '../../foundation/text/copyright-header.mjs';
import {
  applyWrites,
  findPackageDir,
  packageJsonUpdate,
  projectPath,
} from './add-helpers.mjs';

import {
  renameDefinedTheme,
  renameThemeFile,
  rewriteThemeSource,
  themeIdentity,
} from '../theme/_fork.mjs';

const DEFAULT_THEMES_ROOT = './themes';

/** @param {{slug: string, exportName: string}} identity */
function themeSource(identity) {
  return `import {defineTheme} from '@astryxdesign/core/theme';\n\nexport const ${identity.exportName} = defineTheme({\n  name: '${identity.slug}',\n});\n`;
}

/** @param {{slug: string, displayName: string}} identity */
function themeDescriptor(identity) {
  return themeDescriptorSource({
    type: 'theme',
    name: identity.slug,
    displayName: identity.displayName,
    description: `${identity.displayName} theme.`,
    maintained: true,
  });
}

// ── --from: resolve and fork a base theme ───────────────────────────

/**
 * Resolve a theme slug to its discovered record, searching the bundled themes
 * and the package's own themes root (when it has one).
 * @param {string} slug
 * @param {string} packageDir
 * @param {string} owner
 * @param {string | undefined} themesRoot  resolved absolute themes root, if any
 * @returns {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme}
 */
function resolveBaseTheme(slug, packageDir, owner, themesRoot) {
  const normalized = slug.toLowerCase();

  /** @type {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme[]} */
  let candidates = [];
  try {
    candidates = discoverBundledThemes();
  } catch {
    // Bundled themes unavailable — not fatal, package themes may suffice.
  }

  // Also check the package's own themes root.
  if (themesRoot && fs.existsSync(themesRoot)) {
    try {
      candidates = [
        ...candidates,
        ...discoverThemeDirectory(themesRoot, owner),
      ];
    } catch {
      // A broken local root is not the caller's problem here.
    }
  }

  const match = candidates.find(t => t.slug.toLowerCase() === normalized);
  if (!match) {
    throw new AstryxError(
      `Unknown base theme "${slug}". Available themes: ${candidates.map(t => t.slug).join(', ') || '(none)'}.`,
      candidates.map(t => ({
        name: t.slug,
        reason: t.bundled ? 'bundled theme' : `provided by ${t.package}`,
      })),
      ERROR_CODES.ERR_UNKNOWN_THEME,
    );
  }
  return match;
}

/** What every app that uses Astryx already has: Core, and React through Core's peers. */
const APP_PROVIDED = new Set(['@astryxdesign/core', 'react', 'react-dom']);

/**
 * The npm package a module specifier names, or null for a relative path, an
 * absolute path, or a Node built-in.
 * @param {string} specifier
 * @returns {string | null}
 */
function packageOfSpecifier(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null;
  if (isBuiltin(specifier)) return null;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/**
 * The npm packages a fork's copied files import that its package does not
 * declare yet, each at the range the bundled themes are built against (the
 * CLI's own package.json). The fork depends on them at runtime, so an app that
 * installs the package needs them too. Derived from the imports, not copied
 * from a base's whole dependency list. Core and React are left out, since every
 * Astryx app has them; so is a fork of the package's own theme, whose imports
 * the package already resolves.
 *
 * @param {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme} base
 * @param {Record<string, any>} pkg - The package's package.json.
 * @returns {Record<string, string>} package name to range
 */
function forkDependencies(base, pkg) {
  if (!base.bundled) return {};
  /** @type {Record<string, any>} */
  let cli;
  try {
    cli = JSON.parse(
      fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf-8'),
    );
  } catch {
    return {};
  }
  /** @type {Record<string, string>} */
  const ranges = {
    ...cli.devDependencies,
    ...cli.peerDependencies,
    ...cli.dependencies,
  };
  const declared = {
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
    ...pkg.dependencies,
  };
  /** @type {Record<string, string>} */
  const needed = {};
  for (const file of base.files) {
    const code = /\.(?:[cm]?[jt]sx?)$/u.test(file);
    if (!code || file.endsWith('.doc.mjs')) continue;
    let specifiers;
    try {
      specifiers = themeFileImports(path.join(base.sourceDir, file));
    } catch {
      continue; // discovery already refuses a theme whose source does not parse
    }
    for (const specifier of specifiers) {
      const name = packageOfSpecifier(specifier);
      if (name == null || APP_PROVIDED.has(name) || name in declared) continue;
      if (typeof ranges[name] === 'string') needed[name] = ranges[name];
    }
  }
  return needed;
}

/**
 * Build the write plans for a forked theme.
 * @param {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme} base
 * @param {ReturnType<typeof themeIdentity>} identity  new theme identity
 * @param {string} themeDir  absolute target directory
 * @returns {import('./add-helpers.mjs').WritePlan[]}
 */
function forkThemePlans(base, identity, themeDir) {
  const baseIdentity = themeIdentity(base.slug);
  /** @type {import('./add-helpers.mjs').WritePlan[]} */
  const plans = [];

  // Copy every file the base theme ships (entry first, then the rest), except
  // the descriptor — we write a fresh one.
  const filesToCopy = base.files.filter(
    file => path.posix.basename(file) !== `${baseIdentity.exportName}.doc.mjs`,
  );

  for (const file of filesToCopy) {
    const srcPath = path.join(base.sourceDir, file);
    const newFileName = renameThemeFile(
      file,
      baseIdentity.identifier,
      identity.identifier,
    );
    const destPath = assertWithin(newFileName, themeDir, {
      label: `forked theme file "${newFileName}"`,
    });

    // Read source bytes; for text, strip copyright and rewrite identifiers.
    const bytes = fs.readFileSync(srcPath);
    const text = bytes.toString('utf-8');
    const isText = Buffer.from(text, 'utf-8').equals(bytes);

    /** @type {string | Buffer} */
    let contents;
    if (isText) {
      contents = rewriteThemeSource(
        stripCopyrightHeader(text),
        base.slug,
        baseIdentity.identifier,
        identity.slug,
        identity.identifier,
      );
      // The entry's defineTheme name, wherever it sits (a double-quoted name,
      // one after `extends`), is the fork's, as the build names its files.
      if (file === base.files[0])
        contents = renameDefinedTheme(contents, identity.slug) ?? contents;
    } else {
      contents = bytes;
    }
    plans.push({path: destPath, contents, createOnly: true});
  }

  // Write a fresh descriptor — the fork is a new theme, not a derivative.
  const descriptorPath = assertWithin(identity.descriptor, themeDir, {
    label: 'theme descriptor file',
  });
  plans.push({
    path: descriptorPath,
    contents: themeDescriptor(identity),
    createOnly: true,
  });

  return plans;
}

/**
 * Read bytes back through the same discovery seam Project uses. A write is not
 * successful until the requested slug resolves.
 * @param {string} packageDir
 * @param {string} manifestFile
 * @param {string} owner
 * @param {string} slug
 */
async function verifyThemeContribution(packageDir, manifestFile, owner, slug) {
  const manifest = await loadManifestObject(
    manifestFile,
    `Integration manifest ${path.basename(manifestFile)}`,
    {fresh: true},
  );
  if (!manifest.themes) {
    throw new Error('The themes root was not visible after writing.');
  }
  const themesRoot = assertWithin(manifest.themes, packageDir, {
    label: 'themes root',
  });
  await assertContributionVisible(
    {
      name: owner,
      themes: themesRoot,
    },
    'theme',
    slug,
  );
}

/**
 * Add one source theme to the local integration package.
 * @param {string} name lowercase kebab-case theme slug
 * @param {import('./integration-authoring.type.mjs').IntegrationAddThemeOptions} [options]
 * @returns {Promise<import('./integration-authoring.type.mjs').IntegrationAddResponse>}
 */
export async function integrationAddTheme(name, options = {}) {
  const {cwd = process.cwd(), dryRun = false, from} = options;
  const packageDir = findPackageDir(cwd);
  const packageFile = path.join(packageDir, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(packageFile, 'utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AstryxError(
      `Cannot read package.json: ${message}`,
      undefined,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  const owner = typeof pkg.name === 'string' ? pkg.name : '(local integration)';
  const identity = themeIdentity(name);
  let manifestFile;
  let manifestExists;
  /** @type {import('../../authoring/integration/type').AstryxIntegration} */
  let manifest = {};
  try {
    const existingManifest = findLocalIntegrationManifestOrNull(packageDir);
    manifestExists = existingManifest != null;
    manifestFile =
      existingManifest ?? path.join(packageDir, 'astryx.integration.mjs');
    if (manifestExists) {
      manifest = await loadManifestObject(
        manifestFile,
        `Integration manifest ${path.basename(manifestFile)}`,
        {fresh: true},
      );
    }
  } catch (error) {
    throw new AstryxError(
      error instanceof Error ? error.message : String(error),
      undefined,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }

  const rootPath = manifest.themes ?? DEFAULT_THEMES_ROOT;
  let root;
  try {
    root = assertWithin(rootPath, packageDir, {label: 'themes root'});
  } catch (error) {
    if (error instanceof PathSafetyError) {
      throw new AstryxError(
        error.message,
        undefined,
        ERROR_CODES.ERR_PATH_TRAVERSAL,
      );
    }
    throw error;
  }

  let rootReceipt;
  try {
    rootReceipt = await patchIntegrationRoot(packageDir, 'themes', rootPath, {
      dryRun: true,
      createIfMissing: true,
    });
    if (fs.existsSync(root)) {
      discoverThemeDirectory(root, owner);
    }
  } catch (error) {
    if (error instanceof IntegrationRootConflictError) {
      throw new AstryxError(
        error.message,
        undefined,
        ERROR_CODES.ERR_INTEGRATION_ROOT_CONFLICT,
      );
    }
    throw new AstryxError(
      error instanceof Error ? error.message : String(error),
      undefined,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }

  const themeDir = assertWithin(identity.slug, root, {
    label: 'theme directory',
  });

  // Resolve the base theme when --from is given, before writing anything.
  /** @type {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme | undefined} */
  let baseTheme;
  if (from != null) {
    if (from === name) {
      throw new AstryxError(
        `Cannot fork theme "${from}" into itself.`,
        undefined,
        ERROR_CODES.ERR_INVALID_ARGUMENT,
      );
    }
    baseTheme = resolveBaseTheme(from, packageDir, owner, root);
  }

  /** @type {import('./add-helpers.mjs').WritePlan[]} */
  let plans;

  if (baseTheme) {
    // Fork: copy the base theme's files, renamed and rewritten.
    plans = forkThemePlans(baseTheme, identity, themeDir);
    // Check that no target file already exists.
    for (const plan of plans) {
      if (fs.existsSync(plan.path)) {
        throw new AstryxError(
          `Refusing to overwrite existing file ${projectPath(path.relative(packageDir, plan.path))}.`,
          undefined,
          ERROR_CODES.ERR_FILE_EXISTS,
        );
      }
    }
  } else {
    // Blank scaffold.
    const sourceFile = assertWithin(identity.entry, themeDir, {
      label: 'theme source file',
    });
    const descriptorFile = assertWithin(identity.descriptor, themeDir, {
      label: 'theme descriptor file',
    });
    for (const file of [sourceFile, descriptorFile]) {
      if (fs.existsSync(file)) {
        throw new AstryxError(
          `Refusing to overwrite existing file ${projectPath(path.relative(packageDir, file))}.`,
          undefined,
          ERROR_CODES.ERR_FILE_EXISTS,
        );
      }
    }
    plans = [
      {path: sourceFile, contents: themeSource(identity), createOnly: true},
      {
        path: descriptorFile,
        contents: themeDescriptor(identity),
        createOnly: true,
      },
    ];
  }

  const outputBase = projectPath(
    path.relative(packageDir, path.join(themeDir, identity.slug)),
  );
  let packageUpdate = packageJsonUpdate(
    packageFile,
    rootPath,
    path.basename(manifestFile),
    [
      {
        subpath: `themes/${identity.slug}`,
        target: `${outputBase}.js`,
      },
      {
        subpath: `themes/${identity.slug}.css`,
        target: `${outputBase}.css`,
      },
    ],
    {createExports: true, sideEffects: ['**/*.css']},
  );
  // A CLI older than the one that reads typed theme descriptors rejects the
  // themes root and withholds the package's themes and docs. Declare the CLI
  // that reads them as a peer, so an older one is flagged at install instead.
  {
    const expectedOriginal =
      packageUpdate?.expectedOriginal ?? fs.readFileSync(packageFile);
    const text = packageUpdate?.contents ?? expectedOriginal.toString('utf-8');
    const current = JSON.parse(text);
    let next =
      themesCliProblem(current) != null
        ? withCliPeer(current, THEMES_CLI)
        : current;
    // A fork runs the base's imports: declare the packages they come from.
    const forked = baseTheme ? forkDependencies(baseTheme, next) : {};
    if (Object.keys(forked).length > 0) {
      const dependencies = {...next.dependencies, ...forked};
      next = {
        ...next,
        dependencies: Object.fromEntries(
          Object.keys(dependencies)
            .sort()
            .map(name => [name, dependencies[name]]),
        ),
      };
    }
    if (next !== current) {
      packageUpdate = {
        contents:
          JSON.stringify(next, null, 2) + (text.endsWith('\n') ? '\n' : ''),
        expectedOriginal,
      };
    }
  }
  if (packageUpdate != null) {
    plans.push({
      path: packageFile,
      contents: packageUpdate.contents,
      createOnly: false,
      expectedOriginal: packageUpdate.expectedOriginal,
    });
  }

  const writtenFiles = plans.map(plan =>
    projectPath(path.relative(packageDir, plan.path)),
  );
  const manifestPath = projectPath(path.relative(packageDir, manifestFile));

  if (!dryRun) {
    let rollback = () => {};
    try {
      rollback = applyWrites(plans);
      rootReceipt = await patchIntegrationRoot(packageDir, 'themes', rootPath, {
        createIfMissing: true,
        verify: () =>
          verifyThemeContribution(
            packageDir,
            manifestFile,
            owner,
            identity.slug,
          ),
      });
    } catch (error) {
      rollback();
      if (error instanceof IntegrationRootConflictError) {
        throw new AstryxError(
          error.message,
          undefined,
          ERROR_CODES.ERR_INTEGRATION_ROOT_CONFLICT,
        );
      }
      if (error instanceof AstryxError) throw error;
      throw new AstryxError(
        `Failed to write theme contribution: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        ERROR_CODES.ERR_WRITE_FAILED,
      );
    }
  }
  if (rootReceipt.created && !writtenFiles.includes(manifestPath)) {
    writtenFiles.push(manifestPath);
  }

  /** @type {import('./integration-authoring.type.mjs').IntegrationAddResponse} */
  const response = {
    type: 'integration.add',
    data: {
      kind: 'theme',
      name: identity.slug,
      root: rootReceipt,
      manifest: manifestPath,
      files: writtenFiles,
      written: !dryRun,
      dryRun,
    },
  };
  if (from != null) {
    response.data.from = from;
  }
  return response;
}
