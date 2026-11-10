//! `Math.pow`, `Math.cbrt`, `Math.atan2`, `Math.atan`, `Math.sin`, `Math.cos`,
//! `Math.hypot`, `Math.exp`, `Math.expm1`, `Math.log`, `Math.log1p`,
//! `Math.log2` and `Math.log10` exactly as the reference Node computes them. The engine
//! installs them over Boa's `Math` functions.
//!
//! V8 implements these with its fdlibm port. The reference Node is a build
//! whose compiler contracted `a * b + c` into fused multiply-adds (the target
//! has FMA), so its results differ from libm, glibc and Rust's own functions
//! by an ulp or more for many inputs. Each function below follows V8's
//! fdlibm code and fuses exactly where that compiler fused: a product whose
//! every use, in the same basic block, is an addition or subtraction becomes
//! a fused operation at each use. `mul_add` is a true fused operation in Rust
//! whether or not the CPU has FMA.

#![allow(clippy::excessive_precision)]

#[inline]
fn hi(x: f64) -> i32 {
    (x.to_bits() >> 32) as i32
}

#[inline]
fn lo(x: f64) -> u32 {
    x.to_bits() as u32
}

#[inline]
fn from_words(h: u32, l: u32) -> f64 {
    f64::from_bits(((h as u64) << 32) | l as u64)
}

#[inline]
fn with_hi(x: f64, h: u32) -> f64 {
    from_words(h, lo(x))
}

#[inline]
fn with_lo(x: f64, l: u32) -> f64 {
    from_words(hi(x) as u32, l)
}

/// a*b + c, rounded once.
#[inline]
fn fma(a: f64, b: f64, c: f64) -> f64 {
    a.mul_add(b, c)
}

/// a*b - c, rounded once.
#[inline]
fn fms(a: f64, b: f64, c: f64) -> f64 {
    a.mul_add(b, -c)
}

/// c - a*b, rounded once.
#[inline]
fn fnma(a: f64, b: f64, c: f64) -> f64 {
    (-a).mul_add(b, c)
}

/// Reduce x to y0 + y1 in [-pi/4, pi/4]; returns the quadrant count.
fn rem_pio2(x: f64) -> (i32, f64, f64) {
    const NPIO2_HW: [i32; 32] = [
        0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB,
        0x402C463A, 0x402F6A7A, 0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB,
        0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A, 0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C,
        0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB, 0x404858EB, 0x404921FB,
    ];
    const HALF: f64 = 5.00000000000000000000e-01;
    const INVPIO2: f64 = 6.36619772367581382433e-01;
    const PIO2_1: f64 = 1.57079632673412561417e+00;
    const PIO2_1T: f64 = 6.07710050650619224932e-11;
    const PIO2_2: f64 = 6.07710050630396597660e-11;
    const PIO2_2T: f64 = 2.02226624879595063154e-21;
    const PIO2_3: f64 = 2.02226624871116645580e-21;
    const PIO2_3T: f64 = 8.47842766036889956997e-32;

    let hx = hi(x);
    let ix = hx & 0x7FFFFFFF;
    if ix <= 0x3FE921FB {
        return (0, x, 0.0);
    }
    if ix < 0x4002D97C {
        if hx > 0 {
            let mut z = x - PIO2_1;
            if ix != 0x3FF921FB {
                let y0 = z - PIO2_1T;
                return (1, y0, (z - y0) - PIO2_1T);
            }
            z -= PIO2_2;
            let y0 = z - PIO2_2T;
            return (1, y0, (z - y0) - PIO2_2T);
        } else {
            let mut z = x + PIO2_1;
            if ix != 0x3FF921FB {
                let y0 = z + PIO2_1T;
                return (-1, y0, (z - y0) + PIO2_1T);
            }
            z += PIO2_2;
            let y0 = z + PIO2_2T;
            return (-1, y0, (z - y0) + PIO2_2T);
        }
    }
    if ix <= 0x413921FB {
        let mut t = x.abs();
        let n = fma(t, INVPIO2, HALF) as i32;
        let fn_ = n as f64;
        let mut r = fnma(fn_, PIO2_1, t);
        let mut w = fn_ * PIO2_1T;
        let y0;
        if n < 32 && ix != NPIO2_HW[(n - 1) as usize] {
            y0 = r - w;
        } else {
            let j = ix >> 20;
            let mut yy = r - w;
            let mut i = j - ((hi(yy) >> 20) & 0x7FF);
            if i > 16 {
                t = r;
                // w = fn*pio2_2 is used only by two subtractions: both fuse.
                r = fnma(fn_, PIO2_2, t);
                w = fms(fn_, PIO2_2T, fnma(fn_, PIO2_2, t - r));
                yy = r - w;
                i = j - ((hi(yy) >> 20) & 0x7FF);
                if i > 49 {
                    t = r;
                    r = fnma(fn_, PIO2_3, t);
                    w = fms(fn_, PIO2_3T, fnma(fn_, PIO2_3, t - r));
                    yy = r - w;
                }
            }
            y0 = yy;
        }
        let y1 = (r - y0) - w;
        if hx < 0 {
            return (-n, -y0, -y1);
        }
        return (n, y0, y1);
    }
    if ix >= 0x7FF00000 {
        let v = x - x;
        return (0, v, v);
    }
    // Large arguments: split |x| into 24-bit pieces for the multi-word
    // reduction.
    let x1p24 = f64::from_bits(0x4170000000000000);
    let mut ui = x.to_bits();
    ui &= (!1) >> 12;
    ui |= (0x3ff + 23) << 52;
    let mut z = f64::from_bits(ui);
    let mut tx = [0.0; 3];
    for t in tx.iter_mut().take(2) {
        *t = z as i32 as f64;
        z = (z - *t) * x1p24;
    }
    tx[2] = z;
    let mut i = 2;
    while i != 0 && tx[i] == 0.0 {
        i -= 1;
    }
    let mut ty = [0.0; 3];
    let n = rem_pio2_large(&tx[..=i], &mut ty, (ix >> 20) - (0x3ff + 23), 1);
    if hx < 0 {
        return (-n, -ty[0], -ty[1]);
    }
    (n, ty[0], ty[1])
}

// Large-argument reduction (Payne-Hanek), from FreeBSD's k_rem_pio2.c by
// way of the `libm` crate (MIT), with the products fused as above.
const INIT_JK: [usize; 4] = [3, 4, 4, 6];

const IPIO2: [i32; 66] = [
    0xA2F983, 0x6E4E44, 0x1529FC, 0x2757D1, 0xF534DD, 0xC0DB62, 0x95993C, 0x439041, 0xFE5163, 0xABDEBB, 0xC561B7, 0x246E3A, 0x424DD2, 0xE00649, 0x2EEA09, 0xD1921C, 0xFE1DEB, 0x1CB129, 0xA73EE8, 0x8235F5, 0x2EBB44, 0x84E99C, 0x7026B4, 0x5F7E41, 0x3991D6, 0x398353, 0x39F49C, 0x845F8B, 0xBDF928, 0x3B1FF8, 0x97FFDE, 0x05980F, 0xEF2F11, 0x8B5A0A, 0x6D1F6D, 0x367ECF, 0x27CB09, 0xB74F46, 0x3F669E, 0x5FEA2D, 0x7527BA, 0xC7EBE5, 0xF17B3D, 0x0739F7, 0x8A5292, 0xEA6BFB, 0x5FB11F, 0x8D5D08, 0x560330, 0x46FC7B, 0x6BABF0, 0xCFBC20, 0x9AF436, 0x1DA9E3, 0x91615E, 0xE61B08, 0x659985, 0x5F14A0, 0x68408D, 0xFFD880, 0x4D7327, 0x310606, 0x1556CA, 0x73A8C9, 0x60E27B, 0xC08C6B,
];

