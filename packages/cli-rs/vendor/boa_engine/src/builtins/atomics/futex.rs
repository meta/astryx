// TODO: track https://github.com/rust-lang/rfcs/pull/3467 to see if we can use `UnsafeAliased` instead
// of raw pointers.

// A bit of context about how exactly this thing works.
//
// `Atomics.wait/notify` is basically an emulation of the "futex" syscall, which internally uses
// a wait queue attached to a certain memory address, where processes and threads can manipulate
// it to synchronize between them.
// More information: https://en.wikipedia.org/wiki/Futex
//
// Our emulation of the API is composed by three components:
//
// - `FutexWaiters`, which is a map of addresses to the corresponding wait queue for that address.
//   Internally uses intrusive linked lists to avoid allocating when adding a new waiter, which
//   reduces the time spent by a thread in the critical section.
//
// - `FutexWaiter`, which contains all the data necessary to be able to wake a waiter from another
//   thread. If `FutexWaiter` is part of a linked list, it has not been woken up. Otherwise,
//   it has been woken up by a call to `notify`. This is checked after waking up to see
//   if the waiter was indeed woken up or if it just sporadically woke up, which can happen
//   while waiting on a `CondVar`.
//
// - `CRITICAL_SECTION`, a global static that must be locked before registering or notifying any
//   waiter. This guarantees that only one agent can write to the wait queues at any point in time.
//
// We can emulate a typical execution using the API for demonstration purposes.
// At the start of the program, we initially have an empty map of wait queues. We represent this
// graphically as:
//
//   Address   │
//             │
// ────────────┼────────────────────────────────────────────────────────────────────
//             │
//             │
//   <empty>   │
//             │
//             │
//
// Each row here will represent an address and the corresponding wait queue for that address.
//
// Let's suppose that "Thread 2" wants to wait on the address 50. After locking the global mutex,
// it first creates a new instante of a `FutexWaiter` and passes a pointer to it to the
// `FutexWaiters::add_waiter`:
//
//   Address   │
//             │
// ────────────┼──────────────────────────────────────────────────────────────────────
//             │
//             │       ┌───────────────┐
//             │    ┌─►│               │
//             │    │  │ Thread 2      │
//             │    │  │ FutexWaiter   │
//     50      ├────┘  │               │
//             │       │               │
//             │       │ cond_var      │
//             │       │               │
//             │       │               │
//             │       └───────────────┘
//             │
//
// Immediately after this, "Thread 2" calls `cond_var.wait`, unlocks the global mutex and sleeps
// until it is notified again (ignoring the spurious wakeups, those are handled in an infinite loop
// anyways).
//
// Now, let's suppose that `Thread 1` has now acquired the lock and now wants to also
// wait on the address `50`. Doing the same procedure as "Thread 2", our map now looks like:
//
//   Address   │
//             │
// ────────────┼──────────────────────────────────────────────────────────────────────
//             │
//             │       ┌───────────────┐        ┌───────────────┐
//             │    ┌─►│               ├───────►│               │
//             │    │  │ Thread 2      │        │ Thread 1      │
//             │    │  │ FutexWaiter   │        │ FutexWaiter   │
//     50      ├────┘  │               │        │               │
//             │       │               │        │               │
//             │       │ cond_var      │        │ cond_var      │
//             │       │               │◄───────┤               │
//             │       │               │        │               │
//             │       └───────────────┘        └───────────────┘
//             │
//
// Note how the head of our list contains the first waiter which was registered, and the
// tail of our list is our most recent waiter.
//
// After "Thread 1" sleeps, "Thread 3" has the opportunity to lock the global mutex.
// In this case, "Thread 3" will notify one waiter of the address 50 using the `cond_var` inside
// `FutexWaiter`, and will also remove it from the linked list. In this case
// the notified thread is "Thread 2":
//
//   Address   │
//             │
// ────────────┼──────────────────────────────────────────────────────────────────────
//             │
//             │       ┌────────────────┐       ┌────────────────┐
//             │       │                │   ┌──►│                │
//             │       │ Thread 2       │   │   │ Thread 1       │
//             │       │ FutexWaiter    │   │   │ FutexWaiter    │
//     50      ├───┐   │                │   │   │                │
//             │   │   │                │   │   │                │
//             │   │   │ cond_var       │   │   │ cond_var       │
//             │   │   │                │   │   │                │
//             │   │   │                │   │   │                │
//             │   │   └────────────────┘   │   └────────────────┘
//             │   │                        │
//             │   └────────────────────────┘
//             │
//
// Then, when the lock is released and "Thread 2" has woken up, it tries to lock the global mutex
// again, checking if it is still part of the linked list, or manually remove itself from the queue
// if that's not the case.
// In this case "Thread 2" has already been notified, which doesn't require any other handling, so it just
// removes the `FutexWaiter` from its stack and returns `AtomicsWaitResult::Ok`.
//
//   Address   │
//             │
// ────────────┼──────────────────────────────────────────────────────────────────────
//             │
//             │                                ┌────────────────┐
//             │    ┌──────────────────────────►│                │
//             │    │                           │ Thread 1       │
//             │    │                           │ FutexWaiter    │
//     50      ├────┘                           │                │
//             │                                │                │
//             │                                │ cond_var       │
//             │                                │ waiting: true  │
//             │                                │                │
//             │                                └────────────────┘
//             │
//             │
//             │
//
// In a future point in time, "Thread 1" will be notified, which will proceed with the
// exact same steps as "Thread 2", emptying the wait queue and finishing the execution of our
// program.

