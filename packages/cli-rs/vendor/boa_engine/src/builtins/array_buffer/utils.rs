use std::{ptr, slice::SliceIndex, sync::atomic::Ordering};

use portable_atomic::{AtomicU8, AtomicU64};

use crate::{
    Context, JsResult,
    builtins::typed_array::{ClampedU8, Element, TypedArrayElement, TypedArrayKind},
    object::JsObject,
};

use super::ArrayBuffer;

#[derive(Clone, Copy)]
pub(crate) enum BytesConstPtr {
    Bytes(*const u8),
    AtomicBytes(*const AtomicU8),
}

impl BytesConstPtr {
    /// Offsets this const pointer by a positive amount.
    pub(crate) unsafe fn add(self, count: usize) -> Self {
        // SAFETY: the operation is guaranteed to be safe by the caller.
        unsafe {
            match self {
                Self::Bytes(p) => Self::Bytes(p.add(count)),
                Self::AtomicBytes(p) => Self::AtomicBytes(p.add(count)),
            }
        }
    }
}

#[derive(Clone, Copy)]
pub(crate) enum BytesMutPtr {
    Bytes(*mut u8),
    AtomicBytes(*const AtomicU8),
}

impl BytesMutPtr {
    /// Offsets this mut pointer by a positive amount.
    pub(crate) unsafe fn add(self, count: usize) -> Self {
        // SAFETY: the operation is guaranteed to be safe by the caller.
        unsafe {
            match self {
                Self::Bytes(p) => Self::Bytes(p.add(count)),
                Self::AtomicBytes(p) => Self::AtomicBytes(p.add(count)),
            }
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum SliceRef<'a> {
    Slice(&'a [u8]),
    AtomicSlice(&'a [AtomicU8]),
}

impl SliceRef<'_> {
    /// Gets the byte length of this `SliceRef`.
    pub(crate) fn len(&self) -> usize {
        match self {
            Self::Slice(buf) => buf.len(),
            Self::AtomicSlice(buf) => buf.len(),
        }
    }

    /// Gets a subslice of this `SliceRef`.
    pub(crate) fn subslice<I>(&self, index: I) -> SliceRef<'_>
    where
        I: SliceIndex<[u8], Output = [u8]> + SliceIndex<[AtomicU8], Output = [AtomicU8]>,
    {
        match self {
            Self::Slice(buffer) => SliceRef::Slice(buffer.get(index).expect("index out of bounds")),
            Self::AtomicSlice(buffer) => {
                SliceRef::AtomicSlice(buffer.get(index).expect("index out of bounds"))
            }
        }
    }

    /// Copies the slice into a new `Vec<u8>`. For `AtomicSlice`, each byte is loaded with `SeqCst` ordering.
    #[must_use]
    pub(crate) fn to_vec(self) -> Vec<u8> {
        match self {
            Self::Slice(s) => s.to_vec(),
            Self::AtomicSlice(s) => {
                let count = s.len();
                let mut target = Vec::with_capacity(count);
                // SAFETY: we only copy `count` bytes, which should be in bounds
                // for both the target buffer and the source atomic slice.
                // `target` also has enough capacity for `count` elements and
                // all its elements are initialized by `memcpy`.
                unsafe {
                    memcpy(
                        BytesConstPtr::AtomicBytes(s.as_ptr()),
                        BytesMutPtr::Bytes(target.as_mut_ptr()),
                        count,
                    );
                    target.set_len(s.len());
                }
                target
            }
        }
    }

    /// Gets the starting address of this `SliceRef`.
    #[cfg(debug_assertions)]
    pub(crate) fn addr(&self) -> usize {
        match self {
            Self::Slice(buf) => buf.as_ptr().addr(),
            Self::AtomicSlice(buf) => buf.as_ptr().addr(),
        }
    }

    /// Gets a pointer to the underlying slice.
    pub(crate) fn as_ptr(&self) -> BytesConstPtr {
        match self {
            SliceRef::Slice(s) => BytesConstPtr::Bytes(s.as_ptr()),
            SliceRef::AtomicSlice(s) => BytesConstPtr::AtomicBytes(s.as_ptr()),
        }
    }

    /// [`GetValueFromBuffer ( arrayBuffer, byteIndex, type, isTypedArray, order [ , isLittleEndian ] )`][spec]
    ///
    /// The start offset is determined by the input buffer instead of a `byteIndex` parameter.
    ///
    /// # Safety
    ///
    /// - There must be enough bytes in `buffer` to read an element from an array with type `TypedArrayKind`.
    /// - `buffer` must be aligned to the alignment of said element.
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-getvaluefrombuffer
    pub(crate) unsafe fn get_value(
        &self,
        kind: TypedArrayKind,
        order: Ordering,
    ) -> TypedArrayElement {
        unsafe fn read_elem<T: Element>(buffer: SliceRef<'_>, order: Ordering) -> T {
            // <https://tc39.es/ecma262/#sec-getvaluefrombuffer>

            // 1. Assert: IsDetachedBuffer(arrayBuffer) is false.
            // 2. Assert: There are sufficient bytes in arrayBuffer starting at byteIndex to represent a value of type.
            #[cfg(debug_assertions)]
            {
                assert!(buffer.len() >= size_of::<T>());
                assert_eq!(buffer.addr() % align_of::<T>(), 0);
            }

            // 3. Let block be arrayBuffer.[[ArrayBufferData]].
            // 4. Let elementSize be the Element Size value specified in Table 70 for Element Type type.
            // 5. If IsSharedArrayBuffer(arrayBuffer) is true, then
            //     a. Let execution be the [[CandidateExecution]] field of the surrounding agent's Agent Record.
            //     b. Let eventsRecord be the Agent Events Record of execution.[[EventsRecords]] whose [[AgentSignifier]] is AgentSignifier().
            //     c. If isTypedArray is true and IsNoTearConfiguration(type, order) is true, let noTear be true; otherwise let noTear be false.
            //     d. Let rawValue be a List of length elementSize whose elements are nondeterministically chosen byte values.
            //     e. NOTE: In implementations, rawValue is the result of a non-atomic or atomic read instruction on the underlying hardware. The nondeterminism is a semantic prescription of the memory model to describe observable behaviour of hardware with weak consistency.
            //     f. Let readEvent be ReadSharedMemory { [[Order]]: order, [[NoTear]]: noTear, [[Block]]: block, [[ByteIndex]]: byteIndex, [[ElementSize]]: elementSize }.
            //     g. Append readEvent to eventsRecord.[[EventList]].
            //     h. Append Chosen Value Record { [[Event]]: readEvent, [[ChosenValue]]: rawValue } to execution.[[ChosenValues]].
            // 6. Else,
            //     a. Let rawValue be a List whose elements are bytes from block at indices in the interval from byteIndex (inclusive) to byteIndex + elementSize (exclusive).
            // 7. Assert: The number of elements in rawValue is elementSize.
            // 8. If isLittleEndian is not present, set isLittleEndian to the value of the [[LittleEndian]] field of the surrounding agent's Agent Record.
            // 9. Return RawBytesToNumeric(type, rawValue, isLittleEndian).

            // SAFETY: The invariants of this operation are ensured by the caller.
            unsafe { T::read(buffer).load(order) }
        }

        let buffer = *self;

        // SAFETY: The invariants of this operation are ensured by the caller.
        unsafe {
            match kind {
                TypedArrayKind::Int8 => read_elem::<i8>(buffer, order).into(),
                TypedArrayKind::Uint8 => read_elem::<u8>(buffer, order).into(),
                TypedArrayKind::Uint8Clamped => read_elem::<ClampedU8>(buffer, order).into(),
                TypedArrayKind::Int16 => read_elem::<i16>(buffer, order).into(),
                TypedArrayKind::Uint16 => read_elem::<u16>(buffer, order).into(),
                TypedArrayKind::Int32 => read_elem::<i32>(buffer, order).into(),
                TypedArrayKind::Uint32 => read_elem::<u32>(buffer, order).into(),
                TypedArrayKind::BigInt64 => read_elem::<i64>(buffer, order).into(),
                TypedArrayKind::BigUint64 => read_elem::<u64>(buffer, order).into(),
                #[cfg(feature = "float16")]
                TypedArrayKind::Float16 => {
                    read_elem::<crate::builtins::typed_array::Float16>(buffer, order).into()
                }
                TypedArrayKind::Float32 => read_elem::<f32>(buffer, order).into(),
                TypedArrayKind::Float64 => read_elem::<f64>(buffer, order).into(),
            }
        }
    }

    /// [`CloneArrayBuffer ( srcBuffer, srcByteOffset, srcLength )`][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-clonearraybuffer
    pub(crate) fn clone(&self, context: &mut Context) -> JsResult<JsObject<ArrayBuffer>> {
        // 1. Assert: IsDetachedBuffer(srcBuffer) is false.

        // 2. Let targetBuffer be ? AllocateArrayBuffer(%ArrayBuffer%, srcLength).
        let target_buffer = ArrayBuffer::allocate(
            &context
                .realm()
                .intrinsics()
                .constructors()
                .array_buffer()
                .constructor()
                .into(),
            self.len() as u64,
            None,
            context,
        )?;

        // 3. Let srcBlock be srcBuffer.[[ArrayBufferData]].

        // 4. Let targetBlock be targetBuffer.[[ArrayBufferData]].
        {
            let mut target_buffer = target_buffer.borrow_mut();
            let target_block = target_buffer
                .data_mut()
                .bytes_mut()
                .expect("ArrayBuffer cannot be detached here");

            // 5. Perform CopyDataBlockBytes(targetBlock, 0, srcBlock, srcByteOffset, srcLength).

            // SAFETY: Both buffers are of the same length, `buffer.len()`, which makes this operation
            // safe.
            unsafe {
                memcpy(
                    self.as_ptr(),
                    BytesMutPtr::Bytes(target_block.as_mut_ptr()),
                    self.len(),
                );
            }
        }

        // 6. Return targetBuffer.
        Ok(target_buffer)
    }
}

impl<'a> From<&'a [u8]> for SliceRef<'a> {
    fn from(value: &'a [u8]) -> Self {
        Self::Slice(value)
    }
}

impl<'a> From<&'a [AtomicU8]> for SliceRef<'a> {
    fn from(value: &'a [AtomicU8]) -> Self {
        Self::AtomicSlice(value)
    }
}

#[derive(Debug)]
pub(crate) enum SliceRefMut<'a> {
    Slice(&'a mut [u8]),
    AtomicSlice(&'a [AtomicU8]),
}

impl SliceRefMut<'_> {
    /// Gets the byte length of this `SliceRefMut`.
    pub(crate) fn len(&self) -> usize {
        match self {
            Self::Slice(buf) => buf.len(),
            Self::AtomicSlice(buf) => buf.len(),
        }
    }

    /// Gets a subslice of this `SliceRefMut`.
    #[expect(unused, reason = "could still be useful in the future")]
    pub(crate) fn subslice<I>(&self, index: I) -> SliceRef<'_>
    where
        I: SliceIndex<[u8], Output = [u8]> + SliceIndex<[AtomicU8], Output = [AtomicU8]>,
    {
        match self {
            Self::Slice(buffer) => SliceRef::Slice(buffer.get(index).expect("index out of bounds")),
            Self::AtomicSlice(buffer) => {
                SliceRef::AtomicSlice(buffer.get(index).expect("index out of bounds"))
            }
        }
    }

    /// Gets a mutable subslice of this `SliceRefMut`.
    pub(crate) fn subslice_mut<I>(&mut self, index: I) -> SliceRefMut<'_>
    where
        I: SliceIndex<[u8], Output = [u8]> + SliceIndex<[AtomicU8], Output = [AtomicU8]>,
    {
        match self {
            Self::Slice(buffer) => {
                SliceRefMut::Slice(buffer.get_mut(index).expect("index out of bounds"))
            }
            Self::AtomicSlice(buffer) => {
                SliceRefMut::AtomicSlice(buffer.get(index).expect("index out of bounds"))
            }
        }
    }

    /// Gets the starting address of this `SliceRefMut`.
    #[cfg(debug_assertions)]
    pub(crate) fn addr(&self) -> usize {
        match self {
            Self::Slice(buf) => buf.as_ptr().addr(),
            Self::AtomicSlice(buf) => buf.as_ptr().addr(),
        }
    }

    /// Gets a pointer to the underlying slice.
    pub(crate) fn as_ptr(&mut self) -> BytesMutPtr {
        match self {
            Self::Slice(s) => BytesMutPtr::Bytes(s.as_mut_ptr()),
            Self::AtomicSlice(s) => BytesMutPtr::AtomicBytes(s.as_ptr()),
        }
    }

    /// `25.1.2.12 SetValueInBuffer ( arrayBuffer, byteIndex, type, value, isTypedArray, order [ , isLittleEndian ] )`
    ///
    /// The start offset is determined by the input buffer instead of a `byteIndex` parameter.
    ///
    /// # Safety
    ///
    /// - There must be enough bytes in `buffer` to write the `TypedArrayElement`.
    /// - `buffer` must be aligned to the alignment of the `TypedArrayElement`.
    ///
    /// # Panics
    ///
    /// - Panics if the type of `value` is not equal to the content of `kind`.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-setvalueinbuffer
    pub(crate) unsafe fn set_value(&mut self, value: TypedArrayElement, order: Ordering) {
        unsafe fn write_elem<T: Element>(buffer: SliceRefMut<'_>, value: T, order: Ordering) {
            // <https://tc39.es/ecma262/#sec-setvalueinbuffer>

            // 1. Assert: IsDetachedBuffer(arrayBuffer) is false.
            // 2. Assert: There are sufficient bytes in arrayBuffer starting at byteIndex to represent a value of type.
            // 3. Assert: value is a BigInt if IsBigIntElementType(type) is true; otherwise, value is a Number.
            #[cfg(debug_assertions)]
            {
                assert!(buffer.len() >= size_of::<T>());
                assert_eq!(buffer.addr() % align_of::<T>(), 0);
            }

            // 4. Let block be arrayBuffer.[[ArrayBufferData]].
            // 5. Let elementSize be the Element Size value specified in Table 70 for Element Type type.
            // 6. If isLittleEndian is not present, set isLittleEndian to the value of the [[LittleEndian]] field of the surrounding agent's Agent Record.
            // 7. Let rawBytes be NumericToRawBytes(type, value, isLittleEndian).
            // 8. If IsSharedArrayBuffer(arrayBuffer) is true, then
            //     a. Let execution be the [[CandidateExecution]] field of the surrounding agent's Agent Record.
            //     b. Let eventsRecord be the Agent Events Record of execution.[[EventsRecords]] whose [[AgentSignifier]] is AgentSignifier().
            //     c. If isTypedArray is true and IsNoTearConfiguration(type, order) is true, let noTear be true; otherwise let noTear be false.
            //     d. Append WriteSharedMemory { [[Order]]: order, [[NoTear]]: noTear, [[Block]]: block, [[ByteIndex]]: byteIndex, [[ElementSize]]: elementSize, [[Payload]]: rawBytes } to eventsRecord.[[EventList]].
            // 9. Else,
            //     a. Store the individual bytes of rawBytes into block, starting at block[byteIndex].
            // 10. Return unused.

            // SAFETY: The invariants of this operation are ensured by the caller.
            unsafe {
                T::read_mut(buffer).store(value, order);
            }
        }

        // Have to rebind in order to remove the outer `&mut` ref.
        let buffer = match self {
            SliceRefMut::Slice(buf) => SliceRefMut::Slice(buf),
            SliceRefMut::AtomicSlice(buf) => SliceRefMut::AtomicSlice(buf),
        };

        // SAFETY: The invariants of this operation are ensured by the caller.
        unsafe {
            match value {
                TypedArrayElement::Int8(e) => write_elem(buffer, e, order),
                TypedArrayElement::Uint8(e) => write_elem(buffer, e, order),
                TypedArrayElement::Uint8Clamped(e) => write_elem(buffer, e, order),
                TypedArrayElement::Int16(e) => write_elem(buffer, e, order),
                TypedArrayElement::Uint16(e) => write_elem(buffer, e, order),
                TypedArrayElement::Int32(e) => write_elem(buffer, e, order),
                TypedArrayElement::Uint32(e) => write_elem(buffer, e, order),
                TypedArrayElement::BigInt64(e) => write_elem(buffer, e, order),
                TypedArrayElement::BigUint64(e) => write_elem(buffer, e, order),
                #[cfg(feature = "float16")]
                TypedArrayElement::Float16(e) => write_elem(buffer, e, order),
                TypedArrayElement::Float32(e) => write_elem(buffer, e, order),
                TypedArrayElement::Float64(e) => write_elem(buffer, e, order),
            }
        }
    }
}

impl<'a> From<&'a mut [u8]> for SliceRefMut<'a> {
    fn from(value: &'a mut [u8]) -> Self {
        Self::Slice(value)
    }
}