const PIO2: [f64; 8] = [
    1.57079625129699707031e+00, /* 0x3FF921FB, 0x40000000 */
    7.54978941586159635335e-08, /* 0x3E74442D, 0x00000000 */
    5.39030252995776476554e-15, /* 0x3CF84698, 0x80000000 */
    3.28200341580791294123e-22, /* 0x3B78CC51, 0x60000000 */
    1.27065575308067607349e-29, /* 0x39F01B83, 0x80000000 */
    1.22933308981111328932e-36, /* 0x387A2520, 0x40000000 */
    2.73370053816464559624e-44, /* 0x36E38222, 0x80000000 */
    2.16741683877804819444e-51, /* 0x3569F31D, 0x00000000 */
];


fn rem_pio2_large(x: &[f64], y: &mut [f64], e0: i32, prec: usize) -> i32 {
    // FIXME(rust-lang/rust#144518): Inline assembly would cause `no_panic` to fail
    // on the callers of this function. As a workaround, avoid inlining `floor` here
    // when implemented with assembly.

    let x1p24 = f64::from_bits(0x4170000000000000); // 0x1p24 === 2 ^ 24
    let x1p_24 = f64::from_bits(0x3e70000000000000); // 0x1p_24 === 2 ^ (-24)

    let nx = x.len();

    let mut fw: f64;
    let mut n: i32;
    let mut ih: i32;
    let mut z: f64;
    let mut f: [f64; 20] = [0.; 20];
    let mut fq: [f64; 20] = [0.; 20];
    let mut q: [f64; 20] = [0.; 20];
    let mut iq: [i32; 20] = [0; 20];

    /* initialize jk*/
    let jk = INIT_JK[prec];
    let jp = jk;

    /* determine jx,jv,q0, note that 3>q0 */
    let jx = nx - 1;
    let mut jv = (e0 - 3) / 24;
    if jv < 0 {
        jv = 0;
    }
    let mut q0 = e0 - 24 * (jv + 1);
    let jv = jv as usize;

    /* set up f[0] to f[jx+jk] where f[jx+jk] = ipio2[jv+jk] */
    let mut j = (jv as i32) - (jx as i32);
    let m = jx + jk;
    for i in 0..=m {
        f[i] = if j < 0 {
            0.
        } else {
            IPIO2[j as usize] as f64
        };
        j += 1;
    }

    /* compute q[0],q[1],...q[jk] */
    for i in 0..=jk {
        fw = 0f64;
        for j in 0..=jx {
            fw = fma(x[j], f[jx + i - j], fw);
        }
        q[i] = fw;
    }

    let mut jz = jk;

    'recompute: loop {
        /* distill q[] into iq[] reversingly */
        let mut i = 0i32;
        z = q[jz];
        for j in (1..=jz).rev() {
            fw = (x1p_24 * z) as i32 as f64;
            iq[i as usize] = fnma(x1p24, fw, z) as i32;
            z = q[j - 1] + fw;
            i += 1;
        }

        /* compute n */
        z = scalbn(z, q0); /* actual value of z */
        z = fnma(8.0, (z * 0.125).floor(), z); /* trim off integer >= 8 */
        n = z as i32;
        z -= n as f64;
        ih = 0;
        if q0 > 0 {
            /* need iq[jz-1] to determine n */
            i = iq[jz - 1] >> (24 - q0);
            n += i;
            iq[jz - 1] -= i << (24 - q0);
            ih = iq[jz - 1] >> (23 - q0);
        } else if q0 == 0 {
            ih = iq[jz - 1] >> 23;
        } else if z >= 0.5 {
            ih = 2;
        }

        if ih > 0 {
            /* q > 0.5 */
            n += 1;
            let mut carry = 0i32;
            for i in 0..jz {
                /* compute 1-q */
                let j = iq[i];
                if carry == 0 {
                    if j != 0 {
                        carry = 1;
                        iq[i] = 0x1000000 - j;
                    }
                } else {
                    iq[i] = 0xffffff - j;
                }
            }
            if q0 > 0 {
                /* rare case: chance is 1 in 12 */
                match q0 {
                    1 => {
                        iq[jz - 1] &= 0x7fffff;
                    }
                    2 => {
                        iq[jz - 1] &= 0x3fffff;
                    }
                    _ => {}
                }
            }
            if ih == 2 {
                z = 1. - z;
                if carry != 0 {
                    z -= scalbn(1., q0);
                }
            }
        }

        /* check if recomputation is needed */
        if z == 0. {
            let mut j = 0;
            for i in (jk..=jz - 1).rev() {
                j |= iq[i];
            }
            if j == 0 {
                /* need recomputation */
                let mut k = 1;
                while iq[jk - k] == 0 {
                    k += 1; /* k = no. of terms needed */
                }

                for i in (jz + 1)..=(jz + k) {
                    /* add q[jz+1] to q[jz+k] */
                    f[jx + i] = IPIO2[jv + i] as f64;
                    fw = 0f64;
                    for j in 0..=jx {
                        fw = fma(x[j], f[jx + i - j], fw);
                    }
                    q[i] = fw;
                }
                jz += k;
                continue 'recompute;
            }
        }

        break;
    }

    /* chop off zero terms */
    if z == 0. {
        jz -= 1;
        q0 -= 24;
        while iq[jz] == 0 {
            jz -= 1;
            q0 -= 24;
        }
    } else {
        /* break z into 24-bit if necessary */
        z = scalbn(z, -q0);
        if z >= x1p24 {
            fw = (x1p_24 * z) as i32 as f64;
            iq[jz] = fnma(x1p24, fw, z) as i32;
            jz += 1;
            q0 += 24;
            iq[jz] = fw as i32;
        } else {
            iq[jz] = z as i32;
        }
    }

    /* convert integer "bit" chunk to floating-point value */
    fw = scalbn(1., q0);
    for i in (0..=jz).rev() {
        q[i] = fw * (iq[i] as f64);
        fw *= x1p_24;
    }

    /* compute PIo2[0,...,jp]*q[jz,...,0] */
    for i in (0..=jz).rev() {
        fw = 0f64;
        let mut k = 0;
        while (k <= jp) && (k <= jz - i) {
            fw = fma(PIO2[k], q[i + k], fw);
            k += 1;
        }
        fq[jz - i] = fw;
    }

    /* compress fq[] into y[] */
    match prec {
        0 => {
            fw = 0f64;
            for i in (0..=jz).rev() {
                fw += fq[i];
            }
            y[0] = if ih == 0 { fw } else { -fw };
        }
        1 | 2 => {
            fw = 0f64;
            for i in (0..=jz).rev() {
                fw += fq[i];
            }
            y[0] = if ih == 0 { fw } else { -fw };
            fw = fq[0] - fw;
            for i in 1..=jz {
                fw += fq[i];
            }
            y[1] = if ih == 0 { fw } else { -fw };
        }
        3 => {
            /* painful */
            for i in (1..=jz).rev() {
                fw = fq[i - 1] + fq[i];
                fq[i] += fq[i - 1] - fw;
                fq[i - 1] = fw;
            }
            for i in (2..=jz).rev() {
                fw = fq[i - 1] + fq[i];
                fq[i] += fq[i - 1] - fw;
                fq[i - 1] = fw;
            }
            fw = 0f64;
            for i in (2..=jz).rev() {
                fw += fq[i];
            }
            if ih == 0 {
                y[0] = fq[0];
                y[1] = fq[1];
                y[2] = fw;
            } else {
                y[0] = -fq[0];
                y[1] = -fq[1];
                y[2] = -fw;
            }
        }
        #[cfg(debug_assertions)]
        _ => unreachable!(),
        #[cfg(not(debug_assertions))]
        _ => {}
    }
    n & 7
}


