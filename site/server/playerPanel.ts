// The logged-in player's panel: VIP state, live character state and the real
// map-change action. Authorization is decided here, on the server, not by the
// browser hiding a button.
import { mapName } from '../../src/modules/gm/gmMaps';
import { className, heroStateName } from '../../src/controllers/net/protocols/adminProtocol';
import { BurstLimit } from '../../src/core/rateLimit';
import { HttpError } from './http';
import { findWarpMap, publicWarpMaps } from './maps';
import { listNews } from './news';
import { panelAllowed } from './panelRules';
import { profileFor } from './players';
import { onlinePlayers, playerGameState, warpPlayer } from './presence';
import { getRankings } from './rankings';
import { publicSite, userPanelVipOnly } from './settings';
import { pushAccountToGame, vipHistory, vipStatus } from './vip';

const warpAttempts = new BurstLimit(6, 60_000);

function formatZen(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

export async function playerPanel(account: string): Promise<Record<string, unknown>> {
  const vip = vipStatus(account);
  // A paid plan reaches the game from here too: a sync that failed after a payment is retried
  // the next time the player opens the panel.
  pushAccountToGame(account);
  const vipOnly = userPanelVipOnly();
  const allowed = panelAllowed(vip.active, vipOnly);
  const game = await playerGameState(account);

  return {
    account,
    vip,
    vip_history: vipHistory(account),
    panel: {
      vip_only: vipOnly,
      allowed,
      message: allowed
        ? 'Você pode trocar de mapa pelo site enquanto estiver no jogo.'
        : 'A troca de mapa pelo site é exclusiva para jogadores com VIP ativo.',
    },
    game: {
      ...game,
      map_name: game.map === null ? '' : mapName(game.map),
      class_name: game.cls === null ? '' : className(game.cls),
      hero_state_name: game.online ? heroStateName(game.heroState) : '',
    },
    maps: publicWarpMaps(),
  };
}

/** The dedicated /painel page: the site's public information plus this account's own panel. */
export async function panelPage(account: string): Promise<Record<string, unknown>> {
  const site = publicSite();
  const [panel, rankings, online, news] = await Promise.all([
    playerPanel(account),
    getRankings(),
    onlinePlayers(),
    listNews({ publishedOnly: true, limit: 4 }),
  ]);
  const [local, domain] = (profileFor(account)?.email || '').split('@');
  return {
    ...panel,
    profile: { email_hint: domain ? `${local.slice(0, 2)}••••@${domain}` : '' },
    site,
    news,
    rankings,
    online,
    generatedAt: Date.now(),
  };
}

export async function changePlayerMap(
  account: string,
  body: unknown
): Promise<Record<string, unknown>> {
  const root = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const mapId = typeof root.map === 'string' ? root.map.trim().toLowerCase() : '';
  if (!mapId) throw new HttpError(400, 'Escolha um mapa.');

  const destination = findWarpMap(mapId);
  if (!destination) throw new HttpError(400, 'Mapa inválido.');

  const vip = vipStatus(account);
  if (!panelAllowed(vip.active, userPanelVipOnly())) {
    throw new HttpError(403, 'A troca de mapa pelo site é exclusiva para jogadores com VIP ativo.');
  }

  if (warpAttempts.hammering(account.toLowerCase())) {
    throw new HttpError(429, 'Muitas tentativas de troca de mapa. Aguarde um minuto.');
  }

  const game = await playerGameState(account);
  if (!game.available) {
    throw new HttpError(
      503,
      'Não foi possível consultar o personagem agora. Tente novamente em alguns segundos.'
    );
  }
  if (!game.online || !game.inWorld) {
    throw new HttpError(409, 'Entre no jogo com um personagem para trocar de mapa.');
  }
  if (game.level < destination.level) {
    throw new HttpError(
      400,
      `${destination.name} exige nível ${destination.level}. Seu personagem está no nível ${game.level}.`
    );
  }
  if (game.money < destination.zen) {
    throw new HttpError(
      400,
      `${destination.name} custa ${formatZen(destination.zen)} zen. Você tem ${formatZen(game.money)}.`
    );
  }

  const result = await warpPlayer(account, destination.serverIndex);
  if (!result.ok) {
    throw new HttpError(
      409,
      'O jogo não aceitou a troca de mapa agora. Verifique se o personagem está livre e tente novamente.'
    );
  }

  return {
    ok: true,
    map: {
      id: destination.id,
      name: destination.name,
      level: destination.level,
      zen: destination.zen,
    },
    message: `Pedido enviado para ${destination.name}. Aguarde a mudança no jogo.`,
  };
}
