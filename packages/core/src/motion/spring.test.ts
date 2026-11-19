// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file spring.test.ts
 * @input vitest, the spring model
 * @output Checks the closed-form spring against an independent RK4
 *   integration of the ODE across damping regimes, every conversion against
 *   Apple's published equations, and the settling duration against every
 *   published reference value
 * @position Testing; validates spring.ts without a browser
 */

import {describe, expect, it} from 'vitest';
import {
  absoluteVelocity,
  dampingRatioOf,
  durationBounceOf,
  relativeVelocity,
  responseDampingOf,
  responseOf,
  settlingDuration,
  solveSpring,
  solveSpringTowardRamp,
  springFromDurationBounce,
  springFromPhysics,
  springFromResponse,
  springFromUIKitDampingDuration,
  type Spring,
} from './spring';

/**
 * Independent reference: classic fourth-order Runge-Kutta on
 * m·x″ + c·x′ + k·(x − to) = 0. Shares nothing with the closed form.
 */
function rk4(
  spring: Spring,
  from: number,
  to: number,
  velocity: number,
  until: number,
  dt = 1e-4,
): {t: number; value: number; velocity: number}[] {
  const {mass: m, stiffness: k, damping: c} = spring;
  const accel = (x: number, v: number) => (-k * (x - to) - c * v) / m;
  let x = from;
  let v = velocity;
  const out = [{t: 0, value: x, velocity: v}];
  const steps = Math.round(until / dt);
  for (let i = 1; i <= steps; i++) {
    const k1x = v;
    const k1v = accel(x, v);
    const k2x = v + (dt / 2) * k1v;
    const k2v = accel(x + (dt / 2) * k1x, v + (dt / 2) * k1v);
    const k3x = v + (dt / 2) * k2v;
    const k3v = accel(x + (dt / 2) * k2x, v + (dt / 2) * k2v);
    const k4x = v + dt * k3v;
    const k4v = accel(x + dt * k3x, v + dt * k3v);
    x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    if (i % 100 === 0) {
      out.push({t: i * dt, value: x, velocity: v});
    }
  }
  return out;
}

const RATIOS = [
  0, 0.05, 0.3, 0.5, 0.75, 0.9, 0.99, 0.999999, 1, 1.000001, 1.2, 2, 5,
];
const RESPONSES = [0.15, 0.35, 0.5, 1];
const RELEASES = [
  {from: 0, to: 1, velocity: 0},
  {from: 0, to: 300, velocity: 0},
  {from: 300, to: 0, velocity: -2500},
  {from: -120, to: 80, velocity: 4000},
  // Zero displacement, all velocity: the case UIKit's relative velocity
  // cannot express.
  {from: 50, to: 50, velocity: 1800},
];

describe('solveSpring matches an RK4 integration of the ODE', () => {
  for (const dampingRatio of RATIOS) {
    for (const response of RESPONSES) {
      it(`ζ=${dampingRatio}, response=${response}s`, () => {
        // springFromResponse keeps overdamping, so every regime is covered.
        const spring = springFromResponse({response, dampingRatio});
        for (const release of RELEASES) {
          const curve = solveSpring(spring, release);
          const scale = Math.max(
            1,
            Math.abs(release.from - release.to),
            Math.abs(release.velocity) * response,
          );
          for (const sample of rk4(
            spring,
            release.from,
            release.to,
            release.velocity,
            1.5,
          )) {
            expect(Math.abs(curve.value(sample.t) - sample.value)).toBeLessThan(
              1e-6 * scale,
            );
            expect(
              Math.abs(curve.velocity(sample.t) - sample.velocity),
            ).toBeLessThan((1e-6 * scale * 2 * Math.PI) / response);
          }
        }
      });
    }
  }
});

