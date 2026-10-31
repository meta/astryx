// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-raw-private-attribute.js
 * @description Reports a private `data-astryx-*` attribute written by hand
 * outside its owner module (`architecture:public-component-api` INV23).
 *
 * A `data-astryx-*` attribute is private unless INV23 names it public. Each
 * private attribute has one owner module in the package that writes it,
 * `packages/<package>/src/privateAttributes/<name>.stylex.ts`, that writes its
 * name and selectors once and exports ready-made styles, setter props and the
 * runtime readers its package needs. Every other file spreads those exports,
 * so the attribute can be renamed or reshaped in one place and never leaks
 * into the public surface by accident.
 *
 * Reported, outside the owner modules:
 *   - a string literal that contains `data-astryx-<name>`, in any position
 *     (an object key, a `setAttribute` argument, a selector inside
 *     `stylex.create` or `stylex.when.*`, a `.doc.mjs` description);
 *   - a template literal that does, including one built from the namespace
 *     constant (`data-${dataAttrNamespace}-press`);
 *   - a JSX attribute named `data-astryx-<name>`;
 *   - a `dataAttr('<name>')` call that names a private attribute.
 * A name the rule cannot read (`data-astryx-${part}`, `dataAttr(name)`) is
 * reported as `data-astryx-*`: it cannot be shown to be public.
 *
 * Inside an owner module, only its own attribute may be written, and the
 * module may not export the raw name or a selector as a string. Anywhere, an
 * import of another package's owner module is reported: a private attribute
 * stays inside the package that writes it.
 *
 * Public, never reported: the names INV23 lists (`PUBLIC_ATTRIBUTES`).
 * `naming.ts`, which builds every `data-astryx-*` name, is not checked.
 *
 * Known limitations: a name assembled with `+` or read through
 * `element.dataset` is not seen; no shipped source does either today, and
 * public-API review covers them.
 *
 * Options: `{baseline: {[repoRelativeFile]: string[]}, root: string}`. The
 * baseline lists, per file, each private attribute once per site that
 * predates the rule; that many sites stay allowed until moved into the owner
 * module, and one more is reported. The list only shrinks.
 * `no-raw-private-attribute.baseline.mjs` writes it.
 */

import path from 'node:path';

/**
 * Where the repository config enforces the rule with its baseline: shipped
 * package source. Tests, stories and test helpers never ship, and they read
 * attributes back from the DOM to check behavior, so they may name them.
 * Shared with the baseline script so both lint the same files.
 */
export const scope = {
  files: ['packages/*/src/**/*.{ts,tsx,mts,cts,js,jsx,mjs}'],
  ignores: [
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.stories.*',
    '**/*.testing.*',
    '**/*.render-testing.*',
    '**/__tests__/**',
    '**/__fixtures__/**',
    '**/dist/**',
  ],
};

const PREFIX = 'data-astryx-';

/**
 * The data attributes INV23 names public, after the `data-astryx-` prefix:
 * the theme and media-surface scopes, AspectRatio's override hook, the Chat
 * composer token's attributes, the menu-root and press markers, and the
 * edge-compensation marker. They change only under INV9.
 */
export const PUBLIC_ATTRIBUTES = new Set([
  'theme',
  'media',
  'aspect-ratio-override',
  'token',
  'token-value',
  'menu-press',
  'pressable',
  'edge-comp',
]);

/**
 * Identifiers that hold the `astryx` namespace segment, exported by
 * `naming.ts`; a template that interpolates one still spells the attribute.
 */
const NAMESPACE_IDENTIFIERS = new Set(['dataAttrNamespace', 'NAMESPACE']);

/** Stands in for an interpolated value whose text is unknown. */
const UNKNOWN = '\u0000';

const OWNER_MODULE =
  /(?:^|\/)packages\/[^/]+\/src\/privateAttributes\/([^/]+)\.stylex\.ts$/;
const PACKAGE_SOURCE = /(?:^|\/)packages\/([^/]+)\/src\//;
const NAMING_MODULE = /(?:^|\/)packages\/core\/src\/naming\.ts$/;

/**
 * Every `data-astryx-*` attribute a piece of text names, as the attribute
 * name after the prefix, or `null` where the name is interpolated and so
 * cannot be read.
 *
 * @param {string} text
 * @returns {Array<string | null>}
 */
