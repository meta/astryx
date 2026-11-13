// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Every ready page template scaffolds and renders: slice 1 of 3, so the Node
 * legs can spread the templates.
 */

import {describeTemplateSlice} from '../../test-utils/render-template-slices.mjs';

describeTemplateSlice(1, 3);
