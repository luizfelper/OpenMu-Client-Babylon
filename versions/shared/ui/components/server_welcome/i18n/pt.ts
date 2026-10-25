/** Portuguese text of the `server_welcome` UI component. */

import type en from './en';

export default {
  'serverWelcome.title': 'Bem-vindo ao {server}',
  'serverWelcome.subtitle': 'Sua jornada começa agora. Veja o que espera por você.',
  'serverWelcome.eyebrow': 'Informações do servidor',
  'serverWelcome.version': 'Versão',
  'serverWelcome.channel': 'Canal',
  'serverWelcome.exp': 'EXP',
  'serverWelcome.drop': 'Drop',
  'serverWelcome.master': 'Master',
  'serverWelcome.loading': 'Lendo as informações do servidor…',
  'serverWelcome.enter': 'Entrar no jogo',
  'serverWelcome.site': 'Site',
  'serverWelcome.discord': 'Discord',
  'serverWelcome.close': 'Fechar',
  'serverWelcome.defaultServer': 'este servidor',
  'serverWelcome.unknown': '—',
} satisfies Partial<Record<keyof typeof en, string>>;
