// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {describe, expect, it} from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VIBE_DIR = path.resolve(HERE, '..');
const probeConfig = JSON.parse(
  fs.readFileSync(path.join(HERE, 'probes.json'), 'utf8'),
);
const prompts = JSON.parse(
  fs.readFileSync(path.join(HERE, 'prompts.json'), 'utf8'),
).prompts;

function probe(fixtureId, name) {
  return probeConfig.fixtures[fixtureId].probes.find(
    entry => entry.name === name,
  );
}

function attributeFragments(source, attribute) {
  return (
    source.match(
      new RegExp(
        `${attribute}\\s*=\\s*(?:["'][^"']+["']|\\{[\\s\\S]*?\\})`,
        'g',
      ),
    ) ?? []
  );
}

describe('setup host probe selectors', () => {
  it('captures every required paint, type, box, spacing, and position property', () => {
    expect(new Set(probeConfig.properties).size).toBe(
      probeConfig.properties.length,
    );
    for (const property of [
      'color',
      'backgroundColor',
      'borderTopColor',
      'borderRightColor',
      'borderBottomColor',
      'borderLeftColor',
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
      'borderTopStyle',
      'borderRightStyle',
      'borderBottomStyle',
      'borderLeftStyle',
      'borderTopLeftRadius',
      'borderTopRightRadius',
      'borderBottomRightRadius',
      'borderBottomLeftRadius',
      'boxShadow',
      'fontFamily',
      'fontSize',
      'fontWeight',
      'lineHeight',
      'letterSpacing',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'marginTop',
      'marginRight',
      'marginBottom',
      'marginLeft',
      'gap',
      'rowGap',
      'columnGap',
      'width',
      'height',
      'position',
      'top',
      'right',
      'bottom',
      'left',
    ]) {
      expect(probeConfig.properties, property).toContain(property);
    }
    expect(probeConfig.geometryNormalization).toMatch(/1\/64 CSS pixel/);
  });

  it('uses only fixture-owned marker selectors', () => {
    for (const fixture of Object.values(probeConfig.fixtures)) {
      for (const entry of fixture.probes) {
        expect(entry.selector).toBe(`[data-vibe-probe="${entry.name}"]`);
      }
    }
  });

  it('matches exactly one real marker attribute in each canonical fixture source', () => {
    for (const [fixtureId, fixture] of Object.entries(probeConfig.fixtures)) {
      const source = fs.readFileSync(
        path.join(VIBE_DIR, 'fixtures', fixtureId, 'src', 'App.tsx'),
        'utf8',
      );
      const attributes = attributeFragments(source, 'data-vibe-probe');
      for (const entry of fixture.probes) {
        expect(
          attributes.filter(attribute =>
            new RegExp(`['"]${entry.name}['"]`).test(attribute),
          ),
          `${fixtureId}:${entry.name}`,
        ).toHaveLength(1);
      }
    }
  });

  it('defines complete fixture-owned nested overlay interactions', () => {
    expect(
      probeConfig.fixtures['tailwind-v4-control'].interaction,
    ).toBeUndefined();
    for (const fixtureId of [
      'shadcn-tailwind-v4-established',
      'enterprise-scoped-synthetic',
    ]) {
      const interaction = probeConfig.fixtures[fixtureId].interaction;
      const source = fs.readFileSync(
        path.join(VIBE_DIR, 'fixtures', fixtureId, 'src', 'App.tsx'),
        'utf8',
      );
      const attributes = attributeFragments(source, 'data-vibe-probe');
      const kinds = new Set(interaction.surfaces.map(surface => surface.kind));
      expect(kinds).toContain('backdrop');
      expect(kinds).toContain('dialog');
      expect(
        [...kinds].some(kind => kind === 'popover' || kind === 'tooltip'),
      ).toBe(true);
      for (const marker of [
        ...interaction.open,
        ...interaction.surfaces.map(surface => surface.name),
      ]) {
        expect(
          attributes.filter(attribute => attribute.includes(`"${marker}"`)),
          `${fixtureId}:${marker}`,
        ).toHaveLength(1);
      }
    }
  });

  it('declares exact task-owned result markers for both composition directions', () => {
    const promptById = new Map(prompts.map(prompt => [prompt.id, prompt]));
    const directions = new Set();
    for (const id of ['s4', 's5']) {
      const prompt = promptById.get(id);
      expect(prompt.kind).toBe('composition');
      for (const interaction of prompt.contract.interactions) {
        directions.add(interaction.direction);
        expect(
          interaction.surfaces.some(surface => surface.kind === 'dialog'),
        ).toBe(true);
        expect(
          interaction.surfaces.some(
            surface => surface.kind === 'tooltip' || surface.kind === 'popover',
          ),
        ).toBe(true);
        for (const marker of interaction.surfaces.filter(
          surface => surface.source === 'result',
        )) {
          expect(marker.name).toMatch(/^(astryx|host)-/);
        }
      }
    }
    expect(directions).toEqual(new Set(['astryx-in-host', 'host-in-astryx']));
  });

  it('keeps the original primary action when a new adjacent button is inserted', () => {
    const selector = probe(
      'shadcn-tailwind-v4-established',
      'primary-action',
    ).selector;
    const dom = new JSDOM(`
      <header>
        <button data-vibe-probe="primary-action">New request</button>
        <button data-vibe-result="astryx-button">Deploy</button>
      </header>
    `);

    expect(dom.window.document.querySelector(selector)?.textContent).toBe(
      'New request',
    );
  });
});
