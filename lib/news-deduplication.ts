import type { WebNewsCandidate, WebNewsItem } from './web-news';

export type NewsIdentity = {
  version: 1;
  title: string;
  words: string[];
  facts: string[];
  cards: string[];
  signature: string;
  truncated: boolean;
};
type Report = Pick<
  WebNewsCandidate,
  'url' | 'title' | 'summary' | 'published_on' | 'format' | 'boards'
> &
  Partial<WebNewsItem>;
const normalize = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const stop = new Set(
  'a an the and or of to in on for from with at by is are be this that these those new news card cards reveal reveals revealed announcing announced first look yugioh yu gi oh tcg ocg www com https http de del la las el los un una unos unas y o en para por con es son esta este estas estos carta cartas nueva nuevas nuevo nuevos noticia noticias revelacion revelaciones imagen image images photo official'.split(
    ' ',
  ),
);
const words = (text: string) =>
  [
    ...new Set(
      normalize(text)
        .replace(/https?:\/\/\S+/g, ' ')
        .match(/[a-z0-9]+/g) || [],
    ),
  ].filter((w) => w.length > 2 && !stop.has(w));
const share = (left: string[], right: string[]) => left.filter((w) => right.includes(w)).length;
// A compact content signature, not an authentication or security hash.
function signature(text: string) {
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}-${text.length}`;
}
export function newsIdentity(item: Report): NewsIdentity {
  if (item.dedupe_identity?.version === 1) return item.dedupe_identity;
  const title = item.original_title || item.title;
  const summary = item.original_summary || item.summary;
  const blocks = item.original_content_blocks || item.content_blocks;
  const body =
    blocks
      ?.filter((b) => b.kind !== 'image')
      .map((b) => b.original_text || b.text)
      .join('\n') ||
    item.body ||
    '';
  const text = normalize(`${summary}\n${body}`)
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const allWords = words(`${summary}\n${body}`);
  const allFacts = [
    ...new Set(
      normalize(`${title}\n${summary}\n${body}`).match(
        /\b[a-z]{2,8}-(?:en|sp|jp|ae)\d{2,3}\b|\b\d+(?:[.,]\d+)*\b/g,
      ) || [],
    ),
  ];
  const allCards = [
    ...new Set(
      (item.media || [])
        .map((m) =>
          normalize(m.name)
            .replace(/[^a-z0-9]+/g, ' ')
            .trim(),
        )
        .filter(
          (n) =>
            n.length > 4 &&
            !/^(?:imagen|image|foto|photo|untitled|unknown|noticia|article|cover|portada|tcg|ocg)(?:\s|$)/.test(
              n,
            ),
        ),
    ),
  ];
  return {
    version: 1,
    title: words(title).join(' ').slice(0, 500),
    words: allWords.slice(0, 300),
    facts: allFacts.slice(0, 80),
    cards: allCards.slice(0, 100),
    signature: text.length >= 60 ? signature(text) : '',
    truncated: allWords.length > 300 || allFacts.length > 80 || allCards.length > 100,
  };
}
function sameGame(a: Report, b: Report) {
  const boards = (r: Report) => r.boards || ['yugioh'];
  const ygoA = boards(a).includes('yugioh'),
    ygoB = boards(b).includes('yugioh');
  return (
    ygoA === ygoB &&
    (ygoA
      ? (a.format || 'TCG') === (b.format || 'TCG')
      : [...boards(a)].sort().join(',') === [...boards(b)].sort().join(','))
  );
}
/** Conservative: an uncertain match remains a separate report, preserving new information. */
export function newsRelationship(a: Report, b: Report): 'duplicate' | 'update' | 'different' {
  if (a.url === b.url) return 'duplicate';
  if (!sameGame(a, b)) return 'different';
  const x = newsIdentity(a),
    y = newsIdentity(b);
  const titlesA = x.title.split(' ').filter(Boolean),
    titlesB = y.title.split(' ').filter(Boolean);
  const common = share(titlesA, titlesB);
  const topic = common >= 2 && common / Math.max(titlesA.length, titlesB.length) >= 0.55;
  const sameCards =
    x.cards.length >= 2 &&
    x.cards.length === y.cards.length &&
    share(x.cards, y.cards) === x.cards.length;
  if (!topic && !sameCards) return 'different';
  const conflictingFacts = share(x.facts, y.facts) !== Math.max(x.facts.length, y.facts.length);
  const conflictingCards =
    x.cards.length > 0 &&
    y.cards.length > 0 &&
    share(x.cards, y.cards) !== Math.max(x.cards.length, y.cards.length);
  if (conflictingFacts || conflictingCards) return 'update';
  if (x.signature && x.signature === y.signature) return 'duplicate';
  if (x.truncated || y.truncated) return 'update';
  const matched = share(x.words, y.words);
  const coverage = matched / Math.max(x.words.length, y.words.length, 1);
  const strongTitle =
    x.title === y.title ||
    (common >= 3 && common / Math.max(titlesA.length, titlesB.length) >= 0.8);
  return matched >= 10 && coverage >= (sameCards ? 0.85 : strongTitle ? 0.9 : 0.96)
    ? 'duplicate'
    : 'update';
}
export function firstNewsReport<T extends Report>(reports: T[]): T {
  return reports
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      // Never invent an hour for sources that only provide a calendar date.
      if (a.item.source_published_at && b.item.source_published_at) {
        const time =
          Date.parse(a.item.source_published_at) - Date.parse(b.item.source_published_at);
        if (Number.isFinite(time) && time) return time;
      }
      const day = a.item.published_on.localeCompare(b.item.published_on);
      if (day) return day;
      return a.index - b.index;
    })[0].item;
}
