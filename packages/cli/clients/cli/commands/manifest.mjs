// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file manifest command — `astryx manifest`, the CLI capability manifest.
 *
 * A single, self-describing view of the whole CLI so agents can discover every
 * command, argument, flag, and response type without scraping `--help`.
 * `astryx manifest --json` is the dedicated surface; the bare `astryx --json`
 * embeds the same payload under data.manifest for convenience.
 *
 * Intentionally CLI-special — no `api/manifest`. It introspects the live
 * Commander `program`, so extracting it to `api/` would create an `api → cli`
 * cycle. `buildManifest(program)` lives in lib/; see its header. Register it
 * after every other command: the manifest lists commands in registration order.
 *
 * The command surface comes from the colocated CommandDoc via `defineCommand`.
 */

import {getCliInvocation} from '../../../foundation/env/package-manager.mjs';
import {jsonOut} from '../../../foundation/response/json.mjs';
import {emit, section, text, records} from '../formatters/index.mjs';
import {buildManifest} from '../lib/manifest.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {resultSet} from '../../../foundation/debug/index.mjs';
import {doc as manifestCommand} from './manifest.doc.mjs';

/**
 * @param {import('commander').Command} program the root program
 * @param {{jsonSupported: Set<string>, version: string}} context the commands
 *   that accept --json, and the CLI's version
 */
export function registerManifest(program, {jsonSupported, version}) {
  defineCommand(program, manifestCommand, {
    action: () => {
      const manifest = buildManifest(program, {jsonSupported, version});
      // The manifest IS a result set: one entry per command the CLI ships.
      const answered = resultSet({
        count: manifest.commands.length,
        resultKind: 'command',
      });
      if (program.opts().json) {
        jsonOut({type: 'manifest', data: manifest});
        return answered;
      }
      // Human-readable summary as greppable records (agents should use --json).
      // One record per command: name, whether it supports --json, and the
      // description. Field names are the manifest entry's own keys.
      emit(
        section(
          `${manifest.name} v${manifest.version} (${manifest.commands.length} commands)`,
        ),
        records(
          manifest.commands.map(c => ({
            name: c.name,
            json: c.json ? 'yes' : '',
            description: c.description || '',
          })),
          {fields: ['name', 'json', 'description']},
        ),
        text(
          `Run \`${getCliInvocation()} manifest --json\` for the full structured manifest.`,
        ),
      );
      return answered;
    },
  });
}