describe('solveSpring', () => {
  it('agrees with WebKit\u2019s SpringSolver (an independent port of its code)', () => {
    // Source/WebCore/platform/graphics/SpringSolver.h, verbatim in
    // structure: unit move, initial velocity positive toward the target.
    const webkitSolve = (
      m: number,
      k: number,
      c: number,
      v0: number,
      t: number,
    ) => {
      const w0 = Math.sqrt(k / m);
      const zeta = c / (2 * Math.sqrt(k * m));
      let x: number;
      if (zeta < 1) {
        const wd = w0 * Math.sqrt(1 - zeta * zeta);
        const b = (zeta * w0 + -v0) / wd;
        x =
          Math.exp(-t * zeta * w0) * (Math.cos(wd * t) + b * Math.sin(wd * t));
      } else {
        x = (1 + (-v0 + w0) * t) * Math.exp(-t * w0);
      }
      return 1 - x;
    };
    const cases = [
      [1, 438.64908449286042, 31.415926535897931, 0],
      [1, 322.27279677026473, 31.2364069556928, 0],
      [1, 100, 5, 0],
      [1, 100, 20, 0],
      [2, 300, 12, 4],
      [1, 250, 31.6227766016838, -3],
    ];
    for (const [m, k, c, v0] of cases) {
      const curve = solveSpring(
        springFromPhysics({mass: m, stiffness: k, damping: c}),
        {
          from: 0,
          to: 1,
          velocity: v0,
        },
      );
      for (let t = 0; t <= 1.5; t += 0.01) {
        expect(curve.value(t)).toBeCloseTo(webkitSolve(m, k, c, v0, t), 6);
      }
    }
  });

  it('starts at the release value and velocity in every regime', () => {
    for (const dampingRatio of RATIOS) {
      const curve = solveSpring(
        springFromResponse({response: 0.4, dampingRatio}),
        {
          from: 10,
          to: 250,
          velocity: -700,
        },
      );
      expect(curve.value(0)).toBeCloseTo(10, 9);
      expect(curve.velocity(0)).toBeCloseTo(-700, 6);
    }
  });

  it('is continuous across critical damping', () => {
    const release = {from: 0, to: 300, velocity: 1200};
    const critical = solveSpring(
      springFromResponse({response: 0.5, dampingRatio: 1}),
      release,
    );
    for (const dampingRatio of [1 - 1e-5, 1 - 1e-7, 1 + 1e-7, 1 + 1e-5]) {
      const near = solveSpring(
        springFromResponse({response: 0.5, dampingRatio}),
        release,
      );
      for (let t = 0; t <= 1.5; t += 0.01) {
        expect(Math.abs(near.value(t) - critical.value(t))).toBeLessThan(0.01);
      }
    }
  });

  it('comes to rest at the target', () => {
    for (const dampingRatio of RATIOS.filter(r => r > 0)) {
      const curve = solveSpring(
        springFromResponse({response: 0.3, dampingRatio}),
        {from: 0, to: 100},
      );
      const settle = curve.settleTime(0.01);
      expect(Math.abs(curve.value(settle + 5) - 100)).toBeLessThan(0.01);
    }
  });

  it('settleTime bounds every later displacement (property sweep)', () => {
    for (const dampingRatio of RATIOS.filter(r => r > 0)) {
      for (const response of RESPONSES) {
        for (const release of RELEASES) {
          const curve = solveSpring(
            springFromResponse({response, dampingRatio}),
            release,
          );
          for (const threshold of [1, 0.1, 0.001]) {
            const settle = curve.settleTime(threshold);
            expect(Number.isFinite(settle)).toBe(true);
            for (let i = 0; i <= 400; i++) {
              const t = settle + (i / 400) * 3 * response;
              expect(Math.abs(curve.value(t) - release.to)).toBeLessThanOrEqual(
                threshold * (1 + 1e-9),
              );
            }
          }
        }
      }
    }
  });

  it('settleTime is 0 when already settled, Infinity when undamped and displaced', () => {
    const spring = springFromResponse({response: 0.4, dampingRatio: 0.8});
    expect(solveSpring(spring, {from: 5, to: 5}).settleTime(0.5)).toBe(0);
    expect(solveSpring(spring, {from: 5.1, to: 5}).settleTime(0.5)).toBe(0);
    const undamped = springFromResponse({response: 0.4, dampingRatio: 0});
    expect(solveSpring(undamped, {from: 0, to: 1}).settleTime(0.001)).toBe(
      Infinity,
    );
  });

  it('an undamped spring oscillates with the response as its period (WWDC23: bounce 1 is a cosine)', () => {
    const curve = solveSpring(
      springFromDurationBounce({duration: 0.5, bounce: 1}),
      {from: 0, to: 1},
    );
    for (let t = 0; t <= 2; t += 0.05) {
      expect(curve.value(t)).toBeCloseTo(
        1 - Math.cos((2 * Math.PI * t) / 0.5),
        9,
      );
    }
  });
});

