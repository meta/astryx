// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Stepper, Step} from '@astryxdesign/core/Stepper';

export default function StepperWidthResponsiveCollapse() {
  const [active, setActive] = useState(1);

  return (
    <div style={{width: 320}}>
      <Stepper
        activeStep={active}
        orientation="horizontal"
        onStepClick={setActive}
        horizontalOptions={{
          minimumStepWidth: 112,
          collapsedVariant: 'withLabelAndControls',
        }}>
        <Step step={0} label="Cart" />
        <Step step={1} label="Shipping" description="Where it goes" />
        <Step step={2} label="Delivery" />
        <Step step={3} label="Payment" />
      </Stepper>
    </div>
  );
}
