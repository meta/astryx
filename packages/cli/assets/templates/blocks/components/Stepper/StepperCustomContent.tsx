// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Stepper, Step} from '@astryxdesign/core/Stepper';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';

export default function StepperCustomContent() {
  const [active, setActive] = useState(0);
  // The content slot takes any node, not just form fields — a panel, a summary,
  // a notice. Gating it on `active` is what makes the flow expand a step at a
  // time.
  return (
    <div style={{width: 680, maxWidth: '100%'}}>
      <Stepper
        activeStep={active}
        orientation="vertical"
        onStepClick={setActive}>
        <Step
          step={0}
          label="Project details"
          description="Name it and point us at the source"
          indicator="number">
          {active === 0 && (
            <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
              <div style={{display: 'flex', flexWrap: 'wrap', gap: 12}}>
                <div style={{flex: '1 1 220px', minWidth: 0}}>
                  <TextInput
                    label="Project name"
                    placeholder="My awesome project"
                    value=""
                    width="100%"
                  />
                </div>
                <div style={{flex: '1 1 220px', minWidth: 0}}>
                  <TextInput
                    label="Repository URL"
                    placeholder="https://github.com/..."
                    value=""
                    width="100%"
                  />
                </div>
              </div>
              <div>
                <Button
                  label="Continue"
                  variant="primary"
                  onClick={() => setActive(1)}
                />
              </div>
            </div>
          )}
        </Step>
        <Step
          step={1}
          label="Review the build"
          description="What we detected from your default branch"
          indicator="number">
          {active === 1 && (
            <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
              <Card variant="muted" padding={3}>
                <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                    <Text type="label">Next.js 15</Text>
                    <Badge variant="success" label="Detected" />
                  </div>
                  <Text type="supporting">
                    Build command <code>next build</code> · Output{' '}
                    <code>.next</code> · Node 20
                  </Text>
                </div>
              </Card>
              <div style={{display: 'flex', gap: 8}}>
                <Button
                  label="Back"
                  variant="secondary"
                  onClick={() => setActive(0)}
                />
                <Button
                  label="Looks right"
                  variant="primary"
                  onClick={() => setActive(2)}
                />
              </div>
            </div>
          )}
        </Step>
        <Step
          step={2}
          label="Deploy"
          description="Ships to production"
          indicator="number">
          {active === 2 && (
            <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
              <Banner
                status="info"
                title="First deploy takes a few minutes"
                description="Later deploys reuse the build cache and finish in under a minute."
              />
              <div style={{display: 'flex', gap: 8}}>
                <Button
                  label="Back"
                  variant="secondary"
                  onClick={() => setActive(1)}
                />
                <Button
                  label="Deploy now"
                  variant="primary"
                  onClick={() => setActive(3)}
                />
              </div>
            </div>
          )}
        </Step>
        <Step step={3} label="Live" indicator="number" />
      </Stepper>
    </div>
  );
}