fn kernel_cos(x: f64, y: f64) -> f64 {
    const C1: f64 = 4.16666666666666019037e-02;
    const C2: f64 = -1.38888888888741095749e-03;
    const C3: f64 = 2.48015872894767294178e-05;
    const C4: f64 = -2.75573143513906633035e-07;
    const C5: f64 = 2.08757232129817482790e-09;
    const C6: f64 = -1.13596475577881948265e-11;
    let ix = hi(x) & 0x7FFFFFFF;
    if ix < 0x3E400000 && (x as i32) == 0 {
        return 1.0;
    }
    let z = x * x;
    let r = z * fma(z, fma(z, fma(z, fma(z, fma(z, C6, C5), C4), C3), C2), C1);
    if ix < 0x3FD33333 {
        1.0 - fms(0.5, z, fms(z, r, x * y))
    } else {
        let qx = if ix > 0x3FE90000 { 0.28125 } else { from_words((ix - 0x00200000) as u32, 0) };
        let iz = fms(0.5, z, qx);
        let a = 1.0 - qx;
        a - (iz - fms(z, r, x * y))
    }
}

fn kernel_sin(x: f64, y: f64, iy: i32) -> f64 {
    const HALF: f64 = 5.00000000000000000000e-01;
    const S1: f64 = -1.66666666666666324348e-01;
    const S2: f64 = 8.33333333332248946124e-03;
    const S3: f64 = -1.98412698298579493134e-04;
    const S4: f64 = 2.75573137070700676789e-06;
    const S5: f64 = -2.50507602534068634195e-08;
    const S6: f64 = 1.58969099521155010221e-10;
    let ix = hi(x) & 0x7FFFFFFF;
    if ix < 0x3E400000 && (x as i32) == 0 {
        return x;
    }
    let z = x * x;
    let v = z * x;
    let r = fma(z, fma(z, fma(z, fma(z, S6, S5), S4), S3), S2);
    if iy == 0 {
        fma(v, fma(z, r, S1), x)
    } else {
        x - fnma(v, S1, fms(z, fms(HALF, y, v * r), y))
    }
}

pub fn sin(x: f64) -> f64 {
    let ix = hi(x) & 0x7FFFFFFF;
    if ix <= 0x3FE921FB {
        return kernel_sin(x, 0.0, 0);
    }
    if ix >= 0x7FF00000 {
        return x - x;
    }
    let (n, y0, y1) = rem_pio2(x);
    match n & 3 {
        0 => kernel_sin(y0, y1, 1),
        1 => kernel_cos(y0, y1),
        2 => -kernel_sin(y0, y1, 1),
        _ => -kernel_cos(y0, y1),
    }
}

pub fn cos(x: f64) -> f64 {
    let ix = hi(x) & 0x7FFFFFFF;
    if ix <= 0x3FE921FB {
        return kernel_cos(x, 0.0);
    }
    if ix >= 0x7FF00000 {
        return x - x;
    }
    let (n, y0, y1) = rem_pio2(x);
    match n & 3 {
        0 => kernel_cos(y0, y1),
        1 => -kernel_sin(y0, y1, 1),
        2 => -kernel_cos(y0, y1),
        _ => kernel_sin(y0, y1, 1),
    }
}

pub fn atan(x_in: f64) -> f64 {
    const ATANHI: [f64; 4] = [
        4.63647609000806093515e-01,
        7.85398163397448278999e-01,
        9.82793723247329054082e-01,
        1.57079632679489655800e+00,
    ];
    const ATANLO: [f64; 4] = [
        2.26987774529616870924e-17,
        3.06161699786838301793e-17,
        1.39033110312309984516e-17,
        6.12323399573676603587e-17,
    ];
    const AT: [f64; 11] = [
        3.33333333333329318027e-01,
        -1.99999999998764832476e-01,
        1.42857142725034663711e-01,
        -1.11111104054623557880e-01,
        9.09088713343650656196e-02,
        -7.69187620504482999495e-02,
        6.66107313738753120669e-02,
        -5.83357013379057348645e-02,
        4.97687799461593236017e-02,
        -3.65315727442169155270e-02,
        1.62858201153657823623e-02,
    ];
    let mut x = x_in;
    let hx = hi(x);
    let ix = hx & 0x7FFFFFFF;
    if ix >= 0x44100000 {
        if ix > 0x7FF00000 || (ix == 0x7FF00000 && lo(x) != 0) {
            return x + x;
        }
        return if hx > 0 { ATANHI[3] + ATANLO[3] } else { -ATANHI[3] - ATANLO[3] };
    }
    let id: i32;
    if ix < 0x3FDC0000 {
        if ix < 0x3E400000 {
            return x;
        }
        id = -1;
    } else {
        x = x.abs();
        if ix < 0x3FF30000 {
            if ix < 0x3FE60000 {
                id = 0;
                x = fms(2.0, x, 1.0) / (2.0 + x);
            } else {
                id = 1;
                x = (x - 1.0) / (x + 1.0);
            }
        } else if ix < 0x40038000 {
            id = 2;
            x = (x - 1.5) / fma(1.5, x, 1.0);
        } else {
            id = 3;
            x = -1.0 / x;
        }
    }
    let z = x * x;
    let w = z * z;
    let p1 = fma(w, fma(w, fma(w, fma(w, fma(w, AT[10], AT[8]), AT[6]), AT[4]), AT[2]), AT[0]);
    let s2 = w * fma(w, fma(w, fma(w, fma(w, AT[9], AT[7]), AT[5]), AT[3]), AT[1]);
    // s1 + s2 is hoisted above the branch, so s1 = z*p1 fuses into it.
    let sum = fma(z, p1, s2);
    let xs = x * sum;
    if id < 0 {
        x - xs
    } else {
        let id = id as usize;
        let z = ATANHI[id] - ((xs - ATANLO[id]) - x);
        if hx < 0 {
            -z
        } else {
            z
        }
    }
}

pub fn atan2(y: f64, x: f64) -> f64 {
    const PI_O_4: f64 = 7.8539816339744827900E-01;
    const PI_O_2: f64 = 1.5707963267948965580E+00;
    const PI: f64 = 3.1415926535897931160E+00;
    const PI_LO: f64 = 1.2246467991473531772E-16;
    const TINY: f64 = 1.0e-300;
    let hx = hi(x);
    let lx = lo(x);
    let ix = hx & 0x7FFFFFFF;
    let hy = hi(y);
    let ly = lo(y);
    let iy = hy & 0x7FFFFFFF;
    let nan_x = (ix as u32 | ((lx | lx.wrapping_neg()) >> 31)) > 0x7FF00000;
    let nan_y = (iy as u32 | ((ly | ly.wrapping_neg()) >> 31)) > 0x7FF00000;
    if nan_x || nan_y {
        return x + y;
    }
    if (hx.wrapping_sub(0x3FF00000) as u32 | lx) == 0 {
        return atan(y);
    }
    let mut m = ((hy >> 31) & 1) | ((hx >> 30) & 2);
    if (iy as u32 | ly) == 0 {
        return match m {
            0 | 1 => y,
            2 => PI + TINY,
            _ => -PI - TINY,
        };
    }
    if (ix as u32 | lx) == 0 {
        return if hy < 0 { -PI_O_2 - TINY } else { PI_O_2 + TINY };
    }
    if ix == 0x7FF00000 {
        if iy == 0x7FF00000 {
            return match m {
                0 => PI_O_4 + TINY,
                1 => -PI_O_4 - TINY,
                2 => 3.0 * PI_O_4 + TINY,
                _ => -3.0 * PI_O_4 - TINY,
            };
        }
        return match m {
            0 => 0.0,
            1 => -0.0,
            2 => PI + TINY,
            _ => -PI - TINY,
        };
    }
    if iy == 0x7FF00000 {
        return if hy < 0 { -PI_O_2 - TINY } else { PI_O_2 + TINY };
    }
    let k = (iy - ix) >> 20;
    let z;
    if k > 60 {
        z = fma(0.5, PI_LO, PI_O_2);
        m &= 1;
    } else if hx < 0 && k < -60 {
        z = 0.0;
    } else {
        z = atan((y / x).abs());
    }
    match m {
        0 => z,
        1 => -z,
        2 => PI - (z - PI_LO),
        _ => (z - PI_LO) - PI,
    }
}