impl<'a> From<&'a [AtomicU8]> for SliceRefMut<'a> {
    fn from(value: &'a [AtomicU8]) -> Self {
        Self::AtomicSlice(value)
    }
}

const BATCH_SIZE: usize = size_of::<u64>();

/// Given a pointer address and total byte count, computes the number of
/// head bytes needed to reach 8-byte alignment, the number of aligned
/// 8-byte chunks, and the number of remaining tail bytes.
fn compute_batch_offsets(ptr_addr: usize, count: usize) -> (usize, usize, usize) {
    let misalign = ptr_addr % BATCH_SIZE;
    let head = if misalign == 0 {
        0
    } else {
        (BATCH_SIZE - misalign).min(count)
    };
    let remaining = count - head;
    let chunks = remaining / BATCH_SIZE;
    let tail = remaining % BATCH_SIZE;
    (head, chunks, tail)
}

/// Copies `count` bytes forward from `src` to `dest` using `AtomicU64` for aligned
/// 8-byte chunks when both pointers share the same misalignment, falling back to
/// byte-by-byte `AtomicU8` copies otherwise.
///
/// # Safety
///
/// - `src` must be valid for `count` reads of `AtomicU8`.
/// - `dest` must be valid for `count` writes of `AtomicU8`.
/// - The memory regions must not overlap.
unsafe fn batched_atomic_copy_forward(src: *const AtomicU8, dest: *const AtomicU8, count: usize) {
    if count == 0 {
        return;
    }

    // Batch only if both pointers have the same misalignment, so that aligning
    // one automatically aligns the other. Otherwise, fall back to byte-by-byte.
    if (src as usize) % BATCH_SIZE != (dest as usize) % BATCH_SIZE {
        // SAFETY: ensured by the caller.
        unsafe {
            for i in 0..count {
                (*dest.add(i)).store((*src.add(i)).load(Ordering::Relaxed), Ordering::Relaxed);
            }
        }
        return;
    }

    let (head, chunks, tail) = compute_batch_offsets(dest as usize, count);

    if chunks == 0 {
        // SAFETY: ensured by the caller.
        unsafe {
            for i in 0..count {
                (*dest.add(i)).store((*src.add(i)).load(Ordering::Relaxed), Ordering::Relaxed);
            }
        }
        return;
    }

    // Phase 1: Copy unaligned head bytes until both pointers are 8-byte aligned.
    // SAFETY: ensured by the caller — both pointers are valid for `count` bytes.
    unsafe {
        for i in 0..head {
            (*dest.add(i)).store((*src.add(i)).load(Ordering::Relaxed), Ordering::Relaxed);
        }
    }

    // Verify both pointers are now aligned after Phase 1.
    #[cfg(debug_assertions)]
    {
        debug_assert_eq!((dest as usize + head) % BATCH_SIZE, 0);
        debug_assert_eq!((src as usize + head) % BATCH_SIZE, 0);
    }

    // Phase 2: Copy aligned 8-byte chunks using AtomicU64 load/store.
    // SAFETY: Both `src + head` and `dest + head` are now 8-byte aligned
    // (same misalignment guaranteed, Phase 1 aligned dest, so src is also aligned).
    // `AtomicU8` is `#[repr(transparent)]` over `u8`, so casting to `AtomicU64`
    // is valid when properly aligned.
    #[allow(clippy::cast_ptr_alignment)]
    unsafe {
        let src_u64 = src.add(head).cast::<AtomicU64>();
        let dest_u64 = dest.add(head).cast::<AtomicU64>();
        for i in 0..chunks {
            (*dest_u64.add(i)).store((*src_u64.add(i)).load(Ordering::Relaxed), Ordering::Relaxed);
        }
    }

    // Phase 3: Copy remaining tail bytes.
    let tail_start = head + chunks * BATCH_SIZE;
    // SAFETY: ensured by the caller — both pointers are valid for `count` bytes.
    unsafe {
        for i in 0..tail {
            (*dest.add(tail_start + i)).store(
                (*src.add(tail_start + i)).load(Ordering::Relaxed),
                Ordering::Relaxed,
            );
        }
    }
}