describe('solveSpringTowardRamp (a target moving at constant speed)', () => {
  /** RK4 on m·x″ + c·x′ + k·(x − (target + slope·t)) = 0. */
  function rk4Ramp(
    spring: Spring,
    {
      from,
      velocity,
      target,
      slope,
    }: {from: number; velocity: number; target: number; slope: number},
    until: number,
    dt = 1e-4,
  ): {t: number; value: number; velocity: number}[] {
    const {mass: m, stiffness: k, damping: c} = spring;
    const accel = (time: number, x: number, v: number) =>
      (-k * (x - (target + slope * time)) - c * v) / m;
    let x = from;
    let v = velocity;
    const out = [{t: 0, value: x, velocity: v}];
    const steps = Math.round(until / dt);
    for (let i = 1; i <= steps; i++) {
      const time = (i - 1) * dt;
      const k1x = v;
      const k1v = accel(time, x, v);
      const k2x = v + (dt / 2) * k1v;
      const k2v = accel(time + dt / 2, x + (dt / 2) * k1x, v + (dt / 2) * k1v);
      const k3x = v + (dt / 2) * k2v;
      const k3v = accel(time + dt / 2, x + (dt / 2) * k2x, v + (dt / 2) * k2v);
      const k4x = v + dt * k3v;
      const k4v = accel(time + dt, x + dt * k3x, v + dt * k3v);
      x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
      v += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
      if (i % 100 === 0) {
        out.push({t: i * dt, value: x, velocity: v});
      }
    }
    return out;
  }

  it.each([
    {
      name: 'underdamped',
      spring: springFromResponse({response: 0.32, dampingRatio: 0.8}),
      slope: 0.16,
    },
    {
      name: 'critically damped',
      spring: springFromResponse({response: 0.3, dampingRatio: 1}),
      slope: -40,
    },
    {
      name: 'overdamped',
      spring: springFromPhysics({
        stiffness: 100,
        damping: 40,
        allowOverdamping: true,
      }),
      slope: 250,
    },
  ])('matches an RK4 integration ($name)', ({spring, slope}) => {
    const start = {from: 1, velocity: 0.5, target: 1.02, slope};
    const curve = solveSpringTowardRamp(spring, start);
    const scale = Math.max(1, Math.abs(slope));
    for (const sample of rk4Ramp(spring, start, 1.5)) {
      expect(Math.abs(curve.value(sample.t) - sample.value)).toBeLessThan(
        1e-7 * scale,
      );
      expect(Math.abs(curve.velocity(sample.t) - sample.velocity)).toBeLessThan(
        1e-6 * scale,
      );
    }
  });

  it('starts where it is told and settles lag behind, at the target\u2019s speed', () => {
    const spring = springFromResponse({response: 0.3, dampingRatio: 1});
    const curve = solveSpringTowardRamp(spring, {
      from: 0,
      velocity: 2,
      target: 0,
      slope: 10,
    });
    expect(curve.value(0)).toBeCloseTo(0, 12);
    expect(curve.velocity(0)).toBeCloseTo(2, 12);
    expect(curve.lag).toBeCloseTo((spring.damping * 10) / spring.stiffness, 12);
    expect(curve.value(5) - (10 * 5 - curve.lag)).toBeCloseTo(0, 6);
    expect(curve.velocity(5)).toBeCloseTo(10, 6);
  });

  it('with no slope it is the ordinary spring', () => {
    const spring = springFromResponse({response: 0.35, dampingRatio: 0.85});
    const ramp = solveSpringTowardRamp(spring, {
      from: 0,
      velocity: 3,
      target: 1,
      slope: 0,
    });
    const plain = solveSpring(spring, {from: 0, to: 1, velocity: 3});
    for (let t = 0; t <= 1; t += 0.05) {
      expect(ramp.value(t)).toBeCloseTo(plain.value(t), 12);
      expect(ramp.velocity(t)).toBeCloseTo(plain.velocity(t), 12);
    }
  });
});

