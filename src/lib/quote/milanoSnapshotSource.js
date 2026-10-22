// Bundled "Milano intera" snapshot, validated once at load. The eager glob keeps
// the build working if the JSON file is removed (then MILANO_SNAPSHOT is null
// and the pages use the live request).
import { validateMilanoSnapshot } from './milanoSnapshot.js';

// import.meta.glob exists only under Vite; outside it (node tests) there is no snapshot.
let FILES = {};
try {
  FILES = import.meta.glob('./milanoWholeCitySnapshot.json', { eager: true, import: 'default' });
} catch {
  FILES = {};
}
export const MILANO_SNAPSHOT = validateMilanoSnapshot(FILES['./milanoWholeCitySnapshot.json']);
