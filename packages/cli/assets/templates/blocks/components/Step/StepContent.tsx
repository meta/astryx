// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {VStack} from '@astryxdesign/core/Layout';
import {Stepper, Step} from '@astryxdesign/core/Stepper';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {useToast} from '@astryxdesign/core/Toast';

export default function StepContent() {
  const showToast = useToast();
  // Anything passed as children renders below the description, indented to line
  // up with the label rather than the indicator. In a full flow you would gate
  // this on the step being active; here it is a single Step so the slot is
  // always shown.
  return (
    <div style={{width: 400, maxWidth: '100%'}}>
      <Stepper activeStep={1} orientation="vertical">
        <Step
          step={1}
          label="Billing address"
          description="Used for invoices and tax calculation">
          <VStack gap={3}>
            <TextInput label="Street" placeholder="1 Hacker Way" value="" />
            <TextInput label="City" placeholder="Menlo Park" value="" />
            <div>
              <Button
                label="Save address"
                variant="primary"
                onClick={() =>
                  showToast({body: 'Demo: the billing address would save here'})
                }
              />
            </div>
          </VStack>
        </Step>
      </Stepper>
    </div>
  );
}
