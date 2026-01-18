import {
  easeBounceOut,
  easeCubicInOut,
  easeCubicOut,
  easeLinear,
  getEasing,
} from '../../src/utils/easing';

// TypeScript-only acceptance checks for Story 5.14.
// This file is excluded from the library build (tsconfig excludes `examples/`).

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const assertEqual = (label: string, actual: number, expected: number): void => {
  assert(
    actual === expected,
    `${label}: expected ${expected} but got ${actual}`,
  );
};

const assertApproxEqual = (
  label: string,
  actual: number,
  expected: number,
  epsilon: number,
): void => {
  assert(
    Math.abs(actual - expected) <= epsilon,
    `${label}: expected ~${expected} (±${epsilon}) but got ${actual}`,
  );
};

const assertInClosedRange = (
  label: string,
  actual: number,
  minInclusive: number,
  maxInclusive: number,
): void => {
  assert(
    Number.isFinite(actual),
    `${label}: expected finite number but got ${actual}`,
  );
  assert(
    actual >= minInclusive && actual <= maxInclusive,
    `${label}: expected in [${minInclusive}, ${maxInclusive}] but got ${actual}`,
  );
};

const sampleCurve = (
  label: string,
  f: (t: number) => number,
  samples: number,
): void => {
  const eps = 1e-12;
  const y0 = f(0);
  assertInClosedRange(`${label} f(0)`, y0, 0 - eps, 1 + eps);

  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples;
    const y = f(t);
    assertInClosedRange(`${label} f(${t})`, y, 0 - eps, 1 + eps);
  }
};

const assertMonotonicNonDecreasing = (
  label: string,
  f: (t: number) => number,
  samples: number,
): void => {
  const eps = 1e-12;
  let prev = f(0);

  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples;
    const y = f(t);
    assert(
      y + eps >= prev,
      `${label}: expected monotonic non-decreasing at t=${t}; prev=${prev}, got=${y}`,
    );
    prev = y;
  }
};

const isMonotonicNonDecreasing = (
  f: (t: number) => number,
  samples: number,
): boolean => {
  const eps = 1e-12;
  let prev = f(0);

  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples;
    const y = f(t);
    if (!(y + eps >= prev)) return false;
    prev = y;
  }

  return true;
};

// endpoints: f(0)=0, f(1)=1
{
  assertEqual('easeLinear f(0)', easeLinear(0), 0);
  assertEqual('easeLinear f(1)', easeLinear(1), 1);

  assertEqual('easeCubicOut f(0)', easeCubicOut(0), 0);
  assertEqual('easeCubicOut f(1)', easeCubicOut(1), 1);

  assertEqual('easeCubicInOut f(0)', easeCubicInOut(0), 0);
  assertEqual('easeCubicInOut f(1)', easeCubicInOut(1), 1);

  assertEqual('easeBounceOut f(0)', easeBounceOut(0), 0);
  assertEqual('easeBounceOut f(1)', easeBounceOut(1), 1);
}

// clamping / non-finite inputs
{
  const assertClamping = (label: string, f: (t: number) => number): void => {
    assertEqual(`${label} f(-1)`, f(-1), 0);
    assertEqual(`${label} f(2)`, f(2), 1);
    assertEqual(`${label} f(NaN)`, f(Number.NaN), 0);
    assertEqual(`${label} f(Infinity)`, f(Number.POSITIVE_INFINITY), 1);
    assertEqual(`${label} f(-Infinity)`, f(Number.NEGATIVE_INFINITY), 0);
  };

  assertClamping('easeLinear', easeLinear);
  assertClamping('easeCubicOut', easeCubicOut);
  assertClamping('easeCubicInOut', easeCubicInOut);
  assertClamping('easeBounceOut', easeBounceOut);
}

// shape spot-checks (approx to avoid float noise)
{
  const eps = 1e-12;

  assertApproxEqual('easeCubicOut f(0.5)', easeCubicOut(0.5), 0.875, eps);
  assertApproxEqual('easeCubicOut f(0.25)', easeCubicOut(0.25), 0.578125, eps);
  assertApproxEqual('easeCubicOut f(0.75)', easeCubicOut(0.75), 0.984375, eps);

  assertApproxEqual(
    'easeCubicInOut f(0.25)',
    easeCubicInOut(0.25),
    0.0625,
    eps,
  );
  assertApproxEqual('easeCubicInOut f(0.5)', easeCubicInOut(0.5), 0.5, eps);
  assertApproxEqual(
    'easeCubicInOut f(0.75)',
    easeCubicInOut(0.75),
    0.9375,
    eps,
  );
}

// range: for t sampled in [0,1], output is finite and in [0,1]
{
  const samples = 10_000;
  sampleCurve('easeLinear', easeLinear, samples);
  sampleCurve('easeCubicOut', easeCubicOut, samples);
  sampleCurve('easeCubicInOut', easeCubicInOut, samples);
  sampleCurve('easeBounceOut', easeBounceOut, samples);
}

// monotonic non-decreasing (where expected)
{
  const samples = 10_000;
  assertMonotonicNonDecreasing('easeLinear', easeLinear, samples);
  assertMonotonicNonDecreasing('easeCubicOut', easeCubicOut, samples);
  assertMonotonicNonDecreasing('easeCubicInOut', easeCubicInOut, samples);

  // `easeOutBounce`-style curves are often *not* monotonic; only enforce this
  // property for bounceOut if the current implementation happens to satisfy it.
  if (isMonotonicNonDecreasing(easeBounceOut, samples)) {
    assertMonotonicNonDecreasing('easeBounceOut', easeBounceOut, samples);
  }
}

// getEasing(name) mapping + fallback behavior
{
  assert(
    getEasing('linear') === easeLinear,
    'getEasing("linear") should return easeLinear reference',
  );
  assert(
    getEasing('cubicOut') === easeCubicOut,
    'getEasing("cubicOut") should return easeCubicOut reference',
  );
  assert(
    getEasing('cubicInOut') === easeCubicInOut,
    'getEasing("cubicInOut") should return easeCubicInOut reference',
  );
  assert(
    getEasing('bounceOut') === easeBounceOut,
    'getEasing("bounceOut") should return easeBounceOut reference',
  );

  assert(
    getEasing(undefined) === easeLinear,
    'getEasing(undefined) should fall back to easeLinear reference',
  );
  assert(
    getEasing(null) === easeLinear,
    'getEasing(null) should fall back to easeLinear reference',
  );

  type EasingName = import('../../src/config/types').AnimationConfig['easing'];
  const unknownName = 'definitelyNotARealEasing' as unknown as EasingName;
  assert(
    getEasing(unknownName) === easeLinear,
    'getEasing(unknown) should fall back to easeLinear reference',
  );
}

