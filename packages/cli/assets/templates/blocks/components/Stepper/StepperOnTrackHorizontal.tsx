// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Stepper, Step} from '@astryxdesign/core/Stepper';

export default function StepperOnTrackHorizontal() {
  const [active, setActive] = useState(2);
  return (
    <div style={{width: 560, maxWidth: '100%'}}>
      <Stepper
        activeStep={active}
        orientation="horizontal"
        indicatorPosition="on-track"
        onStepClick={setActive}>
        <Step step={0} label="Workspace" indicator="number" />
        <Step step={1} label="Team" indicator="number" />
        <Step step={2} label="Integrations" indicator="number" />
        <Step step={3} label="Import" indicator="number" />
        <Step step={4} label="Launch" indicator="number" />
      </Stepper>
    </div>
  );
}
