/** Spanish text of the `character_select` page. */

import type en from './en';

export default {
  'characters.chooseHero': 'Choose your hero',
  'characters.slotCount': '{count} of {total}',
  'characters.emptySlot': 'Empty slot',
  'characters.createCharacter': 'Create character',
  'characters.playHint': 'Enter or double-click to play',
  'characters.menu': 'Menu',
  'characters.create': 'Create',
  'characters.play': 'Play',
  'characters.delete': 'Delete',
  'characters.levelShort': 'LV',
  'characters.loading': 'Cargando personajes...',
  'characters.select': 'Elige un personaje',
  'characters.hint.select': 'Seleccionar',
  'characters.hint.zoomIn': 'Acercar',
  'characters.hint.zoomOut': 'Alejar',
  'class.desc.darkWizard':
    'Reino de los magos, descendiente de Arka. Su condición física es escasa, pero posee un poder enorme y maneja los hechizos de ataque con soltura.',
  'class.desc.darkKnight':
    'Reino de los caballeros, descendiente de Lorencia. Con una fuerza y una esgrima poderosas maneja casi todas las armas cuerpo a cuerpo.',
  'class.desc.elf':
    'Reino de los elfos, descendiente de Noria. Maestro del arco y la flecha, y capaz de lanzar varios hechizos.',
  'class.desc.summoner':
    'Una mente fuerte y una intuición excelente crean el hechizo de maldición más poderoso. También invoca a seres de otro mundo y usa contra ellos su hechicería dañina.',
  'class.desc.rageFighter':
    'Herederos legítimos de los Caballeros Reales de Karutan y artistas marciales de gran fuerza física. También ayudan al grupo con bendiciones de apoyo.',
  'class.desc.magicGladiator':
    'Personaje mixto con rasgos del Dark Knight y del Dark Wizard. Maestro del combate cuerpo a cuerpo y capaz de lanzar hechizos con soltura.',
  'class.desc.darkLord':
    'Personaje carismático que manda tropas y maneja el espíritu oscuro y el caballo oscuro.',
} satisfies Partial<Record<keyof typeof en, string>>;