pub fn cbrt(x: f64) -> f64 {
    const B1: u32 = 715094163;
    const B2: u32 = 696219795;
    const P0: f64 = 1.87595182427177009643;
    const P1: f64 = -1.88497979543377169875;
    const P2: f64 = 1.621429720105354466140;
    const P3: f64 = -0.758397934778766047437;
    const P4: f64 = 0.145996192886612446982;
    let mut hx = hi(x) as u32;
    let low = lo(x);
    let sign = hx & 0x80000000;
    hx ^= sign;
    if hx >= 0x7FF00000 {
        return x + x;
    }
    let mut t;
    if hx < 0x00100000 {
        if (hx | low) == 0 {
            return x;
        }
        t = from_words(0x43500000, 0);
        t *= x;
        let high = hi(t) as u32;
        t = from_words(sign | ((high & 0x7FFFFFFF) / 3 + B2), 0);
    } else {
        t = from_words(sign | (hx / 3 + B1), 0);
    }
    let mut r = (t * t) * (t / x);
    t = t * fma((r * r) * r, fma(r, P4, P3), fma(r, fma(r, P2, P1), P0));
    let bits = (t.to_bits().wrapping_add(0x80000000)) & 0xFFFFFFFFC0000000;
    t = f64::from_bits(bits);
    let s = t * t;
    r = x / s;
    r = (r - t) / fma(2.0, t, r);
    fma(t, r, t)
}

fn scalbn(x: f64, n: i32) -> f64 {
    let mut y = x;
    let mut n = n;
    let p1023 = f64::from_bits(0x7FE0000000000000);
    let pm1022 = f64::from_bits(0x0010000000000000);
    let p53 = f64::from_bits(0x4340000000000000);
    if n > 1023 {
        y *= p1023;
        n -= 1023;
        if n > 1023 {
            y *= p1023;
            n -= 1023;
            if n > 1023 {
                n = 1023;
            }
        }
    } else if n < -1022 {
        y *= pm1022 * p53;
        n += 1022 - 53;
        if n < -1022 {
            y *= pm1022 * p53;
            n += 1022 - 53;
            if n < -1022 {
                n = -1022;
            }
        }
    }
    y * f64::from_bits(((0x3ff + n) as u64) << 52)
}

/// `Math.pow(x, y)` and `x ** y`.
pub fn pow(x: f64, y: f64) -> f64 {
    const BP: [f64; 2] = [1.0, 1.5];
    const DP_H: [f64; 2] = [0.0, 5.84962487220764160156e-01];
    const DP_L: [f64; 2] = [0.0, 1.35003920212974897128e-08];
    const TWO53: f64 = 9007199254740992.0;
    const HUGE: f64 = 1.0e300;
    const TINY: f64 = 1.0e-300;
    const L1: f64 = 5.99999999999994648725e-01;
    const L2: f64 = 4.28571428578550184252e-01;
    const L3: f64 = 3.33333329818377432918e-01;
    const L4: f64 = 2.72728123808534006489e-01;
    const L5: f64 = 2.30660745775561754067e-01;
    const L6: f64 = 2.06975017800338417784e-01;
    const P1: f64 = 1.66666666666666019037e-01;
    const P2: f64 = -2.77777777770155933842e-03;
    const P3: f64 = 6.61375632143793436117e-05;
    const P4: f64 = -1.65339022054652515390e-06;
    const P5: f64 = 4.13813679705723846039e-08;
    const LG2: f64 = 6.93147180559945286227e-01;
    const LG2_H: f64 = 6.93147182464599609375e-01;
    const LG2_L: f64 = -1.90465429995776804525e-09;
    const OVT: f64 = 8.0085662595372944372e-0017;
    const CP: f64 = 9.61796693925975554329e-01;
    const CP_H: f64 = 9.61796700954437255859e-01;
    const CP_L: f64 = -7.02846165095275826516e-09;
    const IVLN2: f64 = 1.44269504088896338700e+00;
    const IVLN2_H: f64 = 1.44269502162933349609e+00;
    const IVLN2_L: f64 = 1.92596299112661746887e-08;

    let hx = hi(x);
    let lx = lo(x);
    let hy = hi(y);
    let ly = lo(y);
    let mut ix = hx & 0x7fffffff;
    let iy = hy & 0x7fffffff;

    if (iy as u32 | ly) == 0 {
        return 1.0;
    }
    if ix > 0x7ff00000 || (ix == 0x7ff00000 && lx != 0) || iy > 0x7ff00000 || (iy == 0x7ff00000 && ly != 0) {
        return x + y;
    }
    let mut yisint = 0;
    if hx < 0 {
        if iy >= 0x43400000 {
            yisint = 2;
        } else if iy >= 0x3ff00000 {
            let k = (iy >> 20) - 0x3ff;
            if k > 20 {
                let j = ly >> (52 - k);
                if (j << (52 - k)) == ly {
                    yisint = 2 - (j & 1) as i32;
                }
            } else if ly == 0 {
                let j = iy >> (20 - k);
                if (j << (20 - k)) == iy {
                    yisint = 2 - (j & 1);
                }
            }
        }
    }
    if ly == 0 {
        if iy == 0x7ff00000 {
            if ((ix - 0x3ff00000) as u32 | lx) == 0 {
                return y - y;
            } else if ix >= 0x3ff00000 {
                return if hy >= 0 { y } else { 0.0 };
            } else {
                return if hy < 0 { -y } else { 0.0 };
            }
        }
        if iy == 0x3ff00000 {
            return if hy < 0 { 1.0 / x } else { x };
        }
        if hy == 0x40000000 {
            return x * x;
        }
        if hy == 0x3fe00000 && hx >= 0 {
            return x.sqrt();
        }
    }
    let mut ax = x.abs();
    if lx == 0 && (ix == 0x7ff00000 || ix == 0 || ix == 0x3ff00000) {
        let mut z = ax;
        if hy < 0 {
            z = 1.0 / z;
        }
        if hx < 0 {
            if ((ix - 0x3ff00000) | yisint) == 0 {
                z = f64::NAN;
            } else if yisint == 1 {
                z = -z;
            }
        }
        return z;
    }
    let mut n = (hx >> 31) + 1;
    if (n | yisint) == 0 {
        return f64::NAN;
    }
    let mut s = 1.0;
    if (n | (yisint - 1)) == 0 {
        s = -1.0;
    }
    let t1;
    let t2;
    if iy > 0x41e00000 {
        if iy > 0x43f00000 {
            if ix <= 0x3fefffff {
                return if hy < 0 { HUGE * HUGE } else { TINY * TINY };
            }
            if ix >= 0x3ff00000 {
                return if hy > 0 { HUGE * HUGE } else { TINY * TINY };
            }
        }
        if ix < 0x3fefffff {
            return if hy < 0 { s * HUGE * HUGE } else { s * TINY * TINY };
        }
        if ix > 0x3ff00000 {
            return if hy > 0 { s * HUGE * HUGE } else { s * TINY * TINY };
        }
        let t = ax - 1.0;
        let w = (t * t) * fnma(t, fnma(t, 0.25, 0.3333333333333333333333), 0.5);
        // u = ivln2_h*t is used only by `u + v` and `t1 - u`: both fuse.
        let v = fms(t, IVLN2_L, w * IVLN2);
        let mut tt = fma(IVLN2_H, t, v);
        tt = with_lo(tt, 0);
        t1 = tt;
        t2 = v - fnma(IVLN2_H, t, t1);
    } else {
        n = 0;
        if ix < 0x00100000 {
            ax *= TWO53;
            n -= 53;
            ix = hi(ax);
        }
        n += (ix >> 20) - 0x3ff;
        let j = ix & 0x000fffff;
        ix = j | 0x3ff00000;
        let k: usize;
        if j <= 0x3988E {
            k = 0;
        } else if j < 0xBB67A {
            k = 1;
        } else {
            k = 0;
            n += 1;
            ix -= 0x00100000;
        }
        ax = with_hi(ax, ix as u32);
        let u = ax - BP[k];
        let v = 1.0 / (ax + BP[k]);
        let ss = u * v;
        let s_h = with_lo(ss, 0);
        let t_h = from_words((((ix >> 1) | 0x20000000) + 0x00080000 + ((k as i32) << 18)) as u32, 0);
        let t_l = ax - (t_h - BP[k]);
        let s_l = v * fnma(s_h, t_l, fnma(s_h, t_h, u));
        let s2 = ss * ss;
        let poly = fma(s2, fma(s2, fma(s2, fma(s2, fma(s2, L6, L5), L4), L3), L2), L1);
        // r = (s2*s2)*poly is used only by `r += ...`, so it fuses there.
        let r = fma(s2 * s2, poly, s_l * (s_h + ss));
        // s2 = s_h*s_h is used only by additions and subtractions.
        let mut t_h = fma(s_h, s_h, 3.0) + r;
        t_h = with_lo(t_h, 0);
        let t_l = r - fnma(s_h, s_h, t_h - 3.0);
        // u = s_h*t_h is used only by `u + v` and `p_h - u`.
        let v = fma(s_l, t_h, t_l * ss);
        let mut p_h = fma(s_h, t_h, v);
        p_h = with_lo(p_h, 0);
        let p_l = v - fnma(s_h, t_h, p_h);
        // z_h = cp_h*p_h is used only by `z_h + z_l` and `... - z_h`.
        let z_l = fma(CP_L, p_h, p_l * CP) + DP_L[k];
        let t = n as f64;
        let mut tt = ((fma(CP_H, p_h, z_l)) + DP_H[k]) + t;
        tt = with_lo(tt, 0);
        t1 = tt;
        t2 = z_l - fnma(CP_H, p_h, (t1 - t) - DP_H[k]);
    }
    let y1 = with_lo(y, 0);
    let p_l = fma(y - y1, t1, y * t2);
    let mut p_h = y1 * t1;
    let z = p_l + p_h;
    let j = hi(z);
    let i = lo(z);
    if j >= 0x40900000 {
        if ((j - 0x40900000) as u32 | i) != 0 {
            return s * HUGE * HUGE;
        } else if p_l + OVT > z - p_h {
            return s * HUGE * HUGE;
        }
    } else if (j & 0x7fffffff) >= 0x4090cc00 {
        if ((j as u32).wrapping_sub(0xc090cc00) | i) != 0 {
            return s * TINY * TINY;
        } else if p_l <= z - p_h {
            return s * TINY * TINY;
        }
    }
    let i = j & 0x7fffffff;
    let mut k = (i >> 20) - 0x3ff;
    let mut n = 0i32;
    if i > 0x3fe00000 {
        n = j.wrapping_add(0x00100000 >> (k + 1));
        k = ((n & 0x7fffffff) >> 20) - 0x3ff;
        let t = from_words((n & !(0x000fffff >> k)) as u32, 0);
        n = ((n & 0x000fffff) | 0x00100000) >> (20 - k);
        if j < 0 {
            n = -n;
        }
        p_h -= t;
    }
    let mut t = p_l + p_h;
    t = with_lo(t, 0);
    // u = t*lg2_h is used only by `u + v` and `z - u`.
    let v = fma(p_l - (t - p_h), LG2, t * LG2_L);
    let z = fma(t, LG2_H, v);
    let w = v - fnma(t, LG2_H, z);
    let tz = z * z;
    let t1 = fnma(tz, fma(tz, fma(tz, fma(tz, fma(tz, P5, P4), P3), P2), P1), z);
    let r = (z * t1) / ((t1 - 2.0) - fma(z, w, w));
    let mut z = 1.0 - (r - z);
    let mut j = hi(z);
    j = j.wrapping_add(((n as u32) << 20) as i32);
    if (j >> 20) <= 0 {
        z = scalbn(z, n);
    } else {
        let tmp = hi(z);
        z = with_hi(z, tmp.wrapping_add(((n as u32) << 20) as i32) as u32);
    }
    s * z
}

