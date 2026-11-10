use std::{
    cmp::Ordering,
    fmt::{self, Debug},
    num::NonZeroU32,
};

/// A position in the ECMAScript source code.
///
/// Stores both the column number and the line number.
///
/// ## Similar Implementations
/// [V8: Location](https://cs.chromium.org/chromium/src/v8/src/parsing/scanner.h?type=cs&q=isValid+Location&g=0&l=216)
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Position {
    /// Line number.
    line_number: NonZeroU32,
    /// Column number.
    column_number: NonZeroU32,
}

impl Default for Position {
    /// Creates a new [`Position`] with line and column set to `1`.
    #[inline]
    fn default() -> Self {
        Self::new(1, 1)
    }
}

impl Position {
    /// Creates a new `Position` from Non-Zero values.
    ///
    /// # Panics
    ///
    /// Will panic if the line number or column number is zero.
    #[inline]
    #[track_caller]
    #[must_use]
    pub const fn new(line_number: u32, column_number: u32) -> Self {
        Self {
            line_number: NonZeroU32::new(line_number).expect("line number cannot be 0"),
            column_number: NonZeroU32::new(column_number).expect("column number cannot be 0"),
        }
    }

    /// Gets the line number of the position.
    #[inline]
    #[must_use]
    pub const fn line_number(self) -> u32 {
        self.line_number.get()
    }

    /// Gets the column number of the position.
    #[inline]
    #[must_use]
    pub const fn column_number(self) -> u32 {
        self.column_number.get()
    }
}

impl fmt::Display for Position {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}", self.line_number, self.column_number)
    }
}

impl From<PositionGroup> for Position {
    #[inline]
    fn from(value: PositionGroup) -> Self {
        value.pos
    }
}

impl From<(NonZeroU32, NonZeroU32)> for Position {
    #[inline]
    fn from(value: (NonZeroU32, NonZeroU32)) -> Self {
        Position {
            line_number: value.0,
            column_number: value.1,
        }
    }
}

impl From<(u32, u32)> for Position {
    #[inline]
    #[track_caller]
    fn from(value: (u32, u32)) -> Self {
        Position::new(value.0, value.1)
    }
}

#[cfg(feature = "arbitrary")]
impl<'a> arbitrary::Arbitrary<'a> for Span {
    fn arbitrary(_u: &mut arbitrary::Unstructured<'a>) -> arbitrary::Result<Self> {
        Ok(Span::new(Position::new(1, 1), Position::new(1, 1)))
    }
}

/// Linear position in the ECMAScript source code.
///
/// Stores linear position in the source code.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "arbitrary", derive(arbitrary::Arbitrary))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
pub struct LinearPosition {
    pos: usize,
}

impl LinearPosition {
    /// Creates a new `LinearPosition`.
    #[inline]
    #[must_use]
    pub const fn new(pos: usize) -> Self {
        Self { pos }
    }
    /// Gets the linear position.
    #[inline]
    #[must_use]
    pub const fn pos(self) -> usize {
        self.pos
    }
}
impl fmt::Display for LinearPosition {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.pos())
    }
}

/// A span in the ECMAScript source code.
///
/// Stores a start position and an end position.
///
/// Note that spans are of the form [start, end) i.e. that the start position is inclusive
/// and the end position is exclusive.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct Span {
    start: Position,
    end: Position,
}

impl Debug for Span {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Span(({}, {}), ({}, {}))",
            self.start.line_number,
            self.start.column_number,
            self.end.line_number,
            self.end.column_number,
        )
    }
}

impl Span {
    /// Creates a new `Span`.
    ///
    /// # Panics
    ///
    /// Panics if the start position is bigger than the end position.
    #[inline]
    #[track_caller]
    #[must_use]
    pub fn new<T, U>(start: T, end: U) -> Self
    where
        T: Into<Position>,
        U: Into<Position>,
    {
        let start = start.into();
        let end = end.into();

        assert!(start <= end, "a span cannot start after its end");

        Self { start, end }
    }