#![deny(unsafe_op_in_unsafe_fn)]
#![deny(clippy::undocumented_unsafe_blocks)]
#![allow(clippy::expl_impl_clone_on_copy)]

use std::{
    cell::Cell,
    fmt, ptr,
    sync::{Arc, atomic::Ordering},
};

use crate::{
    Context, JsNativeError, JsResult, JsValue,
    builtins::{
        array_buffer::{SharedArrayBuffer, utils::SliceRef},
        promise::ResolvingFunctions,
        typed_array::Element,
    },
    job::{NativeAsyncJob, TimeoutJob},
    js_string,
    sys::time::{Duration, Instant},
};

use std::sync::{Condvar, Mutex, MutexGuard};

use boa_string::JsString;
use intrusive_collections::{LinkedList, LinkedListLink, UnsafeRef, intrusive_adapter};
use small_btree::{Entry, SmallBTreeMap};

/// The result of the [`wait`] and [`wait_async`] functions.
#[derive(Debug, Clone, Copy)]
pub(super) enum AtomicsWaitResult {
    NotEqual,
    TimedOut,
    Ok,
}

impl AtomicsWaitResult {
    pub(super) fn to_js_string(self) -> JsString {
        match self {
            AtomicsWaitResult::NotEqual => js_string!("not-equal"),
            AtomicsWaitResult::TimedOut => js_string!("timed-out"),
            AtomicsWaitResult::Ok => js_string!("ok"),
        }
    }
}

/// Data used by async waiters.
#[derive(Debug)]
struct AsyncWaiterData {
    // Only here to ensure the buffer does not get collected before all its
    // waiters.
    _buffer: SharedArrayBuffer,
    // Channel to signals the waiter that it has been timed out or notified.
    sender: oneshot::Sender<AtomicsWaitResult>,
}

/// A waiter for a memory address.
struct FutexWaiter {
    link: LinkedListLink,
    cond_var: Condvar,
    addr: usize,
    async_data: Cell<Option<AsyncWaiterData>>,
}

impl fmt::Debug for FutexWaiter {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("FutexWaiter")
            .field("link", &self.link)
            .field("cond_var", &self.cond_var)
            .field("addr", &self.addr)
            .finish_non_exhaustive()
    }
}

intrusive_adapter!(FutexWaiterAdapter = UnsafeRef<FutexWaiter>: FutexWaiter { link => LinkedListLink });

impl FutexWaiter {
    /// Creates a new `FutexWaiter` that will block the current thread while waiting.
    fn new_sync(addr: usize) -> Self {
        Self {
            link: LinkedListLink::new(),
            cond_var: Condvar::new(),
            addr,
            async_data: Cell::new(None),
        }
    }