/// `Math.hypot(...values)` as V8's builtin computes it (no fused operations).
pub fn hypot(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mut abs = vec![0.0; values.len()];
    let mut nan = false;
    let mut max = 0.0f64;
    for (i, v) in values.iter().enumerate() {
        if v.is_nan() {
            nan = true;
        } else {
            abs[i] = v.abs();
            if abs[i] > max {
                max = abs[i];
            }
        }
    }
    if max == f64::INFINITY {
        return f64::INFINITY;
    }
    if nan {
        return f64::NAN;
    }
    if max == 0.0 {
        return 0.0;
    }
    let mut sum = 0.0;
    let mut compensation = 0.0;
    for a in abs {
        let n = a / max;
        let summand = n * n - compensation;
        let preliminary = sum + summand;
        compensation = (preliminary - sum) - summand;
        sum = preliminary;
    }
    sum.sqrt() * max
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_reference_node() {
        assert_eq!(pow(1.9629632234573364, 2.4), 5.0464873782607498);
        assert_eq!(atan2(0.12046241760253906, 0.59736281633377075), 0.19898835904063031);
        assert_eq!(atan2(-0.18121719360351562, 0.4810638427734375), -0.36026105591200319);
        assert_eq!(cbrt(0.3), 0.66943295008216952002);
        assert_eq!(sin(5.1), -0.92581468232773245219);
    }
}

const TWO54: f64 = 1.80143985094819840000e+16;
const LN2_HI: f64 = 6.93147180369123816490e-01;
const LN2_LO: f64 = 1.90821492927058770002e-10;

pub fn exp(x_in: f64) -> f64 {
    const HALF: [f64; 2] = [0.5, -0.5];
    const O_THRESHOLD: f64 = 7.09782712893383973096e+02;
    const U_THRESHOLD: f64 = -7.45133219101941108420e+02;
    const LN2HI: [f64; 2] = [6.93147180369123816490e-01, -6.93147180369123816490e-01];
    const LN2LO: [f64; 2] = [1.90821492927058770002e-10, -1.90821492927058770002e-10];
    const INVLN2: f64 = 1.44269504088896338700e+00;
    const P1: f64 = 1.66666666666666019037e-01;
    const P2: f64 = -2.77777777770155933842e-03;
    const P3: f64 = 6.61375632143793436117e-05;
    const P4: f64 = -1.65339022054652515390e-06;
    const P5: f64 = 4.13813679705723846039e-08;
    const E: f64 = 2.718281828459045;
    const HUGE: f64 = 1.0e+300;
    const TWOM1000: f64 = 9.33263618503218878990e-302;
    const TWO1023: f64 = 8.988465674311579539e307;

    let mut x = x_in;
    let mut hx = hi(x) as u32;
    let xsb = ((hx >> 31) & 1) as usize;
    hx &= 0x7FFFFFFF;
    let (mut hi_part, mut lo_part, mut k) = (0.0, 0.0, 0i32);
    if hx >= 0x40862E42 {
        if hx >= 0x7FF00000 {
            if ((hx & 0xFFFFF) | lo(x)) != 0 {
                return x + x;
            }
            return if xsb == 0 { x } else { 0.0 };
        }
        if x > O_THRESHOLD {
            return f64::INFINITY;
        }
        if x < U_THRESHOLD {
            return 0.0;
        }
    }
    if hx > 0x3FD62E42 {
        if hx < 0x3FF0A2B2 {
            if x == 1.0 {
                return E;
            }
            hi_part = x - LN2HI[xsb];
            lo_part = LN2LO[xsb];
            k = 1 - xsb as i32 - xsb as i32;
        } else {
            k = fma(INVLN2, x, HALF[xsb]) as i32;
            let t = k as f64;
            hi_part = fnma(t, LN2HI[0], x);
            lo_part = t * LN2LO[0];
        }
        x = hi_part - lo_part;
    } else if hx < 0x3E300000 {
        if HUGE + x > 1.0 {
            return 1.0 + x;
        }
    } else {
        k = 0;
    }
    let t = x * x;
    let twopk = if k >= -1021 {
        from_words((0x3FF00000 + (k << 20)) as u32, 0)
    } else {
        from_words((0x3FF00000 + ((k + 1000) << 20)) as u32, 0)
    };
    let c = fnma(t, fma(t, fma(t, fma(t, fma(t, P5, P4), P3), P2), P1), x);
    if k == 0 {
        return 1.0 - ((x * c) / (c - 2.0) - x);
    }
    let y = 1.0 - ((lo_part - (x * c) / (2.0 - c)) - hi_part);
    if k >= -1021 {
        if k == 1024 {
            return y * 2.0 * TWO1023;
        }
        y * twopk
    } else {
        y * twopk * TWOM1000
    }
}