/// Copies `count` bytes backward from `src` to `dest` using `AtomicU64` for aligned
/// 8-byte chunks when both pointers share the same misalignment, falling back to
/// byte-by-byte `AtomicU8` copies otherwise.
///
/// # Safety
///
/// - `src` must be valid for `count` reads of `AtomicU8`.
/// - `dest` must be valid for `count` writes of `AtomicU8`.
unsafe fn batched_atomic_copy_backward(src: *const AtomicU8, dest: *const AtomicU8, count: usize) {
    if count == 0 {
        return;
    }

    // Batch only if both pointers have the same misalignment.
    if (src as usize) % BATCH_SIZE != (dest as usize) % BATCH_SIZE {
        // SAFETY: ensured by the caller.
        unsafe {
            for i in (0..count).rev() {
                (*dest.add(i)).store((*src.add(i)).load(Ordering::Relaxed), Ordering::Relaxed);
            }
        }
        return;
    }

    let (head, chunks, tail) = compute_batch_offsets(dest as usize, count);

    if chunks == 0 {
        // SAFETY: ensured by the caller.
        unsafe {
            for i in (0..count).rev() {
                (*dest.add(i)).store((*src.add(i)).load(Ordering::Relaxed), Ordering::Relaxed);
            }
        }
        return;
    }

    let tail_start = head + chunks * BATCH_SIZE;

    // Phase 1: Copy tail bytes backwards.
    // SAFETY: ensured by the caller — both pointers are valid for `count` bytes.
    unsafe {
        for i in (0..tail).rev() {
            (*dest.add(tail_start + i)).store(
                (*src.add(tail_start + i)).load(Ordering::Relaxed),
                Ordering::Relaxed,
            );
        }
    }

    // Verify both pointers are aligned after peeling tail bytes.
    #[cfg(debug_assertions)]
    {
        debug_assert_eq!((dest as usize + tail_start) % BATCH_SIZE, 0);
        debug_assert_eq!((src as usize + tail_start) % BATCH_SIZE, 0);
    }

    // Phase 2: Copy aligned 8-byte chunks backwards.
    // SAFETY: Both `src + head` and `dest + head` are 8-byte aligned
    // (same misalignment guaranteed, Phase 1 peeled tail bytes).
    #[allow(clippy::cast_ptr_alignment)]
    unsafe {
        let src_u64 = src.add(head).cast::<AtomicU64>();
        let dest_u64 = dest.add(head).cast::<AtomicU64>();
        for i in (0..chunks).rev() {
            (*dest_u64.add(i)).store((*src_u64.add(i)).load(Ordering::Relaxed), Ordering::Relaxed);
        }
    }

    // Phase 3: Copy remaining head bytes backwards.
    // SAFETY: ensured by the caller.
    unsafe {
        for i in (0..head).rev() {
            (*dest.add(i)).store((*src.add(i)).load(Ordering::Relaxed), Ordering::Relaxed);
        }
    }
}

