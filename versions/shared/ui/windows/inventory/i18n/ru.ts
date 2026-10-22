/** Russian text of the `inventory` window. */

import type en from './en';

export default {
  'inventory.title': 'Инвентарь',
  'inventory.close': 'Закрыть (I,V)',
  'inventory.repair': 'Починить (L)',
  'inventory.personalShop': 'Личный магазин',
  'inventory.expand': 'Открыть расширенный инвентарь (K)',
  'inventory.rearrange': 'Упорядочить инвентарь',
} satisfies Partial<Record<keyof typeof en, string>>;