describe('conversions', () => {
  it('(duration, bounce) follows the WWDC23 equations', () => {
    // stiffness = (2π ÷ duration)², damping = (1 − bounce) × 4π ÷ duration.
    const bouncy = springFromDurationBounce({duration: 0.5, bounce: 0.3});
    expect(bouncy.mass).toBe(1);
    expect(bouncy.stiffness).toBeCloseTo(((2 * Math.PI) / 0.5) ** 2, 9);
    expect(bouncy.damping).toBeCloseTo((0.7 * 4 * Math.PI) / 0.5, 9);
    // damping = 4π ÷ (duration × (1 + bounce)) for negative bounce.
    const flattened = springFromDurationBounce({duration: 0.4, bounce: -0.5});
    expect(flattened.damping).toBeCloseTo((4 * Math.PI) / (0.4 * 0.5), 9);
    expect(dampingRatioOf(flattened)).toBeCloseTo(2, 9);
  });

  it('round-trips (duration, bounce) over the whole range', () => {
    for (const duration of [0.15, 0.3, 0.5, 0.75, 1.2]) {
      for (const bounce of [-0.9, -0.5, -0.1, 0, 0.15, 0.3, 0.6, 0.95, 1]) {
        const back = durationBounceOf(
          springFromDurationBounce({duration, bounce}),
        );
        expect(back.duration).toBeCloseTo(duration, 9);
        expect(back.bounce).toBeCloseTo(bounce, 9);
      }
    }
  });

  it('SwiftUI presets map to their damping ratios (smooth 0, snappy 0.15, bouncy 0.3)', () => {
    expect(
      dampingRatioOf(springFromDurationBounce({duration: 0.5, bounce: 0})),
    ).toBeCloseTo(1, 12);
    expect(
      dampingRatioOf(springFromDurationBounce({duration: 0.5, bounce: 0.15})),
    ).toBeCloseTo(0.85, 12);
    expect(
      dampingRatioOf(springFromDurationBounce({duration: 0.5, bounce: 0.3})),
    ).toBeCloseTo(0.7, 12);
  });

  it('(response, dampingRatio) reproduces WebKit\u2019s UIKit-matched switch springs exactly', () => {
    // Source/WebCore/rendering/cocoa/RenderThemeCocoa.mm:
    // SpringSolver(1.0, 438.64908449286042, 31.415926535897931, 0.0) and
    // SpringSolver(1.0, 322.27279677026473, 31.2364069556928, 0.0).
    const move = springFromResponse({response: 0.3, dampingRatio: 0.75});
    expect(move.stiffness).toBeCloseTo(438.64908449286042, 9);
    expect(move.damping).toBeCloseTo(31.415926535897931, 9);
    const press = springFromResponse({response: 0.35, dampingRatio: 0.87});
    expect(press.stiffness).toBeCloseTo(322.27279677026473, 9);
    expect(press.damping).toBeCloseTo(31.2364069556928, 9);
  });

  it('round-trips (response, dampingRatio) and physics', () => {
    const spring = springFromPhysics({mass: 2, stiffness: 300, damping: 20});
    const {response, dampingRatio} = responseDampingOf(spring);
    expect(response).toBeCloseTo((2 * Math.PI) / Math.sqrt(150), 12);
    expect(dampingRatio).toBeCloseTo(20 / (2 * Math.sqrt(600)), 12);
    // A different mass with the same ω₀ and ζ is the same motion.
    const unit = springFromResponse({response, dampingRatio});
    const a = solveSpring(spring, {from: 0, to: 1, velocity: 3});
    const b = solveSpring(unit, {from: 0, to: 1, velocity: 3});
    for (let t = 0; t < 1; t += 0.05) {
      expect(a.value(t)).toBeCloseTo(b.value(t), 9);
    }
    expect(responseOf(unit)).toBeCloseTo(response, 12);
  });

  it('treats an overdamped physics spring as critical unless allowed (SwiftUI, UIKit)', () => {
    const clamped = springFromPhysics({stiffness: 100, damping: 50});
    expect(dampingRatioOf(clamped)).toBeCloseTo(1, 12);
    const kept = springFromPhysics({
      stiffness: 100,
      damping: 50,
      allowOverdamping: true,
    });
    expect(dampingRatioOf(kept)).toBeCloseTo(2.5, 12);
  });

  it('rejects impossible parameters', () => {
    expect(() => springFromDurationBounce({duration: 0, bounce: 0})).toThrow(
      RangeError,
    );
    expect(() => springFromResponse({response: -1, dampingRatio: 1})).toThrow(
      RangeError,
    );
    expect(() => springFromPhysics({stiffness: 100, damping: -1})).toThrow(
      RangeError,
    );
    expect(() =>
      springFromPhysics({mass: 0, stiffness: 100, damping: 1}),
    ).toThrow(RangeError);
  });

  it('relative velocity follows UIKit\u2019s documented example', () => {
    // "if the total animation distance is 200 points and you want the start
    // of the animation to match a view velocity of 100 pt/s, use 0.5"
    expect(relativeVelocity(100, 0, 200)).toBe(0.5);
    expect(absoluteVelocity(0.5, 0, 200)).toBe(100);
    expect(relativeVelocity(-100, 300, 100)).toBe(0.5);
  });
});