/// Copies `count` bytes from non-atomic `src` to atomic `dest` using `u64`/`AtomicU64`
/// for aligned 8-byte chunks when both pointers share the same misalignment.
///
/// # Safety
///
/// - `src` must be valid for `count` reads.
/// - `dest` must be valid for `count` writes of `AtomicU8`.
/// - The memory regions must not overlap.
unsafe fn batched_copy_bytes_to_atomic(src: *const u8, dest: *const AtomicU8, count: usize) {
    if count == 0 {
        return;
    }

    // Batch only if both pointers have the same misalignment.
    if (src as usize) % BATCH_SIZE != (dest as usize) % BATCH_SIZE {
        // SAFETY: ensured by the caller.
        unsafe {
            for i in 0..count {
                (*dest.add(i)).store(*src.add(i), Ordering::Relaxed);
            }
        }
        return;
    }

    let (head, chunks, tail) = compute_batch_offsets(dest as usize, count);

    if chunks == 0 {
        // SAFETY: ensured by the caller.
        unsafe {
            for i in 0..count {
                (*dest.add(i)).store(*src.add(i), Ordering::Relaxed);
            }
        }
        return;
    }

    // Phase 1: Head bytes until both pointers are 8-byte aligned.
    // SAFETY: ensured by the caller.
    unsafe {
        for i in 0..head {
            (*dest.add(i)).store(*src.add(i), Ordering::Relaxed);
        }
    }

    // Verify both pointers are now aligned after Phase 1.
    #[cfg(debug_assertions)]
    {
        debug_assert_eq!((dest as usize + head) % BATCH_SIZE, 0);
        debug_assert_eq!((src as usize + head) % BATCH_SIZE, 0);
    }

    // Phase 2: Aligned 8-byte chunks.
    // SAFETY: Both `src + head` and `dest + head` are 8-byte aligned.
    #[allow(clippy::cast_ptr_alignment)]
    unsafe {
        let src_u64 = src.add(head).cast::<u64>();
        let dest_u64 = dest.add(head).cast::<AtomicU64>();
        for i in 0..chunks {
            (*dest_u64.add(i)).store(ptr::read(src_u64.add(i)), Ordering::Relaxed);
        }
    }

    // Phase 3: Tail bytes.
    let tail_start = head + chunks * BATCH_SIZE;
    // SAFETY: ensured by the caller.
    unsafe {
        for i in 0..tail {
            (*dest.add(tail_start + i)).store(*src.add(tail_start + i), Ordering::Relaxed);
        }
    }
}

