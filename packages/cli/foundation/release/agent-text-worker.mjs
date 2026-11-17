// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The global copy's background step that keeps the computer-level
 * agent text installed (spec AST-081 FR8), as its own detached process.
 *
 * Started by `maybeKeepAgentText` (global-state.mjs) from the global copy,
 * with one argument, the per-user configuration folder. It writes the files
 * the person's settings choose (the computer-level skill and its links, and
 * the folders outside any project `astryx init --to <folder>` saved), with this release's text and the plain `astryx` command, and keeps every file a
 * person edited, every file without the Astryx markers, and every link, as
 * `astryx init --user` does. It then records this release as the one that
 * wrote the text. It writes nothing to any stream and never reaches a
 * person: it is not a command and takes no options.
 *
 * @input  argv[2]: the per-user configuration folder (the state file's); the
 *   settings file
 * @output the computer-level agent text and the updated global state on disk
 * @position foundation/release — one of the two detached processes the CLI
 *   starts; the other is refresh-worker.mjs.
 */

import {fileURLToPath} from 'node:url';
import {
  COMPUTER_COMMAND,
  computerInstallStep,
  renderComputerAgentText,
  writeComputerAgentText,
} from '../agent-docs/computer-agent-text.mjs';
import {
  managedFileState,
  writeManagedFile,
} from '../agent-docs/managed-skill-file.mjs';
import {savedComputerFolderSkillFile} from '../agent-docs/skill-places.mjs';
import {
  computerAgentTextSettings,
  computerSkillFolders,
  recordComputerAgentTextSettings,
} from '../env/user-settings.mjs';
import {recordAgentTextWritten} from './global-state.mjs';
import {readJson} from './project.mjs';

const stateDir = process.argv[2];
if (stateDir) {
  try {
    const settings = computerAgentTextSettings();
    const folders = computerSkillFolders();
    if (settings.install) {
      const {links} = writeComputerAgentText({command: COMPUTER_COMMAND});
      recordComputerAgentTextSettings({
        install: true,
        links: [...new Set([...settings.links, ...links])],
      });
    }
    // The folders `astryx init --to <folder>` saved outside any project get
    // the same text, under the same rules: an edited file is kept. Each is
    // its own choice, so turning the computer-level text off leaves them
    // (spec AST-081 FR8). A deleted copy is the person's choice too: it is
    // refreshed only while it is there.
    if (folders.length > 0) {
      const text = renderComputerAgentText({
        command: COMPUTER_COMMAND,
        install: computerInstallStep(),
      });
      for (const folder of folders) {
        try {
          const file = savedComputerFolderSkillFile(folder);
          if (managedFileState(file, text) !== 'absent') writeManagedFile(file, text);
        } catch {
          // A folder that cannot be written now is tried on the next release.
        }
      }
    }
    if (settings.install || folders.length > 0) {
      const pkg = readJson(
        fileURLToPath(new URL('../../package.json', import.meta.url)),
      );
      recordAgentTextWritten(pkg?.version ?? null, stateDir);
    }
  } catch {
    // A home folder that cannot be written is tried again later.
  }
}
