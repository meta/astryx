// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {HStack} from '@astryxdesign/core/Layout';
import {Stepper, Step} from '@astryxdesign/core/Stepper';
import {Text} from '@astryxdesign/core/Text';

export default function StepStates() {
  // A Step holds no state of its own — it compares its `step` index against the
  // Stepper's `activeStep`. Each state below is therefore one Step in its own
  // Stepper, with activeStep placed on one side of it or the other.
  return (
    <HStack wrap="wrap" gap={8}>
      <div style={{width: 220}}>
        <Text type="label">Completed</Text>
        <Stepper activeStep={1} orientation="vertical">
          <Step step={0} label="Verify email" />
        </Stepper>
      </div>
      <div style={{width: 220}}>
        <Text type="label">Current</Text>
        <Stepper activeStep={0} orientation="vertical">
          <Step step={0} label="Verify email" />
        </Stepper>
      </div>
      <div style={{width: 220}}>
        <Text type="label">Upcoming</Text>
        <Stepper activeStep={0} orientation="vertical">
          <Step step={1} label="Add a payment method" />
        </Stepper>
      </div>
      <div style={{width: 220}}>
        <Text type="label">Disabled</Text>
        <Stepper activeStep={0} orientation="vertical" onStepClick={() => {}}>
          <Step step={1} label="Add a payment method" isDisabled />
        </Stepper>
      </div>
      <div style={{width: 220}}>
        <Text type="label">Completed, with a status</Text>
        <Stepper activeStep={1} orientation="vertical">
          <Step step={0} label="Verify email" status="warning" />
        </Stepper>
      </div>
    </HStack>
  );
}