/// Copies `count` bytes from atomic `src` to non-atomic `dest` using `AtomicU64`/`u64`
/// for aligned 8-byte chunks when both pointers share the same misalignment.
///
/// # Safety
///
/// - `src` must be valid for `count` reads of `AtomicU8`.
/// - `dest` must be valid for `count` writes.
/// - The memory regions must not overlap.
unsafe fn batched_copy_atomic_to_bytes(src: *const AtomicU8, dest: *mut u8, count: usize) {
    if count == 0 {
        return;
    }

    // Batch only if both pointers have the same misalignment.
    if (src as usize) % BATCH_SIZE != (dest as usize) % BATCH_SIZE {
        // SAFETY: ensured by the caller.
        unsafe {
            for i in 0..count {
                *dest.add(i) = (*src.add(i)).load(Ordering::Relaxed);
            }
        }
        return;
    }

    let (head, chunks, tail) = compute_batch_offsets(src as usize, count);

    if chunks == 0 {
        // SAFETY: ensured by the caller.
        unsafe {
            for i in 0..count {
                *dest.add(i) = (*src.add(i)).load(Ordering::Relaxed);
            }
        }
        return;
    }

    // Phase 1: Head bytes until both pointers are 8-byte aligned.
    // SAFETY: ensured by the caller.
    unsafe {
        for i in 0..head {
            *dest.add(i) = (*src.add(i)).load(Ordering::Relaxed);
        }
    }

    // Verify both pointers are now aligned after Phase 1.
    #[cfg(debug_assertions)]
    {
        debug_assert_eq!((src as usize + head) % BATCH_SIZE, 0);
        debug_assert_eq!((dest as usize + head) % BATCH_SIZE, 0);
    }

    // Phase 2: Aligned 8-byte chunks.
    // SAFETY: Both `src + head` and `dest + head` are 8-byte aligned.
    #[allow(clippy::cast_ptr_alignment)]
    unsafe {
        let src_u64 = src.add(head).cast::<AtomicU64>();
        let dest_u64 = dest.add(head).cast::<u64>();
        for i in 0..chunks {
            ptr::write(dest_u64.add(i), (*src_u64.add(i)).load(Ordering::Relaxed));
        }
    }

    // Phase 3: Tail bytes.
    let tail_start = head + chunks * BATCH_SIZE;
    // SAFETY: ensured by the caller.
    unsafe {
        for i in 0..tail {
            *dest.add(tail_start + i) = (*src.add(tail_start + i)).load(Ordering::Relaxed);
        }
    }
}