describe('settlingDuration (CASpringAnimation semantics)', () => {
  it('matches Apple\u2019s CASpringAnimation documentation example', () => {
    // mass 1, stiffness 100: damping 5 → "approximately 2.85 seconds";
    // damping 15 → "just over 1 second".
    const loose = settlingDuration(
      springFromPhysics({stiffness: 100, damping: 5}),
    );
    expect(loose).toBeGreaterThan(2.845);
    expect(loose).toBeLessThan(2.865);
    const tight = settlingDuration(
      springFromPhysics({stiffness: 100, damping: 15}),
    );
    expect(tight).toBeGreaterThan(1);
    expect(tight).toBeLessThan(1.05);
  });

  it('matches WebKit\u2019s iOS switch durations, the settling durations of its springs', () => {
    // Source/WebCore/rendering/ios/RenderThemeIOS.h:
    // switchAnimationVisuallyOnDuration 0.4880138408543766_s,
    // switchAnimationHeldDuration 0.5073965509413827_s.
    expect(
      settlingDuration(springFromResponse({response: 0.3, dampingRatio: 0.75})),
    ).toBeCloseTo(0.4880138408543766, 9);
    expect(
      settlingDuration(
        springFromResponse({response: 0.35, dampingRatio: 0.87}),
      ),
    ).toBeCloseTo(0.5073965509413827, 9);
  });

  it('is shorter for a stiffer or a better-damped spring, as documented', () => {
    const base = settlingDuration(
      springFromPhysics({stiffness: 100, damping: 10}),
    );
    expect(
      settlingDuration(springFromPhysics({stiffness: 200, damping: 10})),
    ).toBeLessThan(base);
    expect(
      settlingDuration(springFromPhysics({stiffness: 100, damping: 15})),
    ).toBeLessThan(base);
    expect(
      settlingDuration(
        springFromPhysics({mass: 2, stiffness: 100, damping: 10}),
      ),
    ).toBeGreaterThan(base);
  });

  it('a critically damped unit move settles at (1 + u)·e^(−u) = ε', () => {
    const spring = springFromResponse({response: 0.5, dampingRatio: 1});
    const omega = (2 * Math.PI) / 0.5;
    const u = settlingDuration(spring) * omega;
    expect((1 + u) * Math.exp(-u)).toBeCloseTo(0.001, 9);
  });

  it('accounts for the initial velocity', () => {
    const spring = springFromResponse({response: 0.5, dampingRatio: 0.8});
    const still = settlingDuration(spring);
    // Moving away from the target, or toward it hard enough to overshoot
    // further, settles later; a velocity close to the spring's own natural
    // start (here ζ·ω₀ ≈ 10 distances/s) shrinks the oscillation instead.
    expect(settlingDuration(spring, {initialVelocity: -8})).toBeGreaterThan(
      still,
    );
    expect(settlingDuration(spring, {initialVelocity: 40})).toBeGreaterThan(
      still,
    );
    expect(settlingDuration(spring, {initialVelocity: 8})).toBeLessThan(still);
  });
});