const LG1: f64 = 6.666666666666735130e-01;
const LG2: f64 = 3.999999999940941908e-01;
const LG3: f64 = 2.857142874366239149e-01;
const LG4: f64 = 2.222219843214978396e-01;
const LG5: f64 = 1.818357216161805012e-01;
const LG6: f64 = 1.531383769920937332e-01;
const LG7: f64 = 1.479819860511658591e-01;

pub fn log(x_in: f64) -> f64 {
    let mut x = x_in;
    let mut hx = hi(x);
    let lx = lo(x);
    let mut k = 0i32;
    if hx < 0x00100000 {
        if ((hx & 0x7FFFFFFF) as u32 | lx) == 0 {
            return f64::NEG_INFINITY;
        }
        if hx < 0 {
            return f64::NAN;
        }
        k -= 54;
        x *= TWO54;
        hx = hi(x);
    }
    if hx >= 0x7FF00000 {
        return x + x;
    }
    k += (hx >> 20) - 1023;
    hx &= 0x000FFFFF;
    let i = (hx + 0x95F64) & 0x100000;
    x = with_hi(x, (hx | (i ^ 0x3FF00000)) as u32);
    k += i >> 20;
    let f = x - 1.0;
    let dk = k as f64;
    if (0x000FFFFF & (2 + hx)) < 3 {
        if f == 0.0 {
            if k == 0 {
                return 0.0;
            }
            return fma(dk, LN2_HI, dk * LN2_LO);
        }
        let r = f * f * fnma(0.33333333333333333, f, 0.5);
        if k == 0 {
            return f - r;
        }
        return fms(dk, LN2_HI, fnma(dk, LN2_LO, r) - f);
    }
    let s = f / (2.0 + f);
    let z = s * s;
    let mut i = hx - 0x6147A;
    let w = z * z;
    let j = 0x6B851 - hx;
    let p1 = fma(w, fma(w, LG6, LG4), LG2);
    let p2 = fma(w, fma(w, fma(w, LG7, LG5), LG3), LG1);
    let r = fma(w, p1, z * p2);
    i |= j;
    let hf = 0.5 * f;
    let hfsq = hf * f;
    if i > 0 {
        if k == 0 {
            return f - fms(hf, f, s * fma(hf, f, r));
        }
        return fms(dk, LN2_HI, (hfsq - fma(dk, LN2_LO, s * fma(hf, f, r))) - f);
    }
    if k == 0 {
        return f - s * (f - r);
    }
    fms(dk, LN2_HI, fnma(dk, LN2_LO, s * (f - r)) - f)
}

#[cfg(test)]
pub fn log_variant(x_in: f64, v: &[usize]) -> f64 {
    let mut x = x_in;
    let mut hx = hi(x);
    let lx = lo(x);
    let mut k = 0i32;
    if hx < 0x00100000 {
        if ((hx & 0x7FFFFFFF) as u32 | lx) == 0 {
            return f64::NEG_INFINITY;
        }
        if hx < 0 {
            return f64::NAN;
        }
        k -= 54;
        x *= TWO54;
        hx = hi(x);
    }
    if hx >= 0x7FF00000 {
        return x + x;
    }
    k += (hx >> 20) - 1023;
    hx &= 0x000FFFFF;
    let i = (hx + 0x95F64) & 0x100000;
    x = with_hi(x, (hx | (i ^ 0x3FF00000)) as u32);
    k += i >> 20;
    let f = x - 1.0;
    let dk = k as f64;
    if (0x000FFFFF & (2 + hx)) < 3 {
        if f == 0.0 {
            if k == 0 {
                return 0.0;
            }
            return fma(dk, LN2_HI, dk * LN2_LO);
        }
        let r = f * f * fnma(0.33333333333333333, f, 0.5);
        if k == 0 {
            return f - r;
        }
        return fms(dk, LN2_HI, fnma(dk, LN2_LO, r) - f);
    }
    let s = f / (2.0 + f);
    let z = s * s;
    let mut i = hx - 0x6147A;
    let w = z * z;
    let j = 0x6B851 - hx;
    let p1 = fma(w, fma(w, LG6, LG4), LG2);
    let p2 = fma(w, fma(w, fma(w, LG7, LG5), LG3), LG1);
    let r = match v[0] {
        0 => fma(w, p1, z * p2),
        1 => fma(z, p2, w * p1),
        _ => z * p2 + w * p1,
    };
    i |= j;
    let hf = 0.5 * f;
    let hfsq = hf * f;
    if i > 0 {
        let q = if v[1] == 0 { fma(hf, f, r) } else { hfsq + r };
        if k == 0 {
            let inner = match v[2] {
                0 => fms(hf, f, s * q),
                1 => fnma(s, q, hfsq),
                _ => hfsq - s * q,
            };
            return f - inner;
        }
        let m = match v[3] {
            0 => fma(s, q, dk * LN2_LO),
            1 => fma(dk, LN2_LO, s * q),
            _ => s * q + dk * LN2_LO,
        };
        let a = if v[4] == 0 { fms(hf, f, m) } else { hfsq - m };
        return if v[5] == 0 { fms(dk, LN2_HI, a - f) } else { dk * LN2_HI - (a - f) };
    }
    if k == 0 {
        return if v[6] == 0 { fnma(s, f - r, f) } else { f - s * (f - r) };
    }
    let b = match v[7] {
        0 => fms(s, f - r, dk * LN2_LO),
        1 => fnma(dk, LN2_LO, s * (f - r)),
        _ => s * (f - r) - dk * LN2_LO,
    };
    if v[5] == 0 { fms(dk, LN2_HI, b - f) } else { dk * LN2_HI - (b - f) }
}

