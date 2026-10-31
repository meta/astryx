// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Alert.a11y.known-failures.ts
 * @input Uses KnownFailure from @astryxdesign/a11y-spec
 * @output Exact public-safe baseline failures for Banner's urgent alert binding
 * @position Shared by the jsdom and Chromium bindings. These records preserve
 *   current behavior during test migration; they do not approve remediation.
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const BANNER_ALERT_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [
  {
    expectation: 'status-message.message.text-exposed',
    binding: 'Banner urgent alert',
    state: 'banner-warning-alert-dismissible',
    evidenceLayer: 'accessibility-tree',
    failureEquals:
      'the live region contains "Session expires soonDismiss" at the pre-update boundary, not the complete authored message "Session expires soon"',
    standardsReference:
      'WCAG 2.2 4.1.3 Status Messages (AA); WAI-ARIA 1.2 alert role — the alert region carries the complete authored message, and its implicit aria-atomic=true presents the whole region.',
    userImpact:
      'The DOM text of the alert region includes the Dismiss button\'s closed tooltip (role="tooltip", popover="manual", the button\'s aria-describedby target), which Banner renders inside the region. Chromium\'s accessibility tree exposes the warning alone, with a button named "Dismiss Session expires soon" inside it. What assistive technology presents for this region is AST-009 real-assistive-technology follow-up; this record claims only the observed DOM text.',
    reason:
      'The explicit role lands on the whole Banner under component:Banner FR8 and DEC-2. Keeping control text out of the region, or moving the role to the message, changes Banner behavior and needs an owner decision, so this migration records the existing exposure.',
  },
  {
    expectation: 'status-message.message.text-exposed',
    binding: 'Banner urgent alert',
    state: 'banner-warning-alert-collapsible',
    evidenceLayer: 'accessibility-tree',
    failureEquals:
      'the live region contains "Session expires soonExpand" at the pre-update boundary, not the complete authored message "Session expires soon"',
    standardsReference:
      'WCAG 2.2 4.1.3 Status Messages (AA); WAI-ARIA 1.2 alert role — the alert region carries the complete authored message, and its implicit aria-atomic=true presents the whole region.',
    userImpact:
      'The DOM text of the alert region includes the disclosure toggle\'s closed tooltip ("Expand"), which Banner renders inside the region beside the collapsed supporting content. What assistive technology presents for this region is AST-009 real-assistive-technology follow-up; this record claims only the observed DOM text.',
    reason:
      'The explicit role lands on the whole Banner under component:Banner FR8 and DEC-2. Keeping control text out of the region, or moving the role to the message, changes Banner behavior and needs an owner decision, so this migration records the existing exposure.',
  },
  {
    expectation: 'status-message.message.text-exposed',
    binding: 'Banner urgent alert',
    state: 'banner-error-alert-end-content',
    evidenceLayer: 'accessibility-tree',
    failureEquals:
      'the live region contains "Upload failedRetry" at the pre-update boundary, not the complete authored message "Upload failed"',
    standardsReference:
      'WCAG 2.2 4.1.3 Status Messages (AA); WAI-ARIA 1.2 alert role — the alert region carries the complete authored message, and its implicit aria-atomic=true presents the whole region.',
    userImpact:
      "The caller-supplied Retry action renders inside the alert region, so the region's DOM text is the message followed by the button label. What assistive technology presents for this region is AST-009 real-assistive-technology follow-up; this record claims only the observed DOM text.",
    reason:
      'The explicit role lands on the whole Banner under component:Banner FR8 and DEC-2. Keeping control text out of the region, or moving the role to the message, changes Banner behavior and needs an owner decision, so this migration records the existing exposure.',
  },
  {
    expectation: 'status-message.message.text-exposed',
    binding: 'Banner urgent alert',
    state: 'banner-error-alert-description',
    evidenceLayer: 'accessibility-tree',
    failureEquals:
      'the live region contains "Upload failedCheck your network and try again." at the pre-update boundary, not the complete authored message "Upload failed Check your network and try again."',
    standardsReference:
      'WCAG 2.2 4.1.3 Status Messages (AA); WAI-ARIA 1.2 alert role — the alert region carries the complete authored message, and its implicit aria-atomic=true presents the whole region.',
    userImpact:
      "The title and description are separate block elements inside the region, and the region's DOM text joins them with no separator. No control text is involved; the whole authored message is present. What assistive technology presents for this region is AST-009 real-assistive-technology follow-up; this record claims only the observed DOM text.",
    reason:
      "The shared contract compares the region's DOM text with one authored string, so a message split across Banner's title and description elements reads without a separator. Whether the contract should compare per element or Banner should separate the parts is an owner decision, so this migration records the existing exposure.",
  },
];
