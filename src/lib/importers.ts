export type Platform = "chesscom" | "lichess";

export type GameSummary = {
  id: string;
  platform: Platform;
  pgn: string;
  white: string;
  black: string;
  whiteElo?: number;
  blackElo?: number;
  userColor: "w" | "b";
  result: "win" | "loss" | "draw";
  speed: string;
  date: number; // ms
};

export type PlayerMeta = { whiteAvatar?: string; blackAvatar?: string; platform?: Platform };

function speedFromSeconds(base: number, inc: number) {
  const t = base + inc * 40;
  if (t < 180) return "bullet";
  if (t < 480) return "blitz";
  if (t < 1500) return "rapid";
  return "classical";
}

export async function fetchChessCom(username: string, max = 15): Promise<GameSummary[]> {
  const u = username.trim().toLowerCase();
  const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(u)}/games/archives`);
  if (res.status === 404) throw new Error(`Chess.com user "${username}" not found.`);
  if (!res.ok) throw new Error("Chess.com is unavailable right now. Try again shortly.");
  const { archives } = (await res.json()) as { archives: string[] };
  const games: GameSummary[] = [];
  for (const url of [...archives].reverse()) {
    if (games.length >= max) break;
    const r = await fetch(url);
    if (!r.ok) continue;
    const data = (await r.json()) as { games: any[] };
    for (const g of [...data.games].reverse()) {
      if (!g.pgn || g.rules !== "chess") continue;
      const isWhite = g.white.username.toLowerCase() === u;
      const mine = isWhite ? g.white.result : g.black.result;
      const result = mine === "win" ? "win" : ["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"].includes(mine) ? "draw" : "loss";
      games.push({
        id: g.uuid ?? g.url,
        platform: "chesscom",
        pgn: g.pgn,
        white: g.white.username,
        black: g.black.username,
        whiteElo: g.white.rating,
        blackElo: g.black.rating,
        userColor: isWhite ? "w" : "b",
        result,
        speed: g.time_class ?? "rapid",
        date: (g.end_time ?? 0) * 1000,
      });
      if (games.length >= max) break;
    }
  }
  if (!games.length) throw new Error("No recent standard games found for this user.");
  return games;
}

export async function fetchLichess(username: string, max = 15): Promise<GameSummary[]> {
  const u = username.trim();
  const res = await fetch(
    `https://lichess.org/api/games/user/${encodeURIComponent(u)}?max=${max}&pgnInJson=true&opening=true`,
    { headers: { Accept: "application/x-ndjson" } },
  );
  if (res.status === 404) throw new Error(`Lichess user "${username}" not found.`);
  if (res.status === 429) throw new Error("Lichess is rate-limiting requests. Wait a minute and retry.");
  if (!res.ok) throw new Error("Lichess is unavailable right now. Try again shortly.");
  const text = await res.text();
  const games = text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((g) => g.variant === "standard" && g.pgn)
    .map((g): GameSummary => {
      const wName = g.players.white.user?.name ?? "Anonymous";
      const isWhite = wName.toLowerCase() === u.toLowerCase();
      const result = !g.winner ? "draw" : (g.winner === "white") === isWhite ? "win" : "loss";
      return {
        id: g.id,
        platform: "lichess",
        pgn: g.pgn,
        white: wName,
        black: g.players.black.user?.name ?? "Anonymous",
        whiteElo: g.players.white.rating,
        blackElo: g.players.black.rating,
        userColor: isWhite ? "w" : "b",
        result,
        speed: g.speed ?? (g.clock ? speedFromSeconds(g.clock.initial, g.clock.increment) : "correspondence"),
        date: g.createdAt,
      };
    });
  if (!games.length) throw new Error("No recent standard games found for this user.");
  return games;
}

export async function fetchChessComAvatars(white: string, black: string): Promise<PlayerMeta> {
  const get = async (n: string) => {
    try {
      const r = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(n.toLowerCase())}`);
      return r.ok ? ((await r.json()).avatar as string | undefined) : undefined;
    } catch {
      return undefined;
    }
  };
  const [whiteAvatar, blackAvatar] = await Promise.all([get(white), get(black)]);
  return { whiteAvatar, blackAvatar, platform: "chesscom" };
}
