/// Converts a 64-bit floating point number to an `i32` according to the [`ToInt32`][ToInt32] algorithm.
///
/// [ToInt32]: https://tc39.es/ecma262/#sec-toint32
#[allow(clippy::float_cmp)]
#[cfg(not(all(target_arch = "aarch64", target_feature = "jsconv")))]
pub(crate) fn f64_to_int32(number: f64) -> i32 {
    const SIGN_MASK: u64 = 0x8000_0000_0000_0000;
    const EXPONENT_MASK: u64 = 0x7FF0_0000_0000_0000;
    const SIGNIFICAND_MASK: u64 = 0x000F_FFFF_FFFF_FFFF;
    const HIDDEN_BIT: u64 = 0x0010_0000_0000_0000;
    const PHYSICAL_SIGNIFICAND_SIZE: i32 = 52; // Excludes the hidden bit.
    const SIGNIFICAND_SIZE: i32 = 53;

    const EXPONENT_BIAS: i32 = 0x3FF + PHYSICAL_SIGNIFICAND_SIZE;
    const DENORMAL_EXPONENT: i32 = -EXPONENT_BIAS + 1;

    fn is_denormal(number: f64) -> bool {
        (number.to_bits() & EXPONENT_MASK) == 0
    }

    fn exponent(number: f64) -> i32 {
        if is_denormal(number) {
            return DENORMAL_EXPONENT;
        }

        let d64 = number.to_bits();
        let biased_e = ((d64 & EXPONENT_MASK) >> PHYSICAL_SIGNIFICAND_SIZE) as i32;

        biased_e - EXPONENT_BIAS
    }

    fn significand(number: f64) -> u64 {
        let d64 = number.to_bits();
        let significand = d64 & SIGNIFICAND_MASK;

        if is_denormal(number) {
            significand
        } else {
            significand + HIDDEN_BIT
        }
    }

    fn sign(number: f64) -> i64 {
        if (number.to_bits() & SIGN_MASK) == 0 {
            1
        } else {
            -1
        }
    }

    if number.is_finite() && number <= f64::from(i32::MAX) && number >= f64::from(i32::MIN) {
        let i = number as i32;
        if f64::from(i) == number {
            return i;
        }
    }

    let exponent = exponent(number);
    let bits = if exponent < 0 {
        if exponent <= -SIGNIFICAND_SIZE {
            return 0;
        }

        significand(number) >> -exponent
    } else {
        if exponent > 31 {
            return 0;
        }

        (significand(number) << exponent) & 0xFFFF_FFFF
    };

    (sign(number) * (bits as i64)) as i32
}

/// Converts a 64-bit floating point number to an `i32` using [`FJCVTZS`][FJCVTZS] instruction on `ARMv8.3`.
///
/// [FJCVTZS]: https://developer.arm.com/documentation/dui0801/h/A64-Floating-point-Instructions/FJCVTZS
#[cfg(all(target_arch = "aarch64", target_feature = "jsconv"))]
pub(crate) fn f64_to_int32(number: f64) -> i32 {
    if number.is_nan() {
        return 0;
    }
    let ret: i32;
    // SAFETY: Number is not nan so no floating-point exception should throw.
    unsafe {
        std::arch::asm!(
            "fjcvtzs {dst:w}, {src:d}",
            src = in(vreg) number,
            dst = out(reg) ret,
        );
    }
    ret
}

/// Converts a 64-bit floating point number to an `i32` using [`FJCVTZS`][FJCVTZS] instruction on `ARMv8.3`.
///
/// [FJCVTZS]: https://developer.arm.com/documentation/dui0801/h/A64-Floating-point-Instructions/FJCVTZS
#[cfg(all(target_arch = "aarch64", target_feature = "jsconv"))]
pub(crate) fn f64_to_uint32(number: f64) -> u32 {
    f64_to_int32(number) as u32
}

/// Converts a 64-bit floating point number to an `u32` according to the [`ToUint32`][ToUint32] algorithm.
///
/// [ToUint32]: https://tc39.es/ecma262/#sec-touint32
#[cfg(not(all(target_arch = "aarch64", target_feature = "jsconv")))]
pub(crate) fn f64_to_uint32(number: f64) -> u32 {
    f64_to_int32(number) as u32
}

#[test]
fn f64_to_int32_conversion() {
    use crate::builtins::Number;

    assert_eq!(f64_to_int32(0.0), 0);
    assert_eq!(f64_to_int32(-0.0), 0);
    assert_eq!(f64_to_int32(f64::NAN), 0);
    assert_eq!(f64_to_int32(f64::INFINITY), 0);
    assert_eq!(f64_to_int32(f64::NEG_INFINITY), 0);
    assert_eq!(f64_to_int32((i64::from(i32::MAX) + 1) as f64), i32::MIN);
    assert_eq!(f64_to_int32((i64::from(i32::MIN) - 1) as f64), i32::MAX);

    assert_eq!(f64_to_int32(Number::MAX_SAFE_INTEGER + 1.0), 0);
    assert_eq!(f64_to_int32(Number::MIN_SAFE_INTEGER - 1.0), 0);
}