    /// Creates a new `FutexWaiter` that will NOT block the current thread while waiting.
    #[allow(
        clippy::arc_with_non_send_sync,
        reason = "across threads we only access the fields that are `Sync`"
    )]
    fn new_async(data: AsyncWaiterData, addr: usize) -> Arc<FutexWaiter> {
        Arc::new(Self {
            link: LinkedListLink::new(),
            cond_var: Condvar::new(),
            addr,
            async_data: Cell::new(Some(data)),
        })
    }
}

/// List of memory addresses and its corresponding list of waiters for that address.
struct FutexWaiters {
    waiters: SmallBTreeMap<usize, LinkedList<FutexWaiterAdapter>, 16>,
}

// SAFETY: `FutexWaiters` is not constructable outside its `get` method, and it's only exposed by
//          a global lock, meaning the inner data of `FutexWaiters` (which includes non-Send pointers)
//          can only be accessed by a single thread at once.
unsafe impl Send for FutexWaiters {}

impl FutexWaiters {
    /// Gets the map of all shared data addresses and its corresponding list of agents waiting on that location.
    fn get() -> JsResult<MutexGuard<'static, Self>> {
        static CRITICAL_SECTION: Mutex<FutexWaiters> = Mutex::new(FutexWaiters {
            waiters: SmallBTreeMap::new(),
        });

        CRITICAL_SECTION.lock().map_err(|_| {
            JsNativeError::typ()
                .with_message("failed to synchronize with the agent cluster")
                .into()
        })
    }

    /// # Safety
    ///
    /// - `node` must NOT be linked to an existing waiter list.
    /// - `node` must always reference a valid instance of `FutexWaiter` until `node` is
    ///   removed from its linked list. This can happen by either `remove_waiter` or `notify_many`.
    unsafe fn add_waiter(&mut self, node: &FutexWaiter) {
        // SAFETY: `node` must point to a valid instance.
        let node = unsafe { UnsafeRef::from_raw(ptr::from_ref(node)) };

        self.waiters
            .entry(node.addr)
            .or_insert_with(|| LinkedList::new(FutexWaiterAdapter::new()))
            .push_back(node);
    }

    /// # Safety
    ///
    /// - `node` must NOT be linked to an existing waiter list.
    unsafe fn add_async_waiter(&mut self, node: Arc<FutexWaiter>) {
        // SAFETY: `node` is not linked by the guarantees of the caller.
        let node = unsafe { UnsafeRef::from_raw(Arc::into_raw(node)) };

        self.waiters
            .entry(node.addr)
            .or_insert_with(|| LinkedList::new(FutexWaiterAdapter::new()))
            .push_back(node);
    }

    /// Notifies at most `max_count` waiters that are waiting on the address `addr`, and
    /// returns the number of waiters that were notified.
    ///
    /// Equivalent to [`RemoveWaiters`][remove] and [`NotifyWaiter`][notify], but in a single operation.
    ///
    /// [remove]: https://tc39.es/ecma262/#sec-removewaiters
    /// [notify]: https://tc39.es/ecma262/#sec-notifywaiter
    fn notify_many(&mut self, addr: usize, max_count: u64) -> u64 {
        let Entry::Occupied(mut wl) = self.waiters.entry(addr) else {
            return 0;
        };

        for i in 0..max_count {
            let Some(elem) = wl.get_mut().pop_front() else {
                wl.remove();
                return i;
            };

            elem.cond_var.notify_one();

            if let Some(async_data) = elem.async_data.take() {
                // SAFETY: All entries on the waiter list must be valid, and all async entries
                // must come from an Arc.
                unsafe { Arc::from_raw(UnsafeRef::into_raw(elem)) };
                // - If the async waiter is still awaiting, this should never fail.
                // - If the async waiter was dropped, the channel is now closed.
                //   We don't need to handle the error since this can only happen
                //   if the async waiter task was dropped, and at that point the
                //   message won't even matter.
                drop(async_data.sender.send(AtomicsWaitResult::Ok));
            }
        }

        if wl.get().is_empty() {
            wl.remove();
        }

        max_count
    }

    /// # Safety
    ///
    /// - `node` must point to a valid instance of `FutexWaiter`.
    /// - `node` must be inside the wait list associated with `node.addr`.
    #[track_caller]
    pub(super) unsafe fn remove_waiter(&mut self, node: &FutexWaiter) {
        debug_assert!(node.link.is_linked());

        let Entry::Occupied(mut wl) = self.waiters.entry(node.addr) else {
            panic!("node was not a valid `FutexWaiter`");
        };

        // SAFETY: `node` must be inside the wait list associated with `node.addr`.
        let node = unsafe {
            let Some(node) = wl
                .get_mut()
                .cursor_mut_from_ptr(ptr::from_ref(node))
                .remove()
            else {
                panic!("node was not a valid `FutexWaiter`")
            };
            node
        };

        if let Some(async_data) = node.async_data.take() {
            // SAFETY: all async entries must be managed by an Arc.
            unsafe {
                Arc::from_raw(UnsafeRef::into_raw(node));
            }
            // - If the async waiter is still awaiting, this should never fail.
            // - If the async waiter was dropped, the channel is now closed.
            //   We don't need to handle the error since this can only happen
            //   if the async waiter task was dropped, and at that point the
            //   message won't even matter.
            drop(async_data.sender.send(AtomicsWaitResult::TimedOut));
        }

        if wl.get().is_empty() {
            wl.remove();
        }
    }
}

