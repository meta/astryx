// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Page type: lab (full-bleed tool)
 * Astryx's own check of the gesture host's presented hit testing on a phone:
 * the lab component owns the whole viewport, so the route adds no chrome.
 * Not linked from the site and not indexed.
 *
 * @input Nothing
 * @output The presented hit-testing lab page
 * @position app/lab/presented-hit-testing route (`spec:AST-094` FR11, FR19)
 */

import type {Metadata} from 'next';
import {PresentedHitTestingLab} from './PresentedHitTestingLab';

export const metadata: Metadata = {
  title: 'Presented hit testing lab',
  description:
    'Tap and drag a sheet while it springs into place, with the gesture host’s correction on or off.',
  robots: {index: false, follow: false},
};

export default function PresentedHitTestingPage() {
  return <PresentedHitTestingLab />;
}