/// Copies `count` bytes from `src` into `dest` using atomic relaxed loads and stores.
///
/// Uses `AtomicU64` for aligned 8-byte chunks and falls back to `AtomicU8` for
/// unaligned head/tail bytes.
///
/// # Safety
///
/// - Both `src` and `dest` must have at least `count` bytes to read and write,
///   respectively.
pub(super) unsafe fn copy_shared_to_shared(
    src: *const AtomicU8,
    dest: *const AtomicU8,
    count: usize,
) {
    // SAFETY: The invariants of this operation are ensured by the caller.
    unsafe { batched_atomic_copy_forward(src, dest, count) }
}

/// Copies `count` bytes backwards from `src` into `dest` using atomic relaxed loads and stores.
///
/// Uses `AtomicU64` for aligned 8-byte chunks and falls back to `AtomicU8` for
/// unaligned head/tail bytes.
///
/// # Safety
///
/// - Both `src` and `dest` must have at least `count` bytes to read and write,
///   respectively.
unsafe fn copy_shared_to_shared_backwards(
    src: *const AtomicU8,
    dest: *const AtomicU8,
    count: usize,
) {
    // SAFETY: The invariants of this operation are ensured by the caller.
    unsafe { batched_atomic_copy_backward(src, dest, count) }
}