export function attributeNames(text) {
  const names = [];
  const pattern = /data-astryx-([a-z0-9-]*)/gi;
  let match;
  while ((match = pattern.exec(text)) != null) {
    const name = match[1].replace(/-+$/, '').toLowerCase();
    const next = text[match.index + match[0].length];
    names.push(name === '' || next === UNKNOWN ? null : name);
  }
  return names;
}

/** `data-astryx-press`, or `data-astryx-*` for a name that cannot be read. */
function attributeLabel(name) {
  return name == null ? `${PREFIX}*` : `${PREFIX}${name}`;
}

/** The text of a template literal, interpolating the namespace constant. */
function templateText(node) {
  let text = '';
  node.quasis.forEach((quasi, index) => {
    text += quasi.value.cooked ?? quasi.value.raw;
    const expression = node.expressions[index];
    if (expression != null) {
      text +=
        expression.type === 'Identifier' &&
        NAMESPACE_IDENTIFIERS.has(expression.name)
          ? 'astryx'
          : UNKNOWN;
    }
  });
  return text;
}

/** The static text of a call argument, or `null` when it is computed. */
function staticText(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
  }
  return null;
}

function isDataAttrCall(node) {
  const callee = node.callee;
  return (
    (callee.type === 'Identifier' && callee.name === 'dataAttr') ||
    (callee.type === 'MemberExpression' &&
      !callee.computed &&
      callee.property.type === 'Identifier' &&
      callee.property.name === 'dataAttr')
  );
}