    /// Gets the starting position of the span.
    #[inline]
    #[must_use]
    pub const fn start(self) -> Position {
        self.start
    }

    /// Gets the final position of the span.
    #[inline]
    #[must_use]
    pub const fn end(self) -> Position {
        self.end
    }

    /// Checks if this span inclusively contains another span or position.
    pub fn contains<S>(self, other: S) -> bool
    where
        S: Into<Self>,
    {
        let other = other.into();
        self.start <= other.start && self.end >= other.end
    }
}

impl From<Position> for Span {
    fn from(pos: Position) -> Self {
        Self {
            start: pos,
            end: pos,
        }
    }
}

impl Spanned for Span {
    #[inline]
    fn span(&self) -> Span {
        *self
    }
}

impl<T: Spanned> Spanned for &T {
    #[inline]
    fn span(&self) -> Span {
        T::span(*self)
    }
}

impl PartialOrd for Span {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        if self == other {
            Some(Ordering::Equal)
        } else if self.end < other.start {
            Some(Ordering::Less)
        } else if self.start > other.end {
            Some(Ordering::Greater)
        } else {
            None
        }
    }
}

impl fmt::Display for Span {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}..{}]", self.start, self.end)
    }
}

/// An element of the AST or any type that can be located in the source with a Span.
pub trait Spanned {
    /// Returns a span from the current type.
    #[must_use]
    fn span(&self) -> Span;
}

/// A linear span in the ECMAScript source code.
///
/// Stores a linear start position and a linear end position.
///
/// Note that linear spans are of the form [start, end) i.e. that the
/// start position is inclusive and the end position is exclusive.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Hash)]
pub struct LinearSpan {
    start: LinearPosition,
    end: LinearPosition,
}
impl LinearSpan {
    /// Creates a new `LinearSpan`.
    ///
    /// # Panics
    ///
    /// Panics if the start position is bigger than the end position.
    #[inline]
    #[track_caller]
    #[must_use]
    pub const fn new(start: LinearPosition, end: LinearPosition) -> Self {
        assert!(
            start.pos <= end.pos,
            "a linear span cannot start after its end"
        );

        Self { start, end }
    }

    /// Test if the span is empty.
    #[inline]
    #[must_use]
    pub fn is_empty(self) -> bool {
        self.start == self.end
    }

    /// Gets the starting position of the span.
    #[inline]
    #[must_use]
    pub const fn start(self) -> LinearPosition {
        self.start
    }

    /// Gets the final position of the span.
    #[inline]
    #[must_use]
    pub const fn end(self) -> LinearPosition {
        self.end
    }

    /// Checks if this span inclusively contains another span or position.
    pub fn contains<S>(self, other: S) -> bool
    where
        S: Into<Self>,
    {
        let other = other.into();
        self.start <= other.start && self.end >= other.end
    }

    /// Gets the starting position of the span.
    #[inline]
    #[must_use]
    pub fn union(self, other: impl Into<Self>) -> Self {
        let other: Self = other.into();
        Self {
            start: LinearPosition::new(self.start.pos.min(other.start.pos)),
            end: LinearPosition::new(self.end.pos.max(other.end.pos)),
        }
    }
}
#[cfg(feature = "arbitrary")]
impl<'a> arbitrary::Arbitrary<'a> for LinearSpan {
    fn arbitrary(_: &mut arbitrary::Unstructured<'a>) -> arbitrary::Result<Self> {
        let zero_pos = LinearPosition::new(0);
        Ok(Self::new(zero_pos, zero_pos))
    }
}

impl From<LinearPosition> for LinearSpan {
    fn from(pos: LinearPosition) -> Self {
        Self {
            start: pos,
            end: pos,
        }
    }
}

impl PartialOrd for LinearSpan {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        if self == other {
            Some(Ordering::Equal)
        } else if self.end < other.start {
            Some(Ordering::Less)
        } else if self.start > other.end {
            Some(Ordering::Greater)
        } else {
            None
        }
    }
}

