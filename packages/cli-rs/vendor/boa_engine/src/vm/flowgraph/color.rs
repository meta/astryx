use std::fmt::Display;

/// Represents the color of a node or edge.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Color {
    /// Represents the default color.
    None,
    /// Represents the color red.
    Red,
    /// Represents the color green.
    Green,
    /// Represents the color blue.
    Blue,
    /// Represents the color yellow.
    Yellow,
    /// Represents the color purple.
    Purple,
    /// Represents a RGB color.
    Rgb {
        /// Red.
        r: u8,
        /// Green.
        g: u8,
        /// Blue.
        b: u8,
    },
}

impl Color {
    /// Function for converting HSV to RGB color format.
    #[allow(clippy::many_single_char_names)]
    #[must_use]
    pub fn hsv_to_rgb(h: f64, s: f64, v: f64) -> Self {
        let h_i = (h * 6.0) as i64;
        let f = h.mul_add(6.0, -h_i as f64);
        let p = v * (1.0 - s);
        let q = v * f.mul_add(-s, 1.0);
        let t = v * (1.0 - f).mul_add(-s, 1.0);

        let (r, g, b) = match h_i {
            0 => (v, t, p),
            1 => (q, v, p),
            2 => (p, v, t),
            3 => (p, q, v),
            4 => (t, p, v),
            5 => (v, p, q),
            _ => unreachable!(),
        };

        let r = (r * 256.0) as u8;
        let g = (g * 256.0) as u8;
        let b = (b * 256.0) as u8;

        Self::Rgb { r, g, b }
    }

    /// This function takes a random value and converts it to
    /// a pleasant to look at RGB color.
    #[inline]
    #[must_use]
    pub fn from_random_number(mut random: f64) -> Self {
        const GOLDEN_RATIO_CONJUGATE: f64 = 0.618_033_988_749_895;
        random += GOLDEN_RATIO_CONJUGATE;
        random %= 1.0;

        Self::hsv_to_rgb(random, 0.7, 0.95)
    }

    /// Check if the color is [`Self::None`].
    #[inline]
    #[must_use]
    pub fn is_none(&self) -> bool {
        *self == Self::None
    }
}

impl Display for Color {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::None => f.write_str(""),
            Self::Red => f.write_str("red"),
            Self::Green => f.write_str("green"),
            Self::Blue => f.write_str("blue"),
            Self::Yellow => f.write_str("yellow"),
            Self::Purple => f.write_str("purple"),
            Self::Rgb { r, g, b } => write!(f, "#{r:02X}{b:02X}{g:02X}"),
        }
    }
}