// Read from UIKit on the iOS 26.2 simulator (UIKit lab, injected host app,
// iPhone 17 Pro, Oct 23 2026): CASpringAnimation.settlingDuration for mass 1,
// stiffness 100, and the duration UIKit gives UIView.animate(springDuration:
// bounce:initialSpringVelocity:).
const CA_SETTLING = [
  {damping: 5, velocity: 0, settling: 2.854974609888761},
  {damping: 5, velocity: 5, settling: 2.854974609888761},
  {damping: 5, velocity: -5, settling: 2.992531378997136},
  {damping: 10, velocity: 0, settling: 1.4727003346780927},
  {damping: 10, velocity: 5, settling: 1.3815510557964277},
  {damping: 10, velocity: -5, settling: 1.5350814063145797},
  {damping: 15, velocity: 0, settling: 1.0220937981854987},
  {damping: 15, velocity: 5, settling: 0.9637816892907282},
  {damping: 15, velocity: -5, settling: 1.0625267085113923},
];
const UIKIT_SPRING_DURATION = [
  {duration: 0.3, bounce: 0, velocity: 0, uikit: 0.4409405178437803},
  {duration: 0.3, bounce: 0, velocity: 2, uikit: 0.43617534275714415},
  {duration: 0.3, bounce: 0.15, velocity: 0, uikit: 0.4419904194536484},
  {duration: 0.3, bounce: 0.15, velocity: 2, uikit: 0.4379526271453696},
  {duration: 0.3, bounce: 0.3, velocity: 0, uikit: 0.5177731699046524},
  {duration: 0.5, bounce: 0, velocity: 0, uikit: 0.734900863},
  {duration: 0.5, bounce: 0.15, velocity: 0, uikit: 0.736650699089414},
  {duration: 0.5, bounce: 0.3, velocity: 2, uikit: 0.8493819071116907},
  {duration: 1, bounce: 0, velocity: 0, uikit: 1.469801726},
  {duration: 1, bounce: 0, velocity: 2, uikit: 1.410252226},
  {duration: 1, bounce: 0.15, velocity: 2, uikit: 1.4240715395795775},
  {duration: 1, bounce: 0.3, velocity: 0, uikit: 1.725910566348841},
];

