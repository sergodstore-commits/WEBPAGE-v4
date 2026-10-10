export type EditionCard = {
  id: number;
  name: string;
  englishName: string;
  effects: string[];
  printings: { code: string; rarity: string }[];
  source: string;
  image: string;
  thumbnail: string;
  type: string;
  attribute: string;
  atk: number | null;
  def: number | null;
  level: number | null;
  link: number | null;
};
export type EditionDocument = {
  name: string;
  code: string;
  title: string;
  summary: string;
  body: string;
  updated: string;
  cards: EditionCard[];
};
export type EditionSummary = {
  code: string;
  name: string;
  expected: number;
  release_date: string;
  title: string;
  summary: string;
  body: string;
  total: number;
  ready: number;
  complete: boolean;
  source_complete: boolean;
  last_error: string;
  published: boolean;
};
export type EditionPanel = {
  discoveries: { code: string; name: string; expected: number; release_date: string }[];
  discovered_at: string | null;
  editions: EditionSummary[];
  storage_bytes: number;
  storage_limit: number;
};
