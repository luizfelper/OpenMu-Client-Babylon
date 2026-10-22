/** German text of the `inventory` window. */

import type en from './en';

export default {
  'inventory.title': 'Inventar',
  'inventory.close': 'Schließen (I,V)',
  'inventory.repair': 'Reparieren (L)',
  'inventory.personalShop': 'Eigener Laden',
  'inventory.expand': 'Erweitertes Inventar öffnen (K)',
  'inventory.rearrange': 'Inventar neu ordnen',
} satisfies Partial<Record<keyof typeof en, string>>;