describe('settlingDuration against values read from UIKit', () => {
  it.each(CA_SETTLING)(
    'CASpringAnimation(stiffness 100, damping $damping, v $velocity).settlingDuration',
    ({damping, velocity, settling}) => {
      const spring = springFromPhysics({stiffness: 100, damping});
      expect(settlingDuration(spring, {initialVelocity: velocity})).toBeCloseTo(
        settling,
        12,
      );
    },
  );

  it.each(UIKIT_SPRING_DURATION)(
    'UIView.animate(springDuration: $duration, bounce: $bounce, v $velocity) runs $uikit s',
    ({duration, bounce, velocity, uikit}) => {
      const spring = springFromDurationBounce({duration, bounce});
      const mine = settlingDuration(spring, {initialVelocity: velocity});
      if (bounce > 0) {
        expect(mine).toBeCloseTo(uikit, 12);
      } else {
        // Critically damped: UIKit stops 0.0016 later in ω₀·t.
        expect(Math.abs(mine - uikit) / uikit).toBeLessThan(3e-4);
      }
    },
  );

  it('UIKit’s default spring runs 0.505824 s: overdamping clamped to critical', () => {
    const spring = springFromPhysics({mass: 3, stiffness: 1000, damping: 500});
    expect(dampingRatioOf(spring)).toBeCloseTo(1, 12);
    expect(
      Math.abs(settlingDuration(spring) - 0.505824) / 0.505824,
    ).toBeLessThan(3e-4);
  });
});

describe('springFromUIKitDampingDuration (legacy damping/duration API)', () => {
  // Read from UIKit (same capture): UIView.animate(withDuration: D,
  // usingSpringWithDamping: ζ, initialSpringVelocity: 0) → mass 1 and these.
  it.each([
    {duration: 0.3, dampingRatio: 0.5, stiffness: 1796.883, damping: 42.3897},
    {duration: 0.3, dampingRatio: 0.8, stiffness: 898.86, damping: 47.9696},
    {duration: 0.3, dampingRatio: 1, stiffness: 947.288, damping: 61.5561},
    {duration: 0.5, dampingRatio: 0.5, stiffness: 646.878, damping: 25.4338},
    {duration: 0.5, dampingRatio: 0.8, stiffness: 323.589, damping: 28.7817},
    {duration: 0.5, dampingRatio: 1, stiffness: 341.024, damping: 36.9337},
    {duration: 1, dampingRatio: 0.5, stiffness: 161.72, damping: 12.7169},
    {duration: 1, dampingRatio: 0.8, stiffness: 80.897, damping: 14.3909},
    {duration: 1, dampingRatio: 1, stiffness: 85.256, damping: 18.4668},
  ])(
    'D $duration, ζ $dampingRatio → stiffness $stiffness',
    ({duration, dampingRatio, stiffness, damping}) => {
      const spring = springFromUIKitDampingDuration({duration, dampingRatio});
      expect(spring.mass).toBe(1);
      expect(Math.abs(spring.stiffness - stiffness) / stiffness).toBeLessThan(
        1e-4,
      );
      expect(Math.abs(spring.damping - damping) / damping).toBeLessThan(1e-4);
    },
  );

  it('at ζ 1 the derived spring settles exactly at the duration', () => {
    const spring = springFromUIKitDampingDuration({
      duration: 0.4,
      dampingRatio: 1,
    });
    expect(settlingDuration(spring)).toBeCloseTo(0.4, 3);
  });

  it.each([
    {dampingRatio: 0.1, omega: 46.1019536228216},
    {dampingRatio: 0.3, omega: 19.1698},
    {dampingRatio: 0.65, omega: 10.3869},
    {dampingRatio: 0.95, omega: 8.4425},
  ])(
    'reproduces the wide read at D 1, ζ $dampingRatio',
    ({dampingRatio, omega}) => {
      const spring = springFromUIKitDampingDuration({
        duration: 1,
        dampingRatio,
      });
      expect(Math.sqrt(spring.stiffness)).toBeCloseTo(omega, 3);
    },
  );

  it('interpolates between the measured ratios', () => {
    const a = springFromUIKitDampingDuration({duration: 1, dampingRatio: 0.6});
    const b = springFromUIKitDampingDuration({
      duration: 1,
      dampingRatio: 0.625,
    });
    const c = springFromUIKitDampingDuration({duration: 1, dampingRatio: 0.65});
    expect(Math.sqrt(b.stiffness)).toBeCloseTo(
      (Math.sqrt(a.stiffness) + Math.sqrt(c.stiffness)) / 2,
      9,
    );
  });
});