/// Adds this agent to the wait queue for the address pointed to by `buffer[offset..]`.
///
/// # Safety
///
/// - `addr` must be a multiple of `std::mem::size_of::<E>()`.
/// - `buffer` must contain at least `std::mem::size_of::<E>()` bytes to read starting from `usize`.
// our implementation guarantees that `SharedArrayBuffer` is always aligned to `u64` at minimum.
pub(super) unsafe fn wait<E: Element + PartialEq>(
    buffer: &SharedArrayBuffer,
    buf_len: usize,
    offset: usize,
    check: E,
    timeout: Option<Duration>,
) -> JsResult<AtomicsWaitResult> {
    // 11. Let block be buffer.[[ArrayBufferData]].
    // 12. Let offset be typedArray.[[ByteOffset]].
    // 13. Let byteIndexInBuffer be (i × 4) + offset.
    let buffer = &buffer.bytes_with_len(buf_len)[offset..];

    // 14. Let WL be GetWaiterList(block, indexedPosition).
    // 18. Perform EnterCriticalSection(WL).
    let mut waiters = FutexWaiters::get()?;

    // 13. Let elementType be TypedArrayElementType(typedArray).
    // 14. Let w be GetValueFromBuffer(buffer, indexedPosition, elementType, true, SeqCst).

    // SAFETY: The safety of this operation is guaranteed by the caller.
    let value = unsafe { E::read(SliceRef::AtomicSlice(buffer)).load(Ordering::SeqCst) };

    // 20. If v ≠ w, then
    // a. Perform LeaveCriticalSection(WL).
    // b. If mode is sync, return "not-equal".
    if check != value {
        return Ok(AtomicsWaitResult::NotEqual);
    }

    // 23. Let now be the time value (UTC) identifying the current time.
    // 24. Let additionalTimeout be an implementation-defined non-negative mathematical value.
    // 25. Let timeoutTime be ℝ(now) + t + additionalTimeout.
    // 26. NOTE: When t is +∞, timeoutTime is also +∞.
    let timeout_time = timeout.map(|to| (Instant::now(), to));

    // 27. Let waiterRecord be a new Waiter Record { [[AgentSignifier]]: thisAgent, [[PromiseCapability]]: promiseCapability, [[TimeoutTime]]: timeoutTime, [[Result]]: "ok" }.
    // ensure we can have aliased pointers to the waiter in a sound way.
    let waiter = FutexWaiter::new_sync(buffer.as_ptr().addr());

    // 28. Perform AddWaiter(WL, waiterRecord).
    // SAFETY: waiter is valid and we call `remove_waiter` below.
    unsafe {
        waiters.add_waiter(&waiter);
    }

    // 18. Let notified be SuspendAgent(WL, W, t).

    // `SuspendAgent(WL, W, t)`
    // https://tc39.es/ecma262/#sec-suspendthisagent

    // In a couple of places here we early return without removing the waiter from
    // the waiters list. This could seem unsound, but in reality all our early
    // returns are because the mutex is poisoned, and if that's the case then
    // no other thread can read the pointer to the waiter, so we can return safely.
    let result = loop {
        if !waiter.link.is_linked() {
            break AtomicsWaitResult::Ok;
        }

        if let Some((start, timeout)) = timeout_time {
            let Some(remaining) = timeout.checked_sub(start.elapsed()) else {
                break AtomicsWaitResult::TimedOut;
            };

            // This doesn't use `wait_timeout_while` because it has to mutably borrow `waiter`,
            // which is a big nono since we have pointers to that location while the borrow is
            // active.
            waiters = waiter
                .cond_var
                .wait_timeout(waiters, remaining)
                .map_err(|_| {
                    JsNativeError::typ()
                        .with_message("failed to synchronize with the agent cluster")
                })?
                .0;
        } else {
            waiters = waiter.cond_var.wait(waiters).map_err(|_| {
                JsNativeError::typ().with_message("failed to synchronize with the agent cluster")
            })?;
        }
    };

    // 19. If notified is true, then
    //     a. Assert: W is not on the list of waiters in WL.
    // 20. Else,
    //     a. Perform RemoveWaiter(WL, W).
    if waiter.link.is_linked() {
        // SAFETY: waiter is valid and contained in its waiter list if it is still linked.
        unsafe {
            waiters.remove_waiter(&waiter);
        }
    }

    // 21. Perform LeaveCriticalSection(WL).
    drop(waiters);

    // 22. If notified is true, return "ok".
    // 23. Return "timed-out".
    Ok(result)
}

