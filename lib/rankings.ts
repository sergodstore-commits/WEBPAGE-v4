export const boards = {
  'myl-first-era': { name: 'Primera Era', game: 'Mitos y Leyendas' },
  'myl-first-block': { name: 'Primer Bloque', game: 'Mitos y Leyendas' },
  yugioh: { name: 'Ranking SERGOD STORE', game: 'Yu-Gi-Oh!' },
} as const;
export type RankingBoard = keyof typeof boards;
export type LeagueResult = { player_key: string; name: string; position: number; points: number };
export type LeagueTournament = {
  id: string;
  source: 'tor' | 'file';
  external_id: string;
  board: RankingBoard;
  title: string;
  played_on: string;
  source_url: string;
  round_id: number | null;
  final_round: number | null;
  revision: number;
  updated_at: string;
  players: number;
  included_in_ranking: boolean;
  archived?: boolean;
};
export type LeaguePreview = Omit<
  LeagueTournament,
  'id' | 'updated_at' | 'players' | 'revision' | 'included_in_ranking' | 'archived'
> & {
  id: string;
  expires_at: string;
  results: LeagueResult[];
  base_revision: number;
  warnings: string[];
  file_hash: string | null;
};
export type PlayerContribution = {
  tournament_id: string;
  title: string;
  played_on: string;
  points: number;
  position: number;
};
export type PublicRanking = {
  board: RankingBoard;
  updated_at: string | null;
  rows: {
    position: number;
    name: string;
    tournaments: number;
    points: number;
    contributions?: PlayerContribution[];
  }[];
  tournaments: Pick<
    LeagueTournament,
    'id' | 'title' | 'played_on' | 'source_url' | 'final_round'
  >[];
};
export type TorCandidate = {
  external_id: string;
  title: string;
  board: RankingBoard;
  played_on: string;
  imported: boolean;
  revision: number;
  status: string;
};
