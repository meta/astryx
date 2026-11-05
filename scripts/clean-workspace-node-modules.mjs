// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Remove cached workspace installs before Vercel runs pnpm.
 * @input The repository root as the current working directory.
 * @output Removes root and workspace-package node_modules directories.
 * @position Vercel install cache recovery; pnpm recreates the directories next.
 */

import {existsSync, readdirSync, rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const WORKSPACE_PARENTS = ['apps', 'packages', 'packages/themes', 'internal'];

export function cleanWorkspaceNodeModules(root = process.cwd()) {
  if (!existsSync(path.join(root, 'pnpm-workspace.yaml'))) {
    throw new Error('Run clean-workspace-node-modules.mjs from the repo root');
  }

  rmSync(path.join(root, 'node_modules'), {force: true, recursive: true});

  for (const parent of WORKSPACE_PARENTS) {
    const parentPath = path.join(root, parent);
    if (!existsSync(parentPath)) continue;

    for (const entry of readdirSync(parentPath, {withFileTypes: true})) {
      if (!entry.isDirectory()) continue;
      rmSync(path.join(parentPath, entry.name, 'node_modules'), {
        force: true,
        recursive: true,
      });
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  cleanWorkspaceNodeModules();
}