/// Stores a `LinearSpan` but `PartialEq`, `Eq` always return true.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Debug, Clone, Copy)]
pub struct LinearSpanIgnoreEq(pub LinearSpan);
impl PartialEq for LinearSpanIgnoreEq {
    fn eq(&self, _: &Self) -> bool {
        true
    }
}
impl From<LinearSpan> for LinearSpanIgnoreEq {
    fn from(value: LinearSpan) -> Self {
        Self(value)
    }
}
#[cfg(feature = "arbitrary")]
impl<'a> arbitrary::Arbitrary<'a> for LinearSpanIgnoreEq {
    fn arbitrary(u: &mut arbitrary::Unstructured<'a>) -> arbitrary::Result<Self> {
        Ok(Self(LinearSpan::arbitrary(u)?))
    }
}

#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
/// A position group of `LinearPosition` and `Position` related to the same position in the ECMAScript source code.
pub struct PositionGroup {
    pos: Position,
    linear_pos: LinearPosition,
}
impl PositionGroup {
    /// Creates a new `PositionGroup`.
    #[inline]
    #[must_use]
    pub const fn new(pos: Position, linear_pos: LinearPosition) -> Self {
        Self { pos, linear_pos }
    }
    /// Get the `Position`.
    #[inline]
    #[must_use]
    pub fn position(&self) -> Position {
        self.pos
    }
    /// Get the `LinearPosition`.
    #[inline]
    #[must_use]
    pub fn linear_position(&self) -> LinearPosition {
        self.linear_pos
    }

    /// Gets the line number of the position.
    #[inline]
    #[must_use]
    pub const fn line_number(&self) -> u32 {
        self.pos.line_number()
    }

