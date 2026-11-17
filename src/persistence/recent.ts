import { idbGet, idbSet } from "./idb";

export type MapLocation = { type: "vault"; fileName: string } | { type: "local"; backupKey: string };

export interface RecentMapEntry {
  /** "vault:<fileName>" または "local:<slug>" */
  id: string;
  projectName: string;
  updatedAt: string;
  location: MapLocation;
}

const RECENT_KEY = "recentMaps";
const MAX_ENTRIES = 50;

export async function getRecentMaps(): Promise<RecentMapEntry[]> {
  return (await idbGet<RecentMapEntry[]>(RECENT_KEY)) ?? [];
}

export async function upsertRecentMap(entry: RecentMapEntry): Promise<void> {
  const list = await getRecentMaps();
  const next = [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, MAX_ENTRIES);
  await idbSet(RECENT_KEY, next);
}