pub fn log1p(x_in: f64) -> f64 {
    let x = x_in;
    let hx = hi(x);
    let ax = hx & 0x7FFFFFFF;
    let mut k = 1i32;
    let mut f = 0.0;
    let mut hu = 0i32;
    let mut c = 0.0;
    if hx < 0x3FDA827A {
        if ax >= 0x3FF00000 {
            return if x == -1.0 { f64::NEG_INFINITY } else { f64::NAN };
        }
        if ax < 0x3E200000 {
            if TWO54 + x > 0.0 && ax < 0x3C900000 {
                return x;
            }
            return fnma(x * x, 0.5, x);
        }
        if hx > 0 || hx <= 0xBFD2BEC4_u32 as i32 {
            k = 0;
            f = x;
            hu = 1;
        }
    }
    if hx >= 0x7FF00000 {
        return x + x;
    }
    if k != 0 {
        let mut u;
        if hx < 0x43400000 {
            u = 1.0 + x;
            hu = hi(u);
            k = (hu >> 20) - 1023;
            c = if k > 0 { 1.0 - (u - x) } else { x - (u - 1.0) };
            c /= u;
        } else {
            u = x;
            hu = hi(u);
            k = (hu >> 20) - 1023;
            c = 0.0;
        }
        hu &= 0x000FFFFF;
        if hu < 0x6A09E {
            u = with_hi(u, (hu | 0x3FF00000) as u32);
        } else {
            k += 1;
            u = with_hi(u, (hu | 0x3FE00000) as u32);
            hu = (0x00100000 - hu) >> 2;
        }
        f = u - 1.0;
    }
    let hf = 0.5 * f;
    let hfsq = hf * f;
    let dk = k as f64;
    if hu == 0 {
        if f == 0.0 {
            if k == 0 {
                return 0.0;
            }
            c = fma(dk, LN2_LO, c);
            return fma(dk, LN2_HI, c);
        }
        let r = hfsq * fnma(0.66666666666666666, f, 1.0);
        if k == 0 {
            return f - r;
        }
        return fms(dk, LN2_HI, (r - fma(dk, LN2_LO, c)) - f);
    }
    let s = f / (2.0 + f);
    let z = s * s;
    // `hfsq` is computed before the branch, so it stays a rounded product;
    // `R` fuses into its one addition.
    let p = fma(z, fma(z, fma(z, fma(z, fma(z, fma(z, LG7, LG6), LG5), LG4), LG3), LG2), LG1);
    let q = fma(z, p, hfsq);
    // `s * q` is computed once for both branches, so it stays rounded.
    let sq = s * q;
    if k == 0 {
        return f - (hfsq - sq);
    }
    fms(dk, LN2_HI, (hfsq - (sq + fma(dk, LN2_LO, c))) - f)
}

#[cfg(test)]
pub fn log1p_variant(x_in: f64, v: &[usize]) -> f64 {
    let x = x_in;
    let hx = hi(x);
    let ax = hx & 0x7FFFFFFF;
    let mut k = 1i32;
    let mut f = 0.0;
    let mut hu = 0i32;
    let mut c = 0.0;
    if hx < 0x3FDA827A {
        if ax >= 0x3FF00000 {
            return if x == -1.0 { f64::NEG_INFINITY } else { f64::NAN };
        }
        if ax < 0x3E200000 {
            if TWO54 + x > 0.0 && ax < 0x3C900000 {
                return x;
            }
            return fnma(x * x, 0.5, x);
        }
        if hx > 0 || hx <= 0xBFD2BEC4_u32 as i32 {
            k = 0;
            f = x;
            hu = 1;
        }
    }
    if hx >= 0x7FF00000 {
        return x + x;
    }
    if k != 0 {
        let mut u;
        if hx < 0x43400000 {
            u = 1.0 + x;
            hu = hi(u);
            k = (hu >> 20) - 1023;
            c = if k > 0 { 1.0 - (u - x) } else { x - (u - 1.0) };
            c /= u;
        } else {
            u = x;
            hu = hi(u);
            k = (hu >> 20) - 1023;
            c = 0.0;
        }
        hu &= 0x000FFFFF;
        if hu < 0x6A09E {
            u = with_hi(u, (hu | 0x3FF00000) as u32);
        } else {
            k += 1;
            u = with_hi(u, (hu | 0x3FE00000) as u32);
            hu = (0x00100000 - hu) >> 2;
        }
        f = u - 1.0;
    }
    let hf = 0.5 * f;
    let hfsq = hf * f;
    let dk = k as f64;
    if hu == 0 {
        if f == 0.0 {
            if k == 0 {
                return 0.0;
            }
            c = fma(dk, LN2_LO, c);
            return fma(dk, LN2_HI, c);
        }
        let r = hfsq * fnma(0.66666666666666666, f, 1.0);
        if k == 0 {
            return f - r;
        }
        return fms(dk, LN2_HI, (r - fma(dk, LN2_LO, c)) - f);
    }
    let s = f / (2.0 + f);
    let z = s * s;
    // `hfsq` is computed before the branch, so it stays a rounded product;
    // `R` fuses into its one addition.
    let p = fma(z, fma(z, fma(z, fma(z, fma(z, fma(z, LG7, LG6), LG5), LG4), LG3), LG2), LG1);
    let q = match v[0] { 0 => fma(z, p, hfsq), 1 => hfsq + z * p, _ => fma(hf, f, z * p) };
    if k == 0 {
        let inner = match v[1] { 0 => fnma(s, q, hfsq), 1 => hfsq - s * q, _ => fms(hf, f, s * q) };
        return f - inner;
    }
    let cc = if v[2] == 0 { fma(dk, LN2_LO, c) } else { dk * LN2_LO + c };
    let m = match v[3] { 0 => fma(s, q, cc), _ => s * q + cc };
    let a = match v[4] { 0 => hfsq - m, _ => fms(hf, f, m) };
    if v[5] == 0 { fms(dk, LN2_HI, a - f) } else { dk * LN2_HI - (a - f) }
}

pub fn expm1(x_in: f64) -> f64 {
    const O_THRESHOLD: f64 = 7.09782712893383973096e+02;
    const INVLN2: f64 = 1.44269504088896338700e+00;
    const Q1: f64 = -3.33333333333331316428e-02;
    const Q2: f64 = 1.58730158725481460165e-03;
    const Q3: f64 = -7.93650757867487942473e-05;
    const Q4: f64 = 4.00821782732936239552e-06;
    const Q5: f64 = -2.01099218183624371326e-07;
    const HUGE: f64 = 1.0e+300;
    const TINY: f64 = 1.0e-300;
    const TWO1023: f64 = 8.988465674311579539e307;

    let mut x = x_in;
    let mut hx = hi(x) as u32;
    let xsb = hx & 0x80000000;
    hx &= 0x7FFFFFFF;
    let k: i32;
    let mut c = 0.0;
    if hx >= 0x4043687A {
        if hx >= 0x40862E42 {
            if hx >= 0x7FF00000 {
                if ((hx & 0xFFFFF) | lo(x)) != 0 {
                    return x + x;
                }
                return if xsb == 0 { x } else { -1.0 };
            }
            if x > O_THRESHOLD {
                return f64::INFINITY;
            }
        }
        if xsb != 0 && x + TINY < 0.0 {
            return TINY - 1.0;
        }
    }
    if hx > 0x3FD62E42 {
        let (hi_part, lo_part);
        if hx < 0x3FF0A2B2 {
            if xsb == 0 {
                hi_part = x - LN2_HI;
                lo_part = LN2_LO;
                k = 1;
            } else {
                hi_part = x + LN2_HI;
                lo_part = -LN2_LO;
                k = -1;
            }
        } else {
            k = fma(INVLN2, x, if xsb == 0 { 0.5 } else { -0.5 }) as i32;
            let t = k as f64;
            hi_part = fnma(t, LN2_HI, x);
            lo_part = t * LN2_LO;
        }
        x = hi_part - lo_part;
        c = (hi_part - x) - lo_part;
    } else if hx < 0x3C900000 {
        let t = HUGE + x;
        return x - (t - (HUGE + x));
    } else {
        k = 0;
    }
    let hfx = 0.5 * x;
    let hxs = x * hfx;
    let r1 = fma(hxs, fma(hxs, fma(hxs, fma(hxs, fma(hxs, Q5, Q4), Q3), Q2), Q1), 1.0);
    let t = fnma(r1, hfx, 3.0);
    let mut e = hxs * ((r1 - t) / fnma(x, t, 6.0));
    if k == 0 {
        return x - fms(x, e, hxs);
    }
    let twopk = from_words((0x3FF00000 + (k << 20)) as u32, 0);
    e = fms(x, e - c, c);
    e -= hxs;
    if k == -1 {
        return fms(0.5, x - e, 0.5);
    }
    if k == 1 {
        if x < -0.25 {
            return -2.0 * (e - (x + 0.5));
        }
        return fma(2.0, x - e, 1.0);
    }
    if k <= -2 || k > 56 {
        let mut y = 1.0 - (e - x);
        if k == 1024 {
            y = y * 2.0 * TWO1023;
        } else {
            y *= twopk;
        }
        return y - 1.0;
    }
    if k < 20 {
        let t = from_words((0x3FF00000 - (0x200000 >> k)) as u32, 0);
        let y = t - (e - x);
        y * twopk
    } else {
        let t = from_words(((0x3FF - k) << 20) as u32, 0);
        let mut y = x - (e + t);
        y += 1.0;
        y * twopk
    }
}

