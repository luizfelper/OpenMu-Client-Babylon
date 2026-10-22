/** cs text of `versions/shared/ui/windows/inventory`. */

import type en from './en';

export default {
  'inventory.title': 'Inventář',
  'inventory.close': 'Zavřít (I,V)',
  'inventory.repair': 'Opravit (L)',
  'inventory.personalShop': 'Osobní obchod',
  'inventory.expand': 'Otevřít rozšířený inventář (K)',
  'inventory.rearrange': 'Uspořádat inventář',
} satisfies Partial<Record<keyof typeof en, string>>;