/// Copies `count` bytes from the buffer `src` into the buffer `dest`, using the atomic ordering
/// `Ordering::Relaxed` if any of the buffers are atomic.
///
/// # Safety
///
/// - Both `src` and `dest` must have at least `count` bytes to read and write, respectively.
/// - The region of memory referenced by `src` must not overlap with the region of memory
///   referenced by `dest`.
pub(crate) unsafe fn memcpy(src: BytesConstPtr, dest: BytesMutPtr, count: usize) {
    match (src, dest) {
        // SAFETY: The invariants of this operation are ensured by the caller of the function.
        (BytesConstPtr::Bytes(src), BytesMutPtr::Bytes(dest)) => unsafe {
            ptr::copy_nonoverlapping(src, dest, count);
        },
        // SAFETY: The invariants of this operation are ensured by the caller of the function.
        (BytesConstPtr::Bytes(src), BytesMutPtr::AtomicBytes(dest)) => unsafe {
            batched_copy_bytes_to_atomic(src, dest, count);
        },
        // SAFETY: The invariants of this operation are ensured by the caller of the function.
        (BytesConstPtr::AtomicBytes(src), BytesMutPtr::Bytes(dest)) => unsafe {
            batched_copy_atomic_to_bytes(src, dest, count);
        },
        // SAFETY: The invariants of this operation are ensured by the caller of the function.
        (BytesConstPtr::AtomicBytes(src), BytesMutPtr::AtomicBytes(dest)) => unsafe {
            copy_shared_to_shared(src, dest, count);
        },
    }
}

/// Copies `count` bytes from the position `from` to the position `to` in `buffer`, but always
/// copying from left to right.
///
///
/// # Safety
///
/// - `ptr` must be valid from the offset `ptr + from` for `count` reads of bytes.
/// - `ptr` must be valid from the offset `ptr + to` for `count` writes of bytes.
// This looks like a worse version of `memmove`... and it is exactly that...
// but it's the correct behaviour for a weird usage of `%TypedArray%.prototype.slice` so ¯\_(ツ)_/¯.
// Obviously don't use this if you need to implement something that requires a "proper" memmove.
pub(crate) unsafe fn memmove_naive(ptr: BytesMutPtr, from: usize, to: usize, count: usize) {
    match ptr {
        // SAFETY: The invariants of this operation are ensured by the caller of the function.
        BytesMutPtr::Bytes(ptr) => unsafe {
            for i in 0..count {
                ptr::copy(ptr.add(from + i), ptr.add(to + i), 1);
            }
        },
        // SAFETY: The invariants of this operation are ensured by the caller of the function.
        BytesMutPtr::AtomicBytes(ptr) => unsafe {
            let src = ptr.add(from);
            let dest = ptr.add(to);
            copy_shared_to_shared(src, dest, count);
        },
    }
}

/// Copies `count` bytes from the position `from` to the position `to` in `buffer`.
///
/// # Safety
///
/// - `ptr` must be valid from the offset `ptr + from` for `count` reads of bytes.
/// - `ptr` must be valid from the offset `ptr + to` for `count` writes of bytes.
pub(crate) unsafe fn memmove(ptr: BytesMutPtr, from: usize, to: usize, count: usize) {
    match ptr {
        // SAFETY: The invariants of this operation are ensured by the caller of the function.
        BytesMutPtr::Bytes(ptr) => unsafe {
            let src = ptr.add(from);
            let dest = ptr.add(to);
            ptr::copy(src, dest, count);
        },
        // SAFETY: The invariants of this operation are ensured by the caller of the function.
        BytesMutPtr::AtomicBytes(ptr) => unsafe {
            let src = ptr.add(from);
            let dest = ptr.add(to);
            // Let's draw a simple array.
            //
            // | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
            //
            // Now let's define `from`, `to` and `count` such that the below condition is satisfied.
            // `from = 0`
            // `to = 2`
            // `count = 4`
            //
            // We can now imagine that the array is pointed to by our indices:
            //
            // | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
            //   ^       ^
            // from     to
            //
            // If we start copying bytes until `from + 2 = to`, we can see that the new array would be:
            //
            // | 0 | 1 | 0 | 1 | 0 | 5 | 6 | 7 | 8 |
            //           ^       ^
            //    from + 2       to + 2
            //
            // However, we've lost the data that was in the index 2! If this process
            // continues, this'll give the incorrect result:
            //
            // | 0 | 1 | 0 | 1 | 0 | 1 | 6 | 7 | 8 |
            //
            // To solve this, we just need to copy backwards to ensure we never override data that
            // we need in next iterations:
            //
            // | 0 | 1 | 2 | 3 | 4 | 3 | 6 | 7 | 8 |
            //               ^       ^
            //            from      to
            //
            // | 0 | 1 | 2 | 3 | 2 | 3 | 6 | 7 | 8 |
            //           ^       ^
            //        from      to
            //
            // | 0 | 1 | 0 | 1 | 2 | 3 | 6 | 7 | 8 |
            //   ^       ^
            // from     to
            if src < dest {
                copy_shared_to_shared_backwards(src, dest, count);
            } else {
                copy_shared_to_shared(src, dest, count);
            }
        },
    }
}

