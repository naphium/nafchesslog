import type { Platform } from "./importers";

const USERS = "ncl:recentUsers";
const LAST = "ncl:lastPgn";

export type RecentUser = { platform: Platform; username: string };

export function getRecentUsers(): RecentUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS) ?? "[]");
  } catch {
    return [];
  }
}

export function addRecentUser(u: RecentUser): RecentUser[] {
  const list = [u, ...getRecentUsers().filter((x) => !(x.platform === u.platform && x.username.toLowerCase() === u.username.toLowerCase()))].slice(0, 5);
  localStorage.setItem(USERS, JSON.stringify(list));
  return list;
}

export function getLastPgn(): string | null {
  return localStorage.getItem(LAST);
}

export function setLastPgn(pgn: string) {
  localStorage.setItem(LAST, pgn);
}