/// Adds this agent to the wait queue for the address pointed to by `buffer[offset..]`,
/// without blocking the execution thread.
///
/// # Safety
///
/// - `addr` must be a multiple of `std::mem::size_of::<E>()`.
/// - `buffer` must contain at least `std::mem::size_of::<E>()` bytes to read starting from `usize`.
// our implementation guarantees that `SharedArrayBuffer` is always aligned to `u64` at minimum.
pub(super) unsafe fn wait_async<E: Element + PartialEq>(
    buffer: &SharedArrayBuffer,
    buf_len: usize,
    offset: usize,
    check: E,
    timeout: Option<Duration>,
    functions: ResolvingFunctions,
    context: &mut Context,
) -> JsResult<AtomicsWaitResult> {
    // 11. Let block be buffer.[[ArrayBufferData]].
    // 12. Let offset be typedArray.[[ByteOffset]].
    // 13. Let byteIndexInBuffer be (i × 4) + offset.
    let buf = &buffer.bytes_with_len(buf_len)[offset..];

    // 14. Let WL be GetWaiterList(block, indexedPosition).
    // 17. Perform EnterCriticalSection(WL).
    let mut waiters = FutexWaiters::get()?;

    // 18. Let elementType be TypedArrayElementType(typedArray).
    // 19. Let w be GetValueFromBuffer(buffer, indexedPosition, elementType, true, SeqCst).
    // SAFETY: The safety of this operation is guaranteed by the caller.
    let value = unsafe { E::read(SliceRef::AtomicSlice(buf)).load(Ordering::SeqCst) };

    // 20. If v ≠ w, then
    //     a. Perform LeaveCriticalSection(WL).
    //     b. If mode is sync, return "not-equal".
    if check != value {
        return Ok(AtomicsWaitResult::NotEqual);
    }

    // 21. If t = 0 and mode is async, then
    //     a. NOTE: There is no special handling of synchronous immediate timeouts. Asynchronous immediate
    //        timeouts have special handling in order to fail fast and avoid unnecessary Promise jobs.
    //     b. Perform LeaveCriticalSection(WL).
    if let Some(timeout) = &timeout
        && timeout.is_zero()
    {
        return Ok(AtomicsWaitResult::TimedOut);
    }

    // 23. Let now be the time value (UTC) identifying the current time.
    // 24. Let additionalTimeout be an implementation-defined non-negative mathematical value.
    // 25. Let timeoutTime be ℝ(now) + t + additionalTimeout.
    // 26. NOTE: When t is +∞, timeoutTime is also +∞.
    let (sender, receiver) = oneshot::async_channel();

    // 27. Let waiterRecord be a new Waiter Record { [[AgentSignifier]]: thisAgent,
    //     [[PromiseCapability]]: promiseCapability, [[TimeoutTime]]: timeoutTime, [[Result]]: "ok"}.
    // ensure we can have aliased pointers to the waiter in a sound way.
    let waiter = FutexWaiter::new_async(
        AsyncWaiterData {
            _buffer: buffer.clone(),
            sender,
        },
        buf.as_ptr().addr(),
    );
    let weak_waiter = Arc::downgrade(&waiter);

    // 28. Perform AddWaiter(WL, waiterRecord).
    // SAFETY: `waiter` is pinned to the heap, so it must be valid.
    unsafe {
        waiters.add_async_waiter(waiter.clone());
    }

    // 30. Else if timeoutTime is finite, then
    //     a. Perform EnqueueAtomicsWaitAsyncTimeoutJob(WL, waiterRecord).
    let timeout_cancel = if let Some(timeout) = timeout {
        // EnqueueAtomicsWaitAsyncTimeoutJob ( WL, waiterRecord )
        // https://tc39.es/ecma262/#sec-enqueueatomicswaitasynctimeoutjob

        // 1. Let timeoutJob be a new Job Abstract Closure with no parameters that captures WL and waiterRecord and performs the following steps when called:
        let job = TimeoutJob::with_realm(
            move |_| {
                //    a. Perform EnterCriticalSection(WL).
                let mut waiters = FutexWaiters::get()?;

                //    b. If WL.[[Waiters]] contains waiterRecord, then
                if let Some(waiter) = weak_waiter.upgrade()
                    && waiter.link.is_linked()
                {
                    // i. Let timeOfJobExecution be the time value (UTC) identifying the current time.
                    // ii. Assert: ℝ(timeOfJobExecution) ≥ waiterRecord.[[TimeoutTime]] (ignoring potential non-monotonicity of time values).
                    // iii. Set waiterRecord.[[Result]] to "timed-out".
                    // SAFETY: the node is linked and still valid thanks to the reference count.
                    unsafe {
                        // iv. Perform RemoveWaiter(WL, waiterRecord).
                        waiters.remove_waiter(&waiter);
                    }
                }

                //    c. Perform LeaveCriticalSection(WL).
                //    d. Return unused.
                Ok(JsValue::undefined())
            },
            // 3. Let currentRealm be the current Realm Record.
            context.realm().clone(),
            // 2. Let now be the time value (UTC) identifying the current time.
            timeout,
        );

        let tc = job.cancellation_token().clone();

        // 4. Perform HostEnqueueTimeoutJob(timeoutJob, currentRealm, 𝔽(waiterRecord.[[TimeoutTime]]) - now).
        context.enqueue_job(job.into());

        // 5. Return unused.
        Some(tc)
    } else {
        None
    };

    context.enqueue_job(
        NativeAsyncJob::new(async move |context| {
            if let Ok(result) = receiver.await {
                // v. Perform NotifyWaiter(WL, waiterRecord).
                functions
                    .resolve
                    .call(
                        &JsValue::undefined(),
                        &[result.to_js_string().into()],
                        &mut context.borrow_mut(),
                    )
                    .expect("default resolving functions cannot error");
            } else {
                // The "else" branch can only happen if the channel was dropped in both
                // the timeout job and the whole waiters map, which is only possible if
                // we panicked. We just GIGO then, since it doesn't make sense to
                // resolve a promise in a thread that is panicking.
            }

            if let Some(token) = timeout_cancel {
                token.cancel(&mut context.borrow_mut());
            }

            Ok(JsValue::undefined())
        })
        .into(),
    );

    Ok(AtomicsWaitResult::Ok)
}

/// Notifies at most `count` agents waiting on the memory address pointed to by `buffer[offset..]`.
pub(super) fn notify(buffer: &SharedArrayBuffer, offset: usize, count: u64) -> JsResult<u64> {
    let addr = buffer.as_ptr().addr() + offset;

    // 7. Let WL be GetWaiterList(block, indexedPosition).
    // 8. Perform EnterCriticalSection(WL).
    let mut waiters = FutexWaiters::get()?;

    // 9. Let S be RemoveWaiters(WL, c).
    // 10. For each element W of S, do
    //     a. Perform NotifyWaiter(WL, W).
    let count = waiters.notify_many(addr, count);

    // 11. Perform LeaveCriticalSection(WL).
    drop(waiters);

    Ok(count)
}
