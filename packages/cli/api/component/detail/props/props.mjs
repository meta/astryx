// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `component.detail.props` leaf — just a component's props table, each
 * prop with the declarations of the types it names.
 *
 * @input  a resolved (already-loaded) doc-like object, from _adapter, and the
 *   path of the doc it was read from
 * @output the `component.detail.props` envelope
 * @position api/component/detail/props (projection leaf; routed by component.mjs)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {extractProps} from '../../_adapter.mjs';
import {
  exportedTypeDeclarations,
  packageRootDeclarationFile,
  typeNamesIn,
} from '../../../../foundation/discovery/type-declarations.mjs';

/**
 * The folder of the package named `packageName` that holds `file`: the
 * nearest folder above it whose package.json has that name.
 * @param {string} file
 * @param {string} packageName
 * @returns {string | null}
 */
function packageDirHolding(file, packageName) {
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    try {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
      );
      if (manifest?.name === packageName) return dir;
    } catch {
      // No readable package.json here: look one folder up.
    }
    if (path.dirname(dir) === dir) return null;
  }
}

/**
 * Each prop with `types`: the types its `type` names that the owner package
 * exports, then the types those types name. A prop that names none is
 * unchanged, and so is every prop when the package ships no declarations.
 * @param {import('@astryxdesign/cli/authoring').ComponentPropDoc[]} props
 * @param {string} ownerPackage
 * @param {string | undefined} docPath
 * @returns {import('../../component.type.mjs').ComponentPropsEntry[]}
 */
function withPropTypes(props, ownerPackage, docPath) {
  const packageDir = docPath ? packageDirHolding(docPath, ownerPackage) : null;
  const root = packageDir ? packageRootDeclarationFile(packageDir) : null;
  if (!root) return props;
  /** @param {{type?: unknown}} prop */
  const namesOf = prop =>
    typeof prop.type === 'string' ? typeNamesIn(prop.type) : [];
  const found = exportedTypeDeclarations(root, props.flatMap(namesOf));
  return props.map(prop => {
    const names = new Set(namesOf(prop));
    const types = found
      .filter(type => names.has(type.via))
      .map(({name, declaration}) =>
        declaration === undefined ? {name} : {name, declaration},
      );
    return types.length > 0 ? {...prop, types} : prop;
  });
}

/**
 * Project a resolved doc into the `component.detail.props` envelope.
 * @param {import('../../_adapter.mjs').LoadedComponentDoc} docs
 * @param {string} ownerPackage - the npm package that owns the component
 * @param {{docPath?: string}} [options] `docPath` is the doc the props were
 *   read from; the types come from the package that holds it
 * @returns {import('../../component.type.mjs').ComponentDetailPropsResponse}
 */
export function componentDetailProps(docs, ownerPackage, {docPath} = {}) {
  return {
    type: 'component.detail.props',
    package: ownerPackage,
    data: withPropTypes(extractProps(docs), ownerPackage, docPath),
  };
}
