// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which installed component draws each Astryx theme target (the
 * `astryx-<name>` class), read from a package's built modules and
 * declarations, for `astryx experimental render --reverse`.
 *
 * @position foundation/render — used by rebuild.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';

/** @param {string} s */
export const pascal = s => s.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());

/**
 * @typedef {object} ComponentEntry
 * @property {string} name - Export name.
 * @property {string} module - Import specifier.
 * @property {Set<string>} props - Prop names its declaration lists.
 * @property {Set<string>} numeric - Props whose type includes `number`.
 * @property {Map<string, string>} required - Props its declaration requires, with their declared types.
 * @property {boolean} children - Whether it takes children.
 * @property {boolean} label - Whether it takes `label`.
 */

/**
 * Map each theme target (the `astryx-<name>` class) to the components that
 * render it, by reading an installed package's built modules.
 * @param {string} pkg e.g. `@astryxdesign/core`
 * @param {string} fromDir where to resolve it from
 * @returns {Map<string, ComponentEntry[]>}
 */
export function componentMap(pkg, fromDir) {
  /** @type {Map<string, ComponentEntry[]>} */
  const map = new Map();
  /** @type {string} */
  let dist;
  try {
    const req = createRequire(path.join(fromDir, 'noop.js'));
    let d = path.dirname(req.resolve(pkg));
    while (!fs.existsSync(path.join(d, 'package.json')) && path.dirname(d) !== d) d = path.dirname(d);
    dist = path.join(d, 'dist');
  } catch {
    return map;
  }
  if (!fs.existsSync(dist)) return map;
  // Where each name can be imported from: the package's public subpaths.
  /** @type {Map<string, string[]>} */
  const exported = new Map();
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(dist, '..', 'package.json'), 'utf8'));
    for (const [key, value] of Object.entries(pj.exports ?? {})) {
      const target = typeof value === 'string' ? value : /** @type {any} */ (value)?.default ?? /** @type {any} */ (value)?.import;
      if (key === '.' || typeof target !== 'string' || !target.endsWith('.js')) continue;
      const file = path.join(dist, '..', target);
      if (!fs.existsSync(file)) continue;
      const js = fs.readFileSync(file, 'utf8');
      /** @type {string[]} */
      const names = [];
      for (const m of js.matchAll(/export\s*\{([^}]*)\}/g)) {
        for (const part of m[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/).pop()?.trim();
          if (name) names.push(name);
        }
      }
      for (const m of js.matchAll(/export\s+(?:function|const|class)\s+([A-Za-z0-9_]+)/g)) names.push(m[1]);
      for (const name of names) {
        const list = exported.get(name) ?? [];
        list.push(`${pkg}/${key.slice(2)}`);
        exported.set(name, list);
      }
    }
  } catch {
    // No readable exports map: fall back to folder names.
  }
  /** @param {string} name @param {string} folder */
  const moduleFor = (name, folder) => {
    const list = exported.get(name);
    if (!list) return null;
    return list.find(m => m.endsWith(`/${name}`)) ?? list.find(m => m.endsWith(`/${folder}`)) ?? list[0];
  };
  for (const dirent of fs.readdirSync(dist, {withFileTypes: true})) {
    if (!dirent.isDirectory()) continue;
    const folder = path.join(dist, dirent.name);
    for (const file of fs.readdirSync(folder)) {
      if (!file.endsWith('.js')) continue;
      const js = fs.readFileSync(path.join(folder, file), 'utf8');
      const targets = [...js.matchAll(/themeProps\(\s*['"]([a-z0-9-]+)['"]/g)].map(t => t[1]);
      if (targets.length === 0) continue;
      const names = [...js.matchAll(/^([A-Z][A-Za-z0-9]*)\.displayName = ['"]([A-Za-z0-9.]+)['"]/gm)].map(n => n[1]);
      if (names.length === 0) continue;
      const dts = path.join(folder, file.replace(/\.js$/, '.d.ts'));
      const decl = fs.existsSync(dts) ? fs.readFileSync(dts, 'utf8') : '';
      for (const target of new Set(targets)) {
        for (const name of names) {
          /** @type {Set<string>} */
          const props = new Set();
          /** @type {Set<string>} */
          const numeric = new Set();
          /** @type {Map<string, string>} */
          const required = new Map();
          const body = new RegExp(`interface ${name}Props[^{]*\\{([\\s\\S]*?)\\n\\}`).exec(decl)?.[1] ?? '';
          for (const p of body.matchAll(/^\s{4}(?:readonly\s+)?([a-zA-Z][\w]*)\??:\s*([^;]*)/gm)) {
            props.add(p[1]);
            if (!/^\s{4}(?:readonly\s+)?[a-zA-Z]\w*\?/.test(p[0])) required.set(p[1], p[2].trim());
            if (/\bnumber\b|\b\d+\b/.test(p[2])) numeric.add(p[1]);
          }
          const module = moduleFor(name, dirent.name);
          if (!module) continue;
          const entry = {
            name,
            module,
            props,
            numeric,
            required,
            children: props.has('children') || /extends[^{]*(PropsWithChildren|HTMLAttributes|ComponentProps)/.test(decl),
            label: props.has('label'),
          };
          const list = map.get(target) ?? [];
          if (!list.some(e => e.name === name)) list.push(entry);
          // A stack with a fixed direction reads best as VStack / HStack.
          if (target === 'stack' && name === 'Stack') {
            for (const alias of ['VStack', 'HStack']) {
              const aliasModule = moduleFor(alias, dirent.name);
              if (!aliasModule || list.some(e => e.name === alias)) continue;
              const aliasProps = new Set(props);
              aliasProps.delete('direction');
              list.push({...entry, name: alias, module: aliasModule, props: aliasProps});
            }
          }
          map.set(target, list);
        }
      }
    }
  }
  return map;
}

