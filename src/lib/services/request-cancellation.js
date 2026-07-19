export function createAbortError(message = 'Request aborted') {
  if (typeof DOMException === 'function') return new DOMException(message, 'AbortError');
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
}

export function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  throw isAbortError(signal.reason) ? signal.reason : createAbortError();
}

export function createTimeoutSignal(parentSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;

  const abortFromParent = () => {
    if (!controller.signal.aborted) controller.abort(createAbortError());
  };

  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });

  const timeoutId = setTimeout(() => {
    timedOut = true;
    if (!controller.signal.aborted) controller.abort(createAbortError('Request timed out'));
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup() {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
  };
}

export function beginLatestRequest(latestRequestRef) {
  const requestId = ++latestRequestRef.current;
  const controller = new AbortController();
  return {
    requestId,
    controller,
    signal: controller.signal,
    isCurrent: () => requestId === latestRequestRef.current,
  };
}
