import { useEffect } from 'react';
import { driverDiag } from './driverDiagnostics.js';

// TEMP diagnostics (BUG D): records mount/unmount of a named driver component.
// `name` must be a lowercase enum (e.g. 'assignment_page'); no-op when off.
export function useDiagLifecycle(name) {
  useEffect(() => {
    driverDiag.record('PAGE_LIFECYCLE', 'mount', { key: name });
    return () => driverDiag.record('PAGE_LIFECYCLE', 'unmount', { key: name });
  }, [name]);
}
