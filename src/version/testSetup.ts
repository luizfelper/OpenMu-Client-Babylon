// Vitest setup: tests import app modules without app/main.tsx, so give them the
// same boot contract - the default version's core resolved first. UI is not
// loaded; nothing renders version UI under node.
import { beforeEach } from 'vitest';
import { FIDELITY_DEFAULT, setFidelityChoice } from '@/controllers/fidelity';
import { DEFAULT_VERSION_ID } from '@versions/registry';
import { loadGameVersion } from './index';

// The settings controller pushes the stored choice into the fidelity map at import, and a fresh
// install now runs Classic with a few improvements on (`DEFAULTS.fidelityOverrides`). Every test
// starts from the controller's own default (Enhanced, every improvement on) instead of inheriting
// the install default through whichever module pulled settings in; a test that wants Classic or a
// single improvement sets it itself.
beforeEach(() => setFidelityChoice(FIDELITY_DEFAULT, {}));

// The client starts in the system language; tests expect English on every machine.
Object.defineProperty(globalThis.navigator, 'language', { value: 'en-US', configurable: true });
Object.defineProperty(globalThis.navigator, 'languages', { value: ['en-US'], configurable: true });

await loadGameVersion(DEFAULT_VERSION_ID);
// The shared maps, as boot.tsx hands them to the maps controller in the app.
await import('@versions/shared/maps/all');
