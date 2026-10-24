// The warp list players can use from the site. The client reads this from
// Data/Local/Eng/MoveReq_eng.bmd, but the services image does not ship Data/,
// so the entries are kept here. `serverIndex` is the value OpenMU's warp list
// expects; it differs from the client file for Vulcanus (42 -> 37).
export type WarpMap = {
  id: string;
  name: string;
  level: number;
  zen: number;
  /** OpenMU's GameMapDefinition.Number, used only to name the current map. */
  map: number;
  /** The index sent in WarpCommandRequestPacket. */
  serverIndex: number;
};

export const WARP_MAPS: readonly WarpMap[] = [
  { id: 'arena', name: 'Arena', level: 50, zen: 2000, map: 6, serverIndex: 1 },
  { id: 'lorencia', name: 'Lorencia', level: 10, zen: 2000, map: 0, serverIndex: 2 },
  { id: 'noria', name: 'Noria', level: 10, zen: 2000, map: 3, serverIndex: 3 },
  { id: 'elveland', name: 'Elveland', level: 10, zen: 2000, map: 51, serverIndex: 31 },
  { id: 'elveland2', name: 'Elveland 2', level: 10, zen: 2500, map: 51, serverIndex: 32 },
  { id: 'elveland3', name: 'Elveland 3', level: 10, zen: 3000, map: 51, serverIndex: 43 },
  { id: 'devias', name: 'Devias', level: 20, zen: 2000, map: 2, serverIndex: 4 },
  { id: 'devias2', name: 'Devias 2', level: 20, zen: 2500, map: 2, serverIndex: 5 },
  { id: 'devias3', name: 'Devias 3', level: 20, zen: 3000, map: 2, serverIndex: 6 },
  { id: 'devias4', name: 'Devias 4', level: 20, zen: 3500, map: 2, serverIndex: 7 },
  { id: 'dungeon', name: 'Dungeon', level: 30, zen: 3000, map: 1, serverIndex: 8 },
  { id: 'dungeon2', name: 'Dungeon 2', level: 40, zen: 3500, map: 1, serverIndex: 9 },
  { id: 'dungeon3', name: 'Dungeon 3', level: 50, zen: 4000, map: 1, serverIndex: 10 },
  { id: 'atlans', name: 'Atlans', level: 70, zen: 4000, map: 7, serverIndex: 11 },
  { id: 'atlans2', name: 'Atlans 2', level: 80, zen: 4500, map: 7, serverIndex: 12 },
  { id: 'atlans3', name: 'Atlans 3', level: 90, zen: 5000, map: 7, serverIndex: 13 },
  { id: 'losttower', name: 'Lost Tower', level: 50, zen: 5000, map: 4, serverIndex: 14 },
  { id: 'losttower2', name: 'Lost Tower 2', level: 50, zen: 5500, map: 4, serverIndex: 15 },
  { id: 'losttower3', name: 'Lost Tower 3', level: 50, zen: 6000, map: 4, serverIndex: 16 },
  { id: 'losttower4', name: 'Lost Tower 4', level: 60, zen: 6500, map: 4, serverIndex: 17 },
  { id: 'losttower5', name: 'Lost Tower 5', level: 60, zen: 7000, map: 4, serverIndex: 18 },
  { id: 'losttower6', name: 'Lost Tower 6', level: 70, zen: 7500, map: 4, serverIndex: 19 },
  { id: 'losttower7', name: 'Lost Tower 7', level: 70, zen: 8000, map: 4, serverIndex: 20 },
  { id: 'tarkan', name: 'Tarkan', level: 140, zen: 8000, map: 8, serverIndex: 21 },
  { id: 'tarkan2', name: 'Tarkan 2', level: 140, zen: 8500, map: 8, serverIndex: 22 },
  { id: 'aida1', name: 'Aida 1', level: 150, zen: 8500, map: 33, serverIndex: 25 },
  { id: 'aida2', name: 'Aida 2', level: 150, zen: 8500, map: 33, serverIndex: 27 },
  { id: 'icarus', name: 'Icarus', level: 170, zen: 10000, map: 10, serverIndex: 23 },
  { id: 'kanturu-ruins1', name: 'Kanturu Ruins 1', level: 160, zen: 9000, map: 37, serverIndex: 28 },
  { id: 'kanturu-ruins2', name: 'Kanturu Ruins 2', level: 160, zen: 9000, map: 37, serverIndex: 29 },
  { id: 'kanturu-ruins3', name: 'Kanturu Ruins 3', level: 160, zen: 15000, map: 38, serverIndex: 45 },
  { id: 'kanturu-relics', name: 'Kanturu Relics', level: 230, zen: 12000, map: 39, serverIndex: 30 },
  { id: 'karutan1', name: 'Karutan 1', level: 170, zen: 13000, map: 80, serverIndex: 46 },
  { id: 'karutan2', name: 'Karutan 2', level: 170, zen: 14000, map: 81, serverIndex: 47 },
  { id: 'lacleon', name: 'La Cleon', level: 280, zen: 15000, map: 57, serverIndex: 34 },
  { id: 'peace-swamp', name: 'Peace Swamp', level: 400, zen: 15000, map: 56, serverIndex: 33 },
  { id: 'vulcanus', name: 'Vulcanus', level: 30, zen: 15000, map: 63, serverIndex: 37 },
];

const BY_ID = new Map(WARP_MAPS.map(map => [map.id, map]));

export function findWarpMap(id: string): WarpMap | null {
  return BY_ID.get(String(id).trim().toLowerCase()) ?? null;
}

/** The public shape: no server index, which is an implementation detail. */
export function publicWarpMaps(): Omit<WarpMap, 'serverIndex'>[] {
  return WARP_MAPS.map(map => ({
    id: map.id,
    name: map.name,
    level: map.level,
    zen: map.zen,
    map: map.map,
  }));
}