/** Skip parentheses-free wrappers TypeScript adds around an initializer. */
function unwrap(node) {
  let current = node;
  while (
    current?.type === 'TSAsExpression' ||
    current?.type === 'TSSatisfiesExpression' ||
    current?.type === 'TSNonNullExpression'
  ) {
    current = current.expression;
  }
  return current;
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow private data-astryx-* attributes written outside their owner module in packages/<package>/src/privateAttributes',
    },
    schema: [
      {
        type: 'object',
        properties: {
          baseline: {
            type: 'object',
            additionalProperties: {type: 'array', items: {type: 'string'}},
          },
          root: {type: 'string'},
        },
        additionalProperties: false,
      },
    ],
    messages: {
      raw:
        '`{{attribute}}` is a private data attribute. Write it only in its owner module, ' +
        '{{owner}}, and spread the styles, setter props and readers it exports ' +
        '(architecture:public-component-api INV23 lists the public attributes).',
      unreadable:
        '`{{attribute}}` names a data attribute this rule cannot read, so it cannot be ' +
        'shown to be public. Write a private attribute only in its owner module under ' +
        "{{ownerDirectory}}, and build a public one by name, as in dataAttr('theme').",
      foreignOwner:
        '`{{attribute}}` belongs in {{owner}}; each owner module writes only its own ' +
        'attribute.',
      foreignPackage:
        "'{{source}}' imports another package's private-attribute owner module. A private " +
        'attribute stays inside the package that writes it; reach it through that ' +
        "package's public API.",
      exportedName:
        'An owner module exports styles and setter props, never its attribute name ' +
        'or a selector on it as a string ({{attribute}}).',
    },
  },
  create(context) {
    const filename = (context.filename ?? context.getFilename())
      .split(path.sep)
      .join('/');
    if (NAMING_MODULE.test(filename)) {
      return {};
    }
    const ownedName = OWNER_MODULE.exec(filename)?.[1] ?? null;
    const packageName = PACKAGE_SOURCE.exec(filename)?.[1] ?? null;
    const ownerDirectory = `packages/${packageName ?? '<package>'}/src/privateAttributes`;
    const ownerOf = name => `${ownerDirectory}/${name}.stylex.ts`;
    const options = context.options[0] ?? {};
    const root = options.root ?? context.cwd;
    const relative = path
      .relative(root, context.filename ?? context.getFilename())
      .split(path.sep)
      .join('/');
    // Each listed attribute allows as many sites as it is listed; the next
    // one is reported.
    const allowance = new Map();
    for (const attribute of options.baseline?.[relative] ?? []) {
      allowance.set(attribute, (allowance.get(attribute) ?? 0) + 1);
    }
    function isAllowed(attribute) {
      const left = allowance.get(attribute) ?? 0;
      if (left === 0) {
        return false;
      }
      allowance.set(attribute, left - 1);
      return true;
    }

    // Local names an owner module exports, by `export {name}`.
    const exportedLocals = new Set();

    function report(node, name) {
      if (name != null && PUBLIC_ATTRIBUTES.has(name)) {
        return;
      }
      const attribute = attributeLabel(name);
      if (ownedName != null) {
        if (name === ownedName) {
          return;
        }
        if (isAllowed(attribute)) {
          return;
        }
        context.report({
          node,
          messageId: name == null ? 'unreadable' : 'foreignOwner',
          data: {attribute, owner: ownerOf(name), ownerDirectory},
        });
        return;
      }
      if (isAllowed(attribute)) {
        return;
      }
      context.report({
        node,
        messageId: name == null ? 'unreadable' : 'raw',
        data: {attribute, owner: ownerOf(name), ownerDirectory},
      });
    }

    // In an owner module: is this string the whole value of an export?
    const ownerExports = [];
    function noteOwnerExport(node, names) {
      if (ownedName == null || !names.includes(ownedName)) {
        return;
      }
      let holder = node.parent;
      while (unwrap(holder) !== holder) {
        holder = holder.parent;
      }
      if (
        holder?.type !== 'VariableDeclarator' ||
        unwrap(holder.init) !== node
      ) {
        return;
      }
      ownerExports.push({node, declarator: holder});
    }

    /**
     * Another package's owner module: a package specifier that reaches a
     * `privateAttributes` folder, or a relative path into one under another
     * package's `src`.
     */
    function checkImport(source) {
      const specifier = source?.value;
      if (
        typeof specifier !== 'string' ||
        !/(?:^|\/)privateAttributes(?:\/|$)/.test(specifier)
      ) {
        return;
      }
      let foreign = !specifier.startsWith('.');
      if (!foreign) {
        const target = path
          .resolve(
            path.dirname(context.filename ?? context.getFilename()),
            specifier,
          )
          .split(path.sep)
          .join('/');
        const targetPackage = PACKAGE_SOURCE.exec(target)?.[1] ?? null;
        foreign = targetPackage != null && targetPackage !== packageName;
      }
      if (foreign) {
        context.report({
          node: source,
          messageId: 'foreignPackage',
          data: {source: specifier},
        });
      }
    }

    function checkText(node, text) {
      const names = attributeNames(text);
      for (const name of names) {
        report(node, name);
      }
      noteOwnerExport(node, names);
    }

    return {
      ImportDeclaration(node) {
        checkImport(node.source);
      },
      ExportNamedDeclaration(node) {
        checkImport(node.source);
      },
      ExportAllDeclaration(node) {
        checkImport(node.source);
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') {
          checkImport(node.source);
        }
      },
      Literal(node) {
        if (typeof node.value !== 'string') {
          return;
        }
        checkText(node, node.value);
      },
      TemplateLiteral(node) {
        checkText(node, templateText(node));
      },
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier') {
          return;
        }
        if (node.name.name.toLowerCase().startsWith(PREFIX)) {
          for (const name of attributeNames(node.name.name)) {
            report(node.name, name);
          }
        }
      },
      CallExpression(node) {
        if (!isDataAttrCall(node)) {
          return;
        }
        const text = staticText(node.arguments[0]);
        const name = text == null || text === '' ? null : text.toLowerCase();
        // A literal argument that already spells the prefix is reported by
        // the literal check.
        if (text != null && text.toLowerCase().includes(PREFIX)) {
          return;
        }
        report(node, name);
      },
      ExportSpecifier(node) {
        if (node.local.type === 'Identifier') {
          exportedLocals.add(node.local.name);
        }
      },
      'Program:exit'() {
        for (const {node, declarator} of ownerExports) {
          const declaration = declarator.parent;
          const isExported =
            declaration?.parent?.type === 'ExportNamedDeclaration' ||
            (declarator.id.type === 'Identifier' &&
              exportedLocals.has(declarator.id.name));
          if (isExported) {
            context.report({
              node,
              messageId: 'exportedName',
              data: {attribute: attributeLabel(ownedName)},
            });
          }
        }
      },
    };
  },
};

export default rule;
