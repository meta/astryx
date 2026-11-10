//! Clock related types and functions.

use crate::sys::time::Instant;

/// A monotonic instant in time, in the Boa engine.
///
/// This type is guaranteed to be monotonic, i.e. if two instants
/// are compared, the later one will always be greater than the
/// earlier one.
///
/// This mirrors the behavior of [`std::time::Instant`] and represents
/// a measurement of elapsed time relative to an arbitrary starting point.
/// It is NOT tied to wall-clock time or the Unix epoch, and system clock
/// adjustments will not affect it.
///
/// This should not be used to keep dates or times, but only to
/// measure monotonic time progression in the engine.
#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord)]
pub struct JsInstant {
    /// The duration of time since an arbitrary starting point.
    inner: std::time::Duration,
}

impl JsInstant {
    /// Creates a new `JsInstant` from the given number of seconds and nanoseconds.
    #[must_use]
    pub fn new(secs: u64, nanos: u32) -> Self {
        let inner = std::time::Duration::new(secs, nanos);
        Self::new_unchecked(inner)
    }

    /// Creates a new `JsInstant` from an unchecked duration since the Unix epoch.
    #[must_use]
    fn new_unchecked(inner: std::time::Duration) -> Self {
        Self { inner }
    }

    /// Returns the number of milliseconds since the clock's starting point.
    ///
    /// Note: This is NOT a Unix timestamp. It represents elapsed time
    /// since an arbitrary starting point and is only meaningful for
    /// measuring durations and comparing instants.
    #[must_use]
    pub fn millis_since_epoch(&self) -> u64 {
        self.inner.as_millis() as u64
    }

    /// Returns the number of nanoseconds since the clock's starting point.
    ///
    /// Note: This is NOT a Unix timestamp. It represents elapsed time
    /// since an arbitrary starting point and is only meaningful for
    /// measuring durations and comparing instants.
    #[must_use]
    pub fn nanos_since_epoch(&self) -> u128 {
        self.inner.as_nanos()
    }
}

/// A duration of time, inside the Boa engine.
#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord)]
pub struct JsDuration {
    inner: std::time::Duration,
}

impl JsDuration {
    /// Creates a new `JsDuration` from the given number of milliseconds.
    #[must_use]
    pub fn from_millis(millis: u64) -> Self {
        Self {
            inner: std::time::Duration::from_millis(millis),
        }
    }

    /// Returns the number of milliseconds in this duration.
    #[must_use]
    pub fn as_millis(&self) -> u64 {
        self.inner.as_millis() as u64
    }

    /// Returns the number of seconds in this duration.
    #[must_use]
    pub fn as_secs(&self) -> u64 {
        self.inner.as_secs()
    }

    /// Returns the number of nanoseconds in this duration.
    #[must_use]
    pub fn as_nanos(&self) -> u128 {
        self.inner.as_nanos()
    }
}

impl From<std::time::Duration> for JsDuration {
    fn from(duration: std::time::Duration) -> Self {
        Self { inner: duration }
    }
}

impl From<JsDuration> for std::time::Duration {
    fn from(duration: JsDuration) -> Self {
        duration.inner
    }
}

macro_rules! impl_duration_ops {
    ($($trait:ident $trait_fn:ident),*) => {
        $(
            impl std::ops::$trait for JsDuration {
                type Output = JsDuration;

                #[inline]
                fn $trait_fn(self, rhs: JsDuration) -> Self::Output {
                    Self {
                        inner: std::ops::$trait::$trait_fn(self.inner, rhs.inner)
                    }
                }
            }
            impl std::ops::$trait<JsDuration> for JsInstant {
                type Output = JsInstant;

                #[inline]
                fn $trait_fn(self, rhs: JsDuration) -> Self::Output {
                    Self {
                        inner: std::ops::$trait::$trait_fn(self.inner, rhs.inner)
                    }
                }
            }
        )*
    };
}

impl_duration_ops!(Add add, Sub sub);

impl std::ops::Sub for JsInstant {
    type Output = JsDuration;

    #[inline]
    fn sub(self, rhs: JsInstant) -> Self::Output {
        JsDuration {
            // saturating preserves the behaviour of std's Instant.
            inner: self.inner.saturating_sub(rhs.inner),
        }
    }
}

/// Implement a clock that can be used to measure time.
pub trait Clock {
    /// Returns the current monotonic time.
    ///
    /// Implementers must ensure this is monotonic and should be used for measuring
    /// durations and scheduling timeouts. The engine assumes monotonicity.
    fn now(&self) -> JsInstant;

    /// Returns the current wall-clock time in milliseconds since the Unix epoch.
    ///
    /// This is NOT monotonic and can go backward if the system clock is adjusted.
    /// It should only be used for `Date` objects and other wall-clock time needs.
    fn system_time_millis(&self) -> i64;
}

