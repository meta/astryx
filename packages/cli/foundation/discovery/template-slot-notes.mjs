// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A template's `slots` and `fits` checked against the shared vocabulary
 * of places a block goes.
 *
 * A page names its slots and a block names its fits with kinds from one
 * vocabulary (`astryx docs authoring/template-doc`). A kind this release does
 * not know still loads, so a template written for a newer vocabulary keeps
 * working, but `astryx build` cannot match it: each one gets a note. A page
 * that names two slots alike gets one too, since `astryx build` names the slot
 * a block goes in by its name. A block that fits only an overlay or an inline
 * place still loads; a page slot of either kind gets a note, since no block is
 * put in one.
 *
 * @input A loaded integration (absolute roots) and its package directory.
 * @output One note per unknown kind, repeated slot name and context-kind slot.
 *   A note is never an error or a warning, even under `--strict`.
 * @position foundation/discovery; read by `doctor integration validate` (and
 *   so `integration check`) for the package being authored.
 */

import * as path from 'node:path';
import {loadTopicModule} from './docs-discovery.mjs';
import {discoverIntegrationTemplatesForOne} from './template-adapter.mjs';
import {
  SLOT_KINDS,
  isPageKind,
  isSlotKind,
} from '../../authoring/doctypes/template/slot-kinds.mjs';

/** A slot kind or fit the vocabulary does not have. */
export const TEMPLATE_SLOT_UNKNOWN_KIND = 'template_slot_unknown_kind';

/** Two slots of one page with the same name. */
export const TEMPLATE_SLOT_DUPLICATE_NAME = 'template_slot_duplicate_name';

/** A page slot of a context kind (`overlay`, `inline`), which no block fills. */
export const TEMPLATE_SLOT_NOT_A_PLACE = 'template_slot_not_a_place';

/** The vocabulary, as a note lists it. */
const KINDS = SLOT_KINDS.map(entry => entry.kind).join(', ');

/**
 * The notes for each template in the package whose `slots` or `fits` names a
 * kind the vocabulary lacks, repeats a slot name, or makes a context a slot.
 * @param {any} loaded a loaded integration (absolute roots)
 * @param {string} packageDir
 * @returns {Promise<Array<{code: string, message: string}>>}
 */
export async function templateSlotNotes(loaded, packageDir) {
  if (!loaded.templates) return [];
  const {templates} = await discoverIntegrationTemplatesForOne(loaded).catch(
    () => ({templates: []}),
  );
  /** @type {Array<{code: string, message: string}>} */
  const notes = [];
  for (const template of templates) {
    if (!template.docPath) continue;
    const doc = /** @type {any} */ (
      await loadTopicModule(template.docPath).catch(() => null)
    );
    const file = path
      .relative(packageDir, template.docPath)
      .split(path.sep)
      .join('/');
    const slots = Array.isArray(doc?.slots) ? doc.slots : [];
    const fits = Array.isArray(doc?.fits) ? doc.fits : [];
    /** @type {Set<string>} */
    const names = new Set();
    for (const slot of slots) {
      if (!isSlotKind(slot?.kind)) {
        notes.push({
          code: TEMPLATE_SLOT_UNKNOWN_KIND,
          message: `${file} names slot "${slot?.name}" with kind "${slot?.kind}", which this release does not know, so \`astryx build\` puts no block in it. Use one of: ${KINDS}.`,
        });
      } else if (!isPageKind(slot.kind)) {
        notes.push({
          code: TEMPLATE_SLOT_NOT_A_PLACE,
          message: `${file} names slot "${slot.name}" with kind "${slot.kind}", which is a context, not a place in a page, so \`astryx build\` puts no block in it. Give the slot the kind of the region or section it is.`,
        });
      }
      if (names.has(slot?.name)) {
        notes.push({
          code: TEMPLATE_SLOT_DUPLICATE_NAME,
          message: `${file} names two slots "${slot.name}". \`astryx build\` names the slot a block goes in by its name, so give each slot its own.`,
        });
      }
      names.add(slot?.name);
    }
    for (const kind of fits) {
      if (!isSlotKind(kind)) {
        notes.push({
          code: TEMPLATE_SLOT_UNKNOWN_KIND,
          message: `${file} fits kind "${kind}", which this release does not know, so \`astryx build\` cannot place the block by it. Use one of: ${KINDS}.`,
        });
      }
    }
  }
  return notes;
}
