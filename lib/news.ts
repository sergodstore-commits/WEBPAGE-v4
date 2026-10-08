export type NewsAsset = { type: 'image' | 'video'; url: string; poster: string };
export type NewsItem = {
  id: string;
  caption: string;
  recorded_at: string;
  assets: NewsAsset[];
  permalink: string;
  username: string;
  source: 'instagram' | 'manual';
  tournament_id: string | null;
  league_tournament_id: string | null;
  ranking_board: string | null;
  status?: 'draft' | 'published' | 'withdrawn';
  media_id?: string;
  legacy_slug?: string;
  title?: string;
};
export type InstagramCandidate = {
  preview_id: string;
  media_id: string;
  caption: string;
  recorded_at: string;
  assets: NewsAsset[];
  permalink: string;
  media_type: string;
  expires_at: string;
};
export type InstagramStatus = {
  login_mode?: 'instagram' | 'facebook';
  configured: boolean;
  connected: boolean;
  username: string;
  expires_at: string | null;
  expired: boolean;
  hashtag: string;
  callback_url: string;
};