    /// Gets the column number of the position.
    #[inline]
    #[must_use]
    pub const fn column_number(&self) -> u32 {
        self.pos.column_number()
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::similar_names)]
    #![allow(unused_must_use)]
    use super::{LinearPosition, LinearSpan, Position, Span};

    /// Checks that we cannot create a position with 0 as the column.
    #[test]
    #[should_panic(expected = "column number cannot be 0")]
    fn invalid_position_column() {
        Position::new(10, 0);
    }

    /// Checks that we cannot create a position with 0 as the line.
    #[test]
    #[should_panic(expected = "line number cannot be 0")]
    fn invalid_position_line() {
        Position::new(0, 10);
    }

    /// Checks that the `PartialEq` implementation of `Position` is consistent.
    #[test]
    fn position_equality() {
        assert_eq!(Position::new(10, 50), Position::new(10, 50));
        assert_ne!(Position::new(10, 50), Position::new(10, 51));
        assert_ne!(Position::new(10, 50), Position::new(11, 50));
        assert_ne!(Position::new(10, 50), Position::new(11, 51));
    }

    /// Checks that the `PartialEq` implementation of `LinearPosition` is consistent.
    #[test]
    fn linear_position_equality() {
        assert_eq!(LinearPosition::new(1050), LinearPosition::new(1050));
        assert_ne!(LinearPosition::new(1050), LinearPosition::new(1051));
    }

    /// Checks that the `PartialOrd` implementation of `Position` is consistent.
    #[test]
    fn position_order() {
        assert!(Position::new(10, 50) < Position::new(10, 51));
        assert!(Position::new(9, 50) < Position::new(10, 50));
        assert!(Position::new(10, 50) < Position::new(11, 51));
        assert!(Position::new(10, 50) < Position::new(11, 49));

        assert!(Position::new(10, 51) > Position::new(10, 50));
        assert!(Position::new(10, 50) > Position::new(9, 50));
        assert!(Position::new(11, 51) > Position::new(10, 50));
        assert!(Position::new(11, 49) > Position::new(10, 50));
    }

    /// Checks that the `PartialOrd` implementation of `LinearPosition` is consistent.
    #[test]
    fn linear_position_order() {
        assert!(LinearPosition::new(1050) < LinearPosition::new(1051));
        assert!(LinearPosition::new(1149) > LinearPosition::new(1050));
    }

    /// Checks that the position getters actually retrieve correct values.
    #[test]
    fn position_getters() {
        let pos = Position::new(10, 50);
        assert_eq!(pos.line_number(), 10);
        assert_eq!(pos.column_number(), 50);
    }

    /// Checks that the string representation of a position is correct.
    #[test]
    fn position_to_string() {
        let pos = Position::new(10, 50);

        assert_eq!("10:50", pos.to_string());
        assert_eq!("10:50", pos.to_string());
    }

    /// Checks that we cannot create an invalid span.
    #[test]
    #[should_panic(expected = "a span cannot start after its end")]
    fn invalid_span() {
        let a = Position::new(10, 30);
        let b = Position::new(10, 50);
        Span::new(b, a);
    }

    /// Checks that we cannot create an invalid linear span.
    #[test]
    #[should_panic(expected = "a linear span cannot start after its end")]
    fn invalid_linear_span() {
        let a = LinearPosition::new(1030);
        let b = LinearPosition::new(1050);
        LinearSpan::new(b, a);
    }

    /// Checks that we can create valid spans.
    #[test]
    fn span_creation() {
        let a = Position::new(10, 30);
        let b = Position::new(10, 50);

        Span::new(a, b);
        Span::new(a, a);
        Span::from(a);
    }

    /// Checks that we can create valid linear spans.
    #[test]
    fn linear_span_creation() {
        let a = LinearPosition::new(1030);
        let b = LinearPosition::new(1050);

        LinearSpan::new(a, b);
        let span_aa = LinearSpan::new(a, a);
        assert_eq!(LinearSpan::from(a), span_aa);
    }

    /// Checks that the `PartialEq` implementation of `Span` is consistent.
    #[test]
    fn span_equality() {
        let a = Position::new(10, 50);
        let b = Position::new(10, 52);
        let c = Position::new(11, 20);

        let span_ab = Span::new(a, b);
        let span_ab_2 = Span::new(a, b);
        let span_ac = Span::new(a, c);
        let span_bc = Span::new(b, c);

        assert_eq!(span_ab, span_ab_2);
        assert_ne!(span_ab, span_ac);
        assert_ne!(span_ab, span_bc);
        assert_ne!(span_bc, span_ac);

        let span_a = Span::from(a);
        let span_aa = Span::new(a, a);

        assert_eq!(span_a, span_aa);
    }

    /// Checks that the `PartialEq` implementation of `LinearSpan` is consistent.
    #[test]
    fn linear_span_equality() {
        let a = LinearPosition::new(1030);
        let b = LinearPosition::new(1050);
        let c = LinearPosition::new(1150);

        let span_ab = LinearSpan::new(a, b);
        let span_ab_2 = LinearSpan::new(a, b);
        let span_ac = LinearSpan::new(a, c);
        let span_bc = LinearSpan::new(b, c);

        assert_eq!(span_ab, span_ab_2);
        assert_ne!(span_ab, span_ac);
        assert_ne!(span_ab, span_bc);
        assert_ne!(span_bc, span_ac);
    }

    /// Checks that the getters retrieve the correct value.
    #[test]
    fn span_getters() {
        let a = Position::new(10, 50);
        let b = Position::new(10, 52);

        let span = Span::new(a, b);

        assert_eq!(span.start(), a);
        assert_eq!(span.end(), b);
    }

    /// Checks that the `Span::contains()` method works properly.
    #[test]
    fn span_contains() {
        let a = Position::new(10, 50);
        let b = Position::new(10, 52);
        let c = Position::new(11, 20);
        let d = Position::new(12, 5);

        let span_ac = Span::new(a, c);
        assert!(span_ac.contains(b));

        let span_ab = Span::new(a, b);
        let span_cd = Span::new(c, d);

        assert!(!span_ab.contains(span_cd));
        assert!(span_ab.contains(b));

        let span_ad = Span::new(a, d);
        let span_bc = Span::new(b, c);

        assert!(span_ad.contains(span_bc));
        assert!(!span_bc.contains(span_ad));

        let span_ac = Span::new(a, c);
        let span_bd = Span::new(b, d);

        assert!(!span_ac.contains(span_bd));
        assert!(!span_bd.contains(span_ac));
    }

    /// Checks that the `LinearSpan::contains()` method works properly.
    #[test]
    fn linear_span_contains() {
        let a = LinearPosition::new(1050);
        let b = LinearPosition::new(1080);
        let c = LinearPosition::new(1120);
        let d = LinearPosition::new(1125);

        let span_ac = LinearSpan::new(a, c);
        assert!(span_ac.contains(b));

        let span_ab = LinearSpan::new(a, b);
        let span_cd = LinearSpan::new(c, d);

        assert!(!span_ab.contains(span_cd));
        assert!(span_ab.contains(b));

        let span_ad = LinearSpan::new(a, d);
        let span_bc = LinearSpan::new(b, c);

        assert!(span_ad.contains(span_bc));
        assert!(!span_bc.contains(span_ad));

        let span_ac = LinearSpan::new(a, c);
        let span_bd = LinearSpan::new(b, d);

        assert!(!span_ac.contains(span_bd));
        assert!(!span_bd.contains(span_ac));
    }

    /// Checks that the string representation of a span is correct.
    #[test]
    fn span_to_string() {
        let a = Position::new(10, 50);
        let b = Position::new(11, 20);
        let span = Span::new(a, b);

        assert_eq!("[10:50..11:20]", span.to_string());
        assert_eq!("[10:50..11:20]", span.to_string());
    }

    /// Checks that the ordering of spans is correct.
    #[test]
    fn span_ordering() {
        let a = Position::new(10, 50);
        let b = Position::new(10, 52);
        let c = Position::new(11, 20);
        let d = Position::new(12, 5);

        let span_ab = Span::new(a, b);
        let span_cd = Span::new(c, d);

        assert!(span_ab < span_cd);
        assert!(span_cd > span_ab);
    }

    /// Checks that the ordering of linear spans is correct.
    #[test]
    fn linear_span_ordering() {
        let a = LinearPosition::new(1050);
        let b = LinearPosition::new(1052);
        let c = LinearPosition::new(1120);
        let d = LinearPosition::new(1125);

        let span_ab = LinearSpan::new(a, b);
        let span_cd = LinearSpan::new(c, d);

        let span_ac = LinearSpan::new(a, c);
        let span_bd = LinearSpan::new(b, d);

        assert!(span_ab < span_cd);
        assert!(span_cd > span_ab);
        assert_eq!(span_bd.partial_cmp(&span_ac), None);
        assert_eq!(span_ac.partial_cmp(&span_bd), None);
    }

    /// Checks that the ordering of linear spans is correct.
    #[test]
    fn linear_union() {
        let a = LinearPosition::new(1050);
        let b = LinearPosition::new(1052);
        let c = LinearPosition::new(1120);
        let d = LinearPosition::new(1125);

        let span_ab = LinearSpan::new(a, b);
        let span_ad = LinearSpan::new(a, d);
        let span_bc = LinearSpan::new(b, c);
        let span_cd = LinearSpan::new(c, d);
        let span_ac = LinearSpan::new(a, c);
        let span_bd = LinearSpan::new(b, d);

        assert_eq!(span_bd.union(a), span_ad);
        assert_eq!(span_ab.union(a), span_ab);
        assert_eq!(span_bd.union(span_ac), span_ad);
        assert_eq!(span_ac.union(span_bd), span_ad);
        assert_eq!(span_ac.union(span_bd), span_ad);
        assert_eq!(span_ac.union(b), span_ac);
        assert_eq!(span_bc.union(span_ab), span_ac);
        assert_eq!(span_ab.union(span_bc), span_ac);
        assert_eq!(span_ac.union(span_ab), span_ac);
        assert_eq!(span_cd.union(a), span_ad);
        assert_eq!(span_cd.union(span_bc), span_bd);
    }
}

// TODO: union Span & LinearSpan into `SpanBase<T>` and then:
//       * Span = SpanBase<Position>;
//       * LinearSpan = SpanBase<LinearPosition>;
//       ?