/// A clock that uses the standard monotonic clock.
///
/// This clock is based on the `instant` crate's `Instant` type, which provides
/// cross-platform monotonic time, including WASM support via `performance.now()`.
/// Time measurements are relative to an arbitrary starting point
/// (the first call to `now()`) and are not affected by system clock adjustments.
///
/// This ensures that time never goes backward, which is critical for
/// maintaining the invariants of [`JsInstant`].
#[derive(Debug, Clone, Copy)]
pub struct StdClock {
    /// The base instant from which all measurements are relative.
    base: Instant,
}

impl Default for StdClock {
    fn default() -> Self {
        Self::new()
    }
}

impl StdClock {
    /// Creates a new `StdClock` with the current instant as the base.
    #[must_use]
    pub fn new() -> Self {
        Self {
            base: Instant::now(),
        }
    }
}

impl Clock for StdClock {
    fn now(&self) -> JsInstant {
        let elapsed = self.base.elapsed();
        JsInstant::new_unchecked(elapsed)
    }

    fn system_time_millis(&self) -> i64 {
        let now = crate::sys::time::SystemTime::now();
        let duration = now
            .duration_since(crate::sys::time::UNIX_EPOCH)
            .expect("System clock is before Unix epoch");
        duration.as_millis() as i64
    }
}

/// A clock that uses a fixed time, useful for testing. The internal time is in milliseconds.
///
/// This clock will always return the same time, unless it is moved forward manually. It cannot
/// be moved backward or set to a specific time.
#[derive(Debug, Clone, Default)]
pub struct FixedClock(std::cell::RefCell<u64>);

impl FixedClock {
    /// Creates a new `FixedClock` from the given number of milliseconds since the Unix epoch.
    #[must_use]
    pub fn from_millis(millis: u64) -> Self {
        Self(std::cell::RefCell::new(millis))
    }

    /// Move the clock forward by the given number of milliseconds.
    pub fn forward(&self, millis: u64) {
        *self.0.borrow_mut() += millis;
    }
}

impl Clock for FixedClock {
    fn now(&self) -> JsInstant {
        let millis = *self.0.borrow();
        JsInstant::new_unchecked(std::time::Duration::new(
            millis / 1000,
            ((millis % 1000) * 1_000_000) as u32,
        ))
    }

    fn system_time_millis(&self) -> i64 {
        *self.0.borrow() as i64
    }
}

#[test]
fn basic() {
    let clock = StdClock::new();
    let now = clock.now();
    // Since we're using a relative clock, values are always >= 0 by type
    let _millis = now.millis_since_epoch();
    let _nanos = now.nanos_since_epoch();

    let duration = JsDuration::from_millis(1000);
    let later = now + duration;
    assert!(later > now);

    // Only subtract if we have enough time elapsed
    let duration_small = JsDuration::from_millis(100);
    let later_small = now + duration_small;
    let earlier = later_small - duration_small;
    assert_eq!(earlier, now);

    let diff = later - now;
    assert_eq!(diff.as_millis(), 1000);

    let fixed = FixedClock::from_millis(0);
    let now2 = fixed.now();
    assert_eq!(now2.millis_since_epoch(), 0);

    fixed.forward(1000);
    let now3 = fixed.now();
    assert_eq!(now3.millis_since_epoch(), 1000);
    assert!(now3 > now2);

    // End of time.
    fixed.forward(u64::MAX - 1000);
    let now4 = fixed.now();
    assert_eq!(now4.millis_since_epoch(), u64::MAX);
    assert!(now4 > now3);
}

#[test]
fn monotonic_behavior() {
    let clock = StdClock::new();

    // Verify that time always moves forward
    let t1 = clock.now();
    std::thread::sleep(std::time::Duration::from_millis(1));
    let t2 = clock.now();
    std::thread::sleep(std::time::Duration::from_millis(1));
    let t3 = clock.now();

    // Time must always increase
    assert!(t2 > t1, "Time must move forward");
    assert!(t3 > t2, "Time must continue moving forward");
    assert!(t3 > t1, "Time must be transitive");

    // Verify that elapsed time is reasonable
    let elapsed = t3 - t1;
    assert!(elapsed.as_millis() >= 2, "At least 2ms should have elapsed");
}

#[test]
fn clock_independence() {
    // Each clock instance has its own base instant
    let clock1 = StdClock::new();
    std::thread::sleep(std::time::Duration::from_millis(10));
    let clock2 = StdClock::new();

    let t1 = clock1.now();
    let t2 = clock2.now();

    // clock1 started earlier, so it should show more elapsed time
    assert!(t1.millis_since_epoch() >= t2.millis_since_epoch());
}