/// `s` and `hfsq + R` of FreeBSD's `k_log1p`, for the caller to fuse
/// `s * (hfsq + R)` into its own addition.
fn k_log1p_parts(f: f64) -> (f64, f64) {
    let s = f / (2.0 + f);
    let z = s * s;
    let w = z * z;
    let p1 = fma(w, fma(w, LG6, LG4), LG2);
    let p2 = fma(w, fma(w, fma(w, LG7, LG5), LG3), LG1);
    let r = fma(w, p1, z * p2);
    let hf = 0.5 * f;
    (s, fma(hf, f, r))
}

pub fn log2(x_in: f64) -> f64 {
    const IVLN2HI: f64 = 1.44269504072144627571e+00;
    const IVLN2LO: f64 = 1.67517131648865118353e-10;
    let mut x = x_in;
    let mut hx = hi(x);
    let lx = lo(x);
    let mut k = 0i32;
    if hx < 0x00100000 {
        if ((hx & 0x7FFFFFFF) as u32 | lx) == 0 {
            return f64::NEG_INFINITY;
        }
        if hx < 0 {
            return f64::NAN;
        }
        k -= 54;
        x *= TWO54;
        hx = hi(x);
    }
    if hx >= 0x7FF00000 {
        return x + x;
    }
    if hx == 0x3FF00000 && lo(x) == 0 {
        return 0.0;
    }
    k += (hx >> 20) - 1023;
    hx &= 0x000FFFFF;
    let i = (hx + 0x95F64) & 0x100000;
    x = with_hi(x, (hx | (i ^ 0x3FF00000)) as u32);
    k += i >> 20;
    let y = k as f64;
    let f = x - 1.0;
    let hf = 0.5 * f;
    let hfsq = hf * f;
    let (s, q) = k_log1p_parts(f);
    let hi_part = with_lo(fnma(hf, f, f), 0);
    let lo_part = fma(s, q, fnma(hf, f, f - hi_part));
    // `hi * ivln2hi` is only ever added: it fuses at each use.
    let mut val_lo = fma(lo_part + hi_part, IVLN2LO, lo_part * IVLN2HI);
    let w = fma(hi_part, IVLN2HI, y);
    val_lo += fma(hi_part, IVLN2HI, y - w);
    let _ = hfsq;
    val_lo + w
}

pub fn log10(x_in: f64) -> f64 {
    const IVLN10: f64 = 4.34294481903251816668e-01;
    const LOG10_2HI: f64 = 3.01029995663611771306e-01;
    const LOG10_2LO: f64 = 3.69423907715893078616e-13;
    let mut x = x_in;
    let mut hx = hi(x);
    let lx = lo(x);
    let mut k = 0i32;
    if hx < 0x00100000 {
        if ((hx & 0x7FFFFFFF) as u32 | lx) == 0 {
            return f64::NEG_INFINITY;
        }
        if hx < 0 {
            return f64::NAN;
        }
        k -= 54;
        x *= TWO54;
        hx = hi(x);
    }
    if hx >= 0x7FF00000 {
        return x + x;
    }
    k += (hx >> 20) - 1023;
    let i = ((k as u32 & 0x80000000) >> 31) as i32;
    hx = (hx & 0x000FFFFF) | ((0x3FF - i) << 20);
    let y = (k + i) as f64;
    x = from_words(hx as u32, lo(x));
    let z = fma(y, LOG10_2LO, IVLN10 * log(x));
    fma(y, LOG10_2HI, z)
}

#[cfg(test)]
pub fn log2_variant(x_in: f64, v: &[usize]) -> f64 {
    const IVLN2HI: f64 = 1.44269504072144627571e+00;
    const IVLN2LO: f64 = 1.67517131648865118353e-10;
    let mut x = x_in;
    let mut hx = hi(x);
    let lx = lo(x);
    let mut k = 0i32;
    if hx < 0x00100000 {
        if ((hx & 0x7FFFFFFF) as u32 | lx) == 0 {
            return f64::NEG_INFINITY;
        }
        if hx < 0 {
            return f64::NAN;
        }
        k -= 54;
        x *= TWO54;
        hx = hi(x);
    }
    if hx >= 0x7FF00000 {
        return x + x;
    }
    if hx == 0x3FF00000 && lo(x) == 0 {
        return 0.0;
    }
    k += (hx >> 20) - 1023;
    hx &= 0x000FFFFF;
    let i = (hx + 0x95F64) & 0x100000;
    x = with_hi(x, (hx | (i ^ 0x3FF00000)) as u32);
    k += i >> 20;
    let y = k as f64;
    let f = x - 1.0;
    let hf = 0.5 * f;
    let hfsq = hf * f;
    let s = f / (2.0 + f);
    let z = s * s;
    let ww = z * z;
    let p1 = fma(ww, fma(ww, LG6, LG4), LG2);
    let p2 = fma(ww, fma(ww, fma(ww, LG7, LG5), LG3), LG1);
    let rr = if v[3] == 0 { fma(ww, p1, z * p2) } else { fma(z, p2, ww * p1) };
    let q = if v[2] == 0 { fma(hf, f, rr) } else { hfsq + rr };
    let hi_part = with_lo(if v[0] == 0 { fnma(hf, f, f) } else { f - hfsq }, 0);
    let a = if v[1] == 0 { fnma(hf, f, f - hi_part) } else { (f - hi_part) - hfsq };
    let lo_part = if v[7] == 0 { a + s * q } else { fma(s, q, a) };
    let mut val_lo = match v[4] {
        0 => fma(lo_part + hi_part, IVLN2LO, lo_part * IVLN2HI),
        1 => fma(lo_part, IVLN2HI, (lo_part + hi_part) * IVLN2LO),
        _ => (lo_part + hi_part) * IVLN2LO + lo_part * IVLN2HI,
    };
    let w = if v[5] == 0 { fma(hi_part, IVLN2HI, y) } else { y + hi_part * IVLN2HI };
    val_lo += if v[6] == 0 { fma(hi_part, IVLN2HI, y - w) } else { (y - w) + hi_part * IVLN2HI };
    val_lo + w
}

#[cfg(test)]
pub fn log10_variant(x_in: f64, v: &[usize]) -> f64 {
    const IVLN10: f64 = 4.34294481903251816668e-01;
    const LOG10_2HI: f64 = 3.01029995663611771306e-01;
    const LOG10_2LO: f64 = 3.69423907715893078616e-13;
    let mut x = x_in;
    let mut hx = hi(x);
    let mut k = 0i32;
    if hx < 0x00100000 {
        k -= 54;
        x *= TWO54;
        hx = hi(x);
    }
    k += (hx >> 20) - 1023;
    let i = ((k as u32 & 0x80000000) >> 31) as i32;
    hx = (hx & 0x000FFFFF) | ((0x3FF - i) << 20);
    let y = (k + i) as f64;
    x = from_words(hx as u32, lo(x));
    let l = log(x);
    let z = match v[0] {
        0 => fma(y, LOG10_2LO, IVLN10 * l),
        1 => fma(IVLN10, l, y * LOG10_2LO),
        _ => y * LOG10_2LO + IVLN10 * l,
    };
    match v[1] {
        0 => fma(y, LOG10_2HI, z),
        _ => z + y * LOG10_2HI,
    }
}
