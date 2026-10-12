import { fail } from './core';
import type { WebNewsBlock } from '../web-news';
export { newsContentBody as contentBody } from '../web-news';
import { newsContentBody as contentBody } from '../web-news';

export function newsText(html: string) {
  const entities: Record<string, string> = {
    amp: '&',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    lt: '<',
    gt: '>',
    aacute: 'á',
    eacute: 'é',
    iacute: 'í',
    oacute: 'ó',
    uacute: 'ú',
    ntilde: 'ñ',
    ndash: '–',
    mdash: '—',
    hellip: '…',
    lsquo: '‘',
    rsquo: '’',
    ldquo: '“',
    rdquo: '”',
  };
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, key: string) => {
      if (!key.startsWith('#')) {
        const value = entities[key.toLowerCase()];
        return value && key[0] === key[0].toUpperCase() ? value.toUpperCase() : value || all;
      }
      const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export type NewsNode = {
  name?: string;
  content?: string;
  attrs?: Record<string, unknown>;
  children?: NewsNode[];
};

// A bounded tokenizer for source HTML only. We never insert the source HTML into React.
export function newsHtmlTree(html: string): NewsNode[] {
  const root: NewsNode = { children: [] };
  const stack = [root];
  const safe = html.replace(
    /<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi,
    '',
  );
  let count = 0;
  for (const token of safe.matchAll(/<[^>]*>|[^<]+/g)) {
    if (++count > 50000)
      fail(409, 'El artículo supera la estructura admitida; no se importó parcialmente.');
    const value = token[0];
    if (!value.startsWith('<')) {
      stack.at(-1)!.children!.push({ content: value });
      continue;
    }
    const closing = value.match(/^<\/([\w-]+)/);
    if (closing) {
      const index = stack.findLastIndex((n) => n.name === closing[1].toLowerCase());
      if (index > 0) stack.length = index;
      continue;
    }
    const opening = value.match(/^<([\w-]+)/);
    if (!opening) continue;
    const name = opening[1].toLowerCase();
    if (['p', 'li', 'tr'].includes(name) && stack.at(-1)?.name === name) stack.pop();
    const attrs = Object.fromEntries(
      [...value.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gs)].map((a) => [
        a[1].toLowerCase(),
        newsText(a[3]),
      ]),
    );
    const node: NewsNode = { name, attrs, children: [] };
    stack.at(-1)!.children!.push(node);
    if (
      !/\/$/.test(value.slice(0, -1)) &&
      !['img', 'br', 'hr', 'input', 'source', 'wbr', 'meta', 'link'].includes(name)
    )
      stack.push(node);
    if (stack.length > 60) fail(409, 'El artículo supera la profundidad admitida.');
  }
  return root.children!;
}

// Remove greetings and invitation-only paragraphs, never a technical paragraph that contains facts.
export function editorialText(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      const promotional =
        /^(?:¡?(?:hola|bienvenidos|saludos)|nos vemos|hasta (?:la próxima|pronto)|larga vida|ya va quedando menos|check out|stay tuned|let us know|join (?:our|the)|thanks for|escrito por|let the great|immortal phoenix returns|marik.s monsters aren.t|sit down for|feel the thrill|avoid getting lost)/i.test(
          sentence,
        );
      const factual =
        /\d|copias?|prohibid|limitad|vigencia|coste|cementerio|mazo|habilidad|efecto|descart|desterr|roba|daño|invoca|summon|effect|draw|release|launch|january|february|march|april|may|june|july|august|september|october|november|december/i.test(
          sentence,
        );
      return !promotional || factual;
    })
    .join(' ')
    .replace(
      /^(?:Watch your opponent.s plans go up in smoke|Step into a reimagined version|Sit down for some toasted apples|Feel the thrill of the hunt as your pack grows|Avoid getting lost by learning the forest.s secrets)[^!]*!\s*/i,
      '',
    )
    .trim();
}

export function extractNewsBlocks(
  nodes: NewsNode[],
  resolveImage: (raw: string) => string | null,
  components: Record<string, any> = {},
): WebNewsBlock[] {
  const blocks: WebNewsBlock[] = [];
  let heading = '';
  const inline = (node: NewsNode, depth = 0): string => {
    if (depth > 60) fail(409, 'El artículo supera la profundidad admitida.');
    if (node.name === 'br') return '\n';
    if (
      node.name === 'a' &&
      typeof node.attrs?.href === 'string' &&
      /^https:\/\//.test(node.attrs.href) &&
      /\.pdf(?:$|[?#])/i.test(node.attrs.href)
    )
      return `${(node.children || []).map((n) => inline(n, depth + 1)).join('')} (${node.attrs.href})`;
    if (node.name === 'component') {
      const c = components[String(node.attrs?.id)];
      return c?.props?.card?.name || c?.props?.name || '';
    }
    return node.content ?? (node.children || []).map((n) => inline(n, depth + 1)).join('');
  };
  const clean = (text: string) => text.split('\n').map(newsText).filter(Boolean).join('\n');
  const image = (raw: unknown, name: unknown) => {
    if (!raw) return;
    const source = typeof raw === 'string' ? resolveImage(raw) : null;
    if (!source)
      fail(409, 'El artículo incluye imágenes de una fuente no admitida. El borrador se conserva.');
    blocks.push({
      kind: 'image',
      source,
      text:
        typeof name === 'string' && name.trim()
          ? newsText(name)
          : heading || 'Imagen de la noticia',
    });
  };
  const walk = (values: NewsNode[], depth = 0) => {
    if (depth > 60) fail(409, 'El artículo supera la profundidad admitida.');
    for (const n of values) {
      if (n.name === 'img') {
        image(n.attrs?.['data-src'] || n.attrs?.src, n.attrs?.alt);
        continue;
      }
      if (n.name === 'component') {
        const c = components[String(n.attrs?.id)];
        if (c?.type === 'CardContainer') {
          for (const v of c.props?.cards || []) {
            if (!/^[a-f0-9]{24}$/.test(v.card?._id || ''))
              fail(409, 'No pudimos verificar una carta del artículo.');
            image(`/cards/${v.card._id}_w420.webp`, v.card.name);
          }
        } else if (['Image', 'CardImage'].includes(c?.type))
          image(c.props?.src, c.props?.alt || c.props?.name);
        continue;
      }
      if (/^h[1-6]$/.test(n.name || '')) {
        heading = clean(inline(n));
        if (heading) blocks.push({ kind: 'heading', text: heading });
      } else if (['p', 'li', 'figcaption', 'tr'].includes(n.name || '')) {
        const text = editorialText(
          clean(
            n.name === 'tr'
              ? (n.children || [])
                  .filter((c) => ['td', 'th'].includes(c.name || ''))
                  .map((c) => inline(c))
                  .join(' | ')
              : inline(n),
          ),
        );
        if (text)
          blocks.push({ kind: n.name === 'li' || n.name === 'tr' ? 'list' : 'paragraph', text });
        // Images nested in paragraphs still belong at this position.
        const nested = (children: NewsNode[]) =>
          children.forEach((c) => {
            if (c.name === 'img' || c.name === 'component') walk([c], depth + 1);
            else nested(c.children || []);
          });
        nested(n.children || []);
      } else walk(n.children || [], depth + 1);
    }
  };
  walk(nodes);
  if (blocks.length > 400 || contentBody(blocks).length > 60000)
    fail(409, 'El contenido supera el límite admitido. No se guardó una noticia recortada.');
  return blocks;
}
