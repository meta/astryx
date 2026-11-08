// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared identities, paths, and commands for Astryx shadcn Registry items.
 * @input Stable doc names, template slugs, and optional registry overrides.
 * @output Deterministic global item names, organized paths, aliases, and commands.
 * @position Shared contract between registry generation and docsite UI.
 */

const CORE_PACKAGE = '@astryxdesign/core';
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RELATIVE_PATH_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const REGISTRY_IDENTITY_KEYS = new Set(['slug', 'aliases']);

// SYNC: apps/docsite/package.json. Receipt JavaScript variants mirror this
// client's transform, so generated install commands must pin the tested client.
export const SHADCN_CLI_VERSION = '4.19.0';

export function resolveShadcnRegistryOrigin(env = process.env) {
  const explicitOrigin = env.NEXT_PUBLIC_ASTRYX_REGISTRY_ORIGIN;
  if (explicitOrigin) {
    return explicitOrigin.replace(/\/$/, '');
  }

  const siteOrigin =
    env.NEXT_PUBLIC_SITE_URL ??
    (env.VERCEL_URL
      ? `https://${env.VERCEL_URL}`
      : 'https://astryx.atmeta.com');
  return `${siteOrigin.replace(/\/$/, '')}/shadcn`;
}

export const SHADCN_REGISTRY_ORIGIN = resolveShadcnRegistryOrigin();

export const SHADCN_REGISTRY_IS_PREVIEW =
  SHADCN_REGISTRY_ORIGIN !== 'https://astryx.atmeta.com/shadcn';

