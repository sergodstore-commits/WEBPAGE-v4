const idPattern = /^[A-Za-z0-9_-]{11}$/;
export function youtubeVideoId(value: string): string | null {
  const text = value.trim();
  if (idPattern.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    let id: string | null = null;
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else if (/^\/(live|embed|shorts)\//.test(url.pathname)) id = url.pathname.split('/')[2];
    }
    return id && idPattern.test(id) ? id : null;
  } catch {
    return null;
  }
}
export function youtubeWatchUrl(id: string) {
  return `https://www.youtube.com/watch?v=${id}`;
}
