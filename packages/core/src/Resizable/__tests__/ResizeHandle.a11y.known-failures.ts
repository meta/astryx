// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ResizeHandle.a11y.known-failures.ts
 * @input The exact window-splitter failures the shipped ResizeHandle produces today
 * @output RESIZE_HANDLE_KNOWN_FAILURES — records both lanes reconcile against, so a fix shows up as an unexpected pass and any other failure stays a failure
 * @position Known-failure ledger for the ResizeHandle binding
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const RESIZE_HANDLE_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [
  {
    expectation: 'windowsplitter.separator.maximum',
    binding: 'ResizeHandle',
    state: 'bare-unbounded-in-container',
    evidenceLayer: 'dom',
    failureEquals: 'the splitter exposes no aria-valuemax',
    standardsReference:
      'WAI-ARIA separator (focusable): aria-valuemax; APG Window Splitter states and properties; Astryx component:Resizable AR1 (an unbounded Handle in a container that no percentage bound observes carries no aria-valuemax, because measuring that container would add an observer to a region whose bounds are all in pixels).',
    userImpact:
      'A screen-reader user on a handle whose pixel-only region sits in a container and sets no maximum hears a value and a minimum but no maximum.',
    reason:
      'A recorded gap with a reason the record owns (Performance and resources: atomic pixel paths add no observer); it closes only with a record decision, not a fix.',
  },
  {
    expectation: 'windowsplitter.separator.controls-pane',
    binding: 'ResizeHandle',
    state: 'bare-documented-usage',
    evidenceLayer: 'dom',
    failureEquals: 'the splitter carries no aria-controls',
    standardsReference:
      'APG Window Splitter states and properties: the separator has aria-controls set to the id of the primary pane; Astryx component:Resizable AR1 (the Handle names the pane it resizes with aria-controls only when its caller passes one).',
    userImpact:
      'A screen-reader user on a handle rendered the documented minimal way hears a separator with no named pane; the relationship exists only when the caller wires it (SideNav does).',
    reason:
      'A recorded gap the record owns: whether the Handle should derive the pane relationship itself is a component decision for its own spec-backed patch.',
  },
];