#[cfg(test)]
mod tests_miri {
    use super::*;
    use portable_atomic::AtomicU8;
    use std::sync::atomic::Ordering;

    /// Tests `batched_atomic_copy_forward` with misaligned pointers
    /// (different misalignment) to exercise the byte-by-byte fallback.
    #[test]
    fn batched_forward_misaligned_fallback() {
        let src_data: Vec<AtomicU8> = (0..32).map(|i| AtomicU8::new(i as u8)).collect();
        let dest_data: Vec<AtomicU8> = (0..32).map(|_| AtomicU8::new(0)).collect();

        // SAFETY: Vec has 32 elements, offset 1 and 2 are within bounds.
        let src = unsafe { src_data.as_ptr().add(1) };
        // SAFETY: Vec has 32 elements, offset 2 is within bounds.
        let dest = unsafe { dest_data.as_ptr().add(2) };
        let count = 20;

        // SAFETY: Both pointers are valid for 20 reads/writes (32 - max_offset = 30 >= 20).
        unsafe { batched_atomic_copy_forward(src, dest, count) };

        for i in 0..count {
            // SAFETY: `src` is valid for `count` reads starting from its base.
            let expected = unsafe { (*src.add(i)).load(Ordering::Relaxed) };
            // SAFETY: `dest` is valid for `count` reads starting from its base.
            let actual = unsafe { (*dest.add(i)).load(Ordering::Relaxed) };
            assert_eq!(actual, expected, "mismatch at index {i}");
        }
    }

    /// Tests `batched_atomic_copy_backward` with misaligned pointers.
    #[test]
    fn batched_backward_misaligned_fallback() {
        let src_data: Vec<AtomicU8> = (0..32).map(|i| AtomicU8::new(i as u8)).collect();
        let dest_data: Vec<AtomicU8> = (0..32).map(|_| AtomicU8::new(0)).collect();

        // SAFETY: Vec has 32 elements, offset 1 is within bounds.
        let src = unsafe { src_data.as_ptr().add(1) };
        // SAFETY: Vec has 32 elements, offset 2 is within bounds.
        let dest = unsafe { dest_data.as_ptr().add(2) };
        let count = 20;

        // SAFETY: Both pointers are valid for 20 reads/writes (32 - max_offset = 30 >= 20).
        unsafe { batched_atomic_copy_backward(src, dest, count) };

        for i in 0..count {
            // SAFETY: `src` is valid for `count` reads starting from its base.
            let expected = unsafe { (*src.add(i)).load(Ordering::Relaxed) };
            // SAFETY: `dest` is valid for `count` reads starting from its base.
            let actual = unsafe { (*dest.add(i)).load(Ordering::Relaxed) };
            assert_eq!(actual, expected, "mismatch at index {i}");
        }
    }

    /// Tests `batched_copy_bytes_to_atomic` with misaligned pointers.
    #[test]
    fn batched_bytes_to_atomic_misaligned_fallback() {
        let src_data: Vec<u8> = (0..32).map(|i| i as u8).collect();
        let dest_data: Vec<AtomicU8> = (0..32).map(|_| AtomicU8::new(0)).collect();

        // SAFETY: Vec has 32 elements, offset 1 is within bounds.
        let src = unsafe { src_data.as_ptr().add(1) };
        // SAFETY: Vec has 32 elements, offset 2 is within bounds.
        let dest = unsafe { dest_data.as_ptr().add(2) };
        let count = 20;

        // SAFETY: Both pointers are valid for 20 reads/writes, regions do not overlap.
        unsafe { batched_copy_bytes_to_atomic(src, dest, count) };

        for i in 0..count {
            // SAFETY: `src` is valid for `count` reads starting from its base.
            let expected = unsafe { *src.add(i) };
            // SAFETY: `dest` is valid for `count` reads starting from its base.
            let actual = unsafe { (*dest.add(i)).load(Ordering::Relaxed) };
            assert_eq!(actual, expected, "mismatch at index {i}");
        }
    }

    /// Tests `batched_copy_atomic_to_bytes` with misaligned pointers.
    #[test]
    fn batched_atomic_to_bytes_misaligned_fallback() {
        let src_data: Vec<AtomicU8> = (0..32).map(|i| AtomicU8::new(i as u8)).collect();
        let mut dest_data: Vec<u8> = vec![0u8; 32];

        // SAFETY: Vec has 32 elements, offset 1 is within bounds.
        let src = unsafe { src_data.as_ptr().add(1) };
        // SAFETY: Vec has 32 elements, offset 2 is within bounds.
        let dest = unsafe { dest_data.as_mut_ptr().add(2) };
        let count = 20;

        // SAFETY: Both pointers are valid for 20 reads/writes, regions do not overlap.
        unsafe { batched_copy_atomic_to_bytes(src, dest, count) };

        for i in 0..count {
            // SAFETY: `src` is valid for `count` reads starting from its base.
            let expected = unsafe { (*src.add(i)).load(Ordering::Relaxed) };
            // SAFETY: `dest` is valid for `count` reads starting from its base.
            let actual = unsafe { *dest.add(i) };
            assert_eq!(actual, expected, "mismatch at index {i}");
        }
    }
}
