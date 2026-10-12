import type { PlayerContribution, PublicRanking } from '../rankings';

export type RankingCandidate = {
  player_key: string;
  name: string;
  points: number;
  tournaments: number;
  contributions: PlayerContribution[];
};

// Comparing sorted standings with a missing place after every real place is
// equivalent to more firsts, then more seconds, and so on. No dense array up
// to the largest imported position is needed.
function comparePositions(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? Infinity,
      right = b[i] ?? Infinity;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

export function orderLeaguePlayers(
  players: RankingCandidate[],
  includeContributions: boolean,
): PublicRanking['rows'] {
  const prepared = players.map((player) => ({
    player,
    finishes: player.contributions.map((c) => c.position).sort((a, b) => a - b),
    // Imports only provide calendar days, not a reliable order within a day.
    // Same-day results therefore use best standing first, never import time or UUID.
    recent: [...player.contributions]
      .sort((a, b) => b.played_on.localeCompare(a.played_on) || a.position - b.position)
      .map((c) => c.position),
  }));
  const performance = (a: (typeof prepared)[number], b: (typeof prepared)[number]) =>
    b.player.points - a.player.points ||
    comparePositions(a.finishes, b.finishes) ||
    comparePositions(a.recent, b.recent);
  prepared.sort(
    (a, b) =>
      performance(a, b) ||
      (a.player.player_key < b.player.player_key
        ? -1
        : a.player.player_key > b.player.player_key
          ? 1
          : 0),
  );
  return prepared.map((entry, index) => {
    const { player } = entry;
    const provisional =
      (index > 0 && performance(prepared[index - 1], entry) === 0) ||
      (index + 1 < prepared.length && performance(entry, prepared[index + 1]) === 0);
    return {
      position: index + 1,
      name: player.name,
      points: player.points,
      tournaments: player.tournaments,
      ...(provisional ? { provisional: true } : {}),
      ...(includeContributions ? { contributions: player.contributions } : {}),
    };
  });
}
