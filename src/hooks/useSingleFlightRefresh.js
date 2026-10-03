import { useCallback, useEffect, useRef } from 'react';
import { createSingleFlightRefresh } from '../lib/services/singleFlightRefresh.js';

// task must be memoized by its actual authorization/entity dependencies.
// Keep the gate across scope changes: an old request cannot overlap a new one.
export function useSingleFlightRefresh(task) {
  const gate = useRef(null);
  if (!gate.current) gate.current = createSingleFlightRefresh();
  useEffect(() => gate.current.activate(), [task]);
  return useCallback(() => gate.current.run(task), [task]);
}
