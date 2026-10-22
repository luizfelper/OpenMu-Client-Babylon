/** Polish text of the `inventory` window. */

import type en from './en';

export default {
  'inventory.title': 'Ekwipunek',
  'inventory.close': 'Zamknij (I,V)',
  'inventory.repair': 'Napraw (L)',
  'inventory.personalShop': 'Sklep osobisty',
  'inventory.expand': 'Otwórz rozszerzony ekwipunek (K)',
  'inventory.rearrange': 'Uporządkuj ekwipunek',
} satisfies Partial<Record<keyof typeof en, string>>;
