/** English text of the `server_welcome` UI component. See src/i18n/readme.md. */

const en = {
  'serverWelcome.title': 'Welcome to {server}',
  'serverWelcome.subtitle': 'Your journey begins now. Here is what awaits you.',
  'serverWelcome.eyebrow': 'Server information',
  'serverWelcome.version': 'Version',
  'serverWelcome.channel': 'Channel',
  'serverWelcome.exp': 'EXP',
  'serverWelcome.drop': 'Drop',
  'serverWelcome.master': 'Master',
  'serverWelcome.loading': 'Reading the server information…',
  'serverWelcome.enter': 'Enter the game',
  'serverWelcome.site': 'Website',
  'serverWelcome.discord': 'Discord',
  'serverWelcome.close': 'Close',
  'serverWelcome.defaultServer': 'this server',
  'serverWelcome.unknown': '—',
};

export default en;

declare module '@/i18n' {
  interface TextOwners {
    'versions/shared/ui/components/server_welcome': typeof en;
  }
}
