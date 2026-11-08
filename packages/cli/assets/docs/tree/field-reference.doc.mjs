// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/field-reference`: every authoring schema, one
 * section each. `astryx docs authoring <name>` reads one of them.
 *
 * Built from the self-docs colocated under packages/cli/authoring, so it cannot
 * drift from the schemas it describes. `astryx doctor` names a self-doc this
 * guide cannot reach.
 */

import {buildAuthoringTopic} from '../../../foundation/discovery/authoring-self-docs.mjs';

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = await buildAuthoringTopic();
