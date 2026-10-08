export type NewsAsset = { type: 'image' | 'video'; url: string; poster: string };
// Only canonical public post links can become an embedded frame.
export function instagramEmbedUrl(value: string) {
  try {
    const u = new URL(value);
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.port ||
      !['instagram.com', 'www.instagram.com'].includes(u.hostname) ||
      !/^\/(p|reel)\/[\w-]+\/?$/.test(u.pathname)
    )
      return null;
    return `https://www.instagram.com${u.pathname.replace(/\/$/, '')}/embed/`;
  } catch {
    return null;
  }
}
export type NewsItem = {
  id: string;
  caption: string;
  recorded_at: string;
  assets: NewsAsset[];
  permalink: string;
  username: string;
  source: 'instagram' | 'manual';
  media_type?: string;
  thumbnail?: string;
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