export function slugifyRegistryName(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function assertSlug(value, label) {
  if (!SLUG_PATTERN.test(value)) {
    throw new Error(
      `${label} must be a lowercase kebab-case slug; received ${JSON.stringify(value)}`,
    );
  }
  return value;
}

function registrySlug(registry, fallback, label) {
  if (registry == null) {
    return assertSlug(slugifyRegistryName(fallback), label);
  }
  if (typeof registry !== 'object' || Array.isArray(registry)) {
    throw new Error(`${label} registry metadata must be an object`);
  }
  const unknownKeys = Object.keys(registry).filter(
    key => !REGISTRY_IDENTITY_KEYS.has(key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      `${label} registry metadata has unknown field(s): ${unknownKeys.join(', ')}`,
    );
  }
  return assertSlug(
    registry.slug ?? slugifyRegistryName(fallback),
    `${label} registry.slug`,
  );
}

function registryAliases(registry, root, defaultParent, canonicalPath, label) {
  if (registry?.aliases == null) {
    return [];
  }
  if (!Array.isArray(registry.aliases)) {
    throw new Error(`${label} registry.aliases must be an array`);
  }
  const aliases = registry.aliases.map(alias => {
    if (typeof alias !== 'string' || !RELATIVE_PATH_PATTERN.test(alias)) {
      throw new Error(
        `${label} registry alias must be a lowercase kebab-case relative path; received ${JSON.stringify(alias)}`,
      );
    }
    const relativePath = alias.includes('/')
      ? alias
      : defaultParent
        ? `${defaultParent}/${alias}`
        : alias;
    return `${root}/${relativePath}`;
  });
  if (aliases.includes(canonicalPath)) {
    throw new Error(`${label} registry.aliases contains its canonical path`);
  }
  return [...new Set(aliases)].sort();
}

function packageSlug(packageName) {
  return slugifyRegistryName(packageName.replace(/^@astryxdesign\//, ''));
}

export function componentRegistryIdentity(
  packageName,
  componentName,
  isHook = false,
  registry = null,
) {
  const kind = isHook ? 'hook' : 'component';
  const root = isHook ? 'hooks' : 'components';
  const slug = registrySlug(
    registry,
    componentName,
    `${kind} ${componentName}`,
  );
  const packagePart =
    packageName === CORE_PACKAGE ? '' : `${packageSlug(packageName)}/`;
  const namePackagePart =
    packageName === CORE_PACKAGE ? '' : `${packageSlug(packageName)}-`;
  const path = `${root}/${packagePart}${slug}`;
  return {
    kind,
    name: `${kind}-${namePackagePart}${slug}`,
    path,
    aliases: registryAliases(
      registry,
      root,
      packagePart.replace(/\/$/, ''),
      path,
      `${kind} ${componentName}`,
    ),
  };
}

function blockLeafSlug(blockName, exampleFor, registry, kind) {
  const fullSlug = slugifyRegistryName(blockName);
  const parentSlug = slugifyRegistryName(exampleFor);
  const derived = fullSlug.startsWith(`${parentSlug}-`)
    ? fullSlug.slice(parentSlug.length + 1)
    : fullSlug === parentSlug
      ? 'default'
      : fullSlug;
  const fallback = derived === kind ? 'default' : derived;
  return registrySlug(registry, fallback, `${kind} ${blockName}`);
}

export function blockRegistryIdentity(
  blockName,
  exampleFor = null,
  isShowcase = false,
  registry = null,
) {
  if (!exampleFor) {
    if (isShowcase) {
      throw new Error(
        `showcase ${blockName} requires exampleFor; standalone blocks cannot be component showcases`,
      );
    }
    const slug = registrySlug(registry, blockName, `block ${blockName}`);
    const path = `blocks/${slug}`;
    return {
      kind: 'block',
      name: `block-${slug}`,
      path,
      aliases: registryAliases(
        registry,
        'blocks',
        '',
        path,
        `block ${blockName}`,
      ),
    };
  }

  const kind = isShowcase ? 'showcase' : 'example';
  const root = isShowcase ? 'showcases' : 'examples';
  const parentSlug = assertSlug(
    slugifyRegistryName(exampleFor),
    `${kind} ${blockName} exampleFor`,
  );
  const slug = blockLeafSlug(blockName, exampleFor, registry, kind);
  const path = `${root}/${parentSlug}/${slug}`;
  return {
    kind,
    name: `${kind}-${parentSlug}-${slug}`,
    path,
    aliases: registryAliases(
      registry,
      root,
      parentSlug,
      path,
      `${kind} ${blockName}`,
    ),
  };
}

export function pageRegistryIdentity(templateSlug, registry = null) {
  const slug = registrySlug(registry, templateSlug, `template ${templateSlug}`);
  const path = `templates/${slug}`;
  return {
    kind: 'page',
    name: `template-${slug}`,
    path,
    aliases: registryAliases(
      registry,
      'templates',
      '',
      path,
      `template ${templateSlug}`,
    ),
  };
}

const NAME_PREFIX_BY_ROOT = {
  components: 'component',
  hooks: 'hook',
  showcases: 'showcase',
  examples: 'example',
  blocks: 'block',
  templates: 'template',
};

/**
 * The item name an organized path stands for: the singular kind root followed
 * by the remaining path segments, joined with hyphens. Every item's name equals
 * the name of its canonical path, and an alias path names the item it used to
 * be, so a renamed item keeps answering at its old `<name>.json` too.
 */
export function registryNameForPath(registryPath) {
  const [root, ...rest] = registryPath.split('/');
  const prefix = NAME_PREFIX_BY_ROOT[root];
  if (prefix == null || rest.length === 0) {
    throw new Error(
      `registry path ${JSON.stringify(registryPath)} does not start with a kind folder`,
    );
  }
  return `${prefix}-${rest.join('-')}`;
}

export function shadcnComponentItemName(
  packageName,
  componentName,
  isHook = false,
  registry = null,
) {
  return componentRegistryIdentity(packageName, componentName, isHook, registry)
    .name;
}

export function shadcnComponentItemPath(
  packageName,
  componentName,
  isHook = false,
  registry = null,
) {
  return componentRegistryIdentity(packageName, componentName, isHook, registry)
    .path;
}

export function shadcnBlockItemName(
  blockName,
  exampleFor = null,
  isShowcase = false,
  registry = null,
) {
  return blockRegistryIdentity(blockName, exampleFor, isShowcase, registry)
    .name;
}

export function shadcnBlockItemPath(
  blockName,
  exampleFor = null,
  isShowcase = false,
  registry = null,
) {
  return blockRegistryIdentity(blockName, exampleFor, isShowcase, registry)
    .path;
}

export function shadcnPageItemName(templateSlug, registry = null) {
  return pageRegistryIdentity(templateSlug, registry).name;
}

export function shadcnPageItemPath(templateSlug, registry = null) {
  return pageRegistryIdentity(templateSlug, registry).path;
}

export function shadcnInstallCommand(
  itemPath,
  registryOrigin = SHADCN_REGISTRY_ORIGIN,
) {
  return `npx shadcn@${SHADCN_CLI_VERSION} add ${registryOrigin}/${itemPath}.json`;
}
