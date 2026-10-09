import { expect, type Page } from '@playwright/test';

/** Check CSS text against the composite surface, excluding artwork and disabled controls. */
export async function expectReadable(page: Page) {
  const failures = await page.locator('.store-main').evaluate((root) => {
    const rgba = (value: string) => {
      const numbers = value.match(/[\d.]+/g)?.map(Number) || [0, 0, 0];
      return [...numbers.slice(0, 3), numbers[3] ?? 1];
    };
    const blend = (front: number[], back: number[]) =>
      front.slice(0, 3).map((channel, i) => channel * front[3] + back[i] * (1 - front[3]));
    const luminance = (rgb: number[]) => {
      const channels = rgb.slice(0, 3).map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const problems: { text: string; contrast: number; required: number; color: string }[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent?.trim();
      const element = node.parentElement;
      if (
        !text ||
        !element ||
        element.closest('svg, option, script, style, [disabled], [aria-hidden=true]')
      )
        continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if (![...range.getClientRects()].some((rect) => rect.width > 1 && rect.height > 1)) continue;
      const ancestors: Element[] = [];
      let hidden = false;
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        ancestors.unshift(ancestor);
        const style = getComputedStyle(ancestor);
        if (Number(style.opacity) < 0.95 || style.visibility === 'hidden') hidden = true;
      }
      if (hidden) continue;
      let background = [255, 255, 255];
      for (const ancestor of ancestors)
        background = blend(rgba(getComputedStyle(ancestor).backgroundColor), background);
      const style = getComputedStyle(element);
      const foreground = blend(rgba(style.color), background);
      const luminances = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
      const contrast = (luminances[1] + 0.05) / (luminances[0] + 0.05);
      const large =
        parseFloat(style.fontSize) >= 24 ||
        (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
      const required = large ? 3 : 4.5;
      if (contrast + 0.05 < required)
        problems.push({
          text: text.slice(0, 90),
          contrast: Math.round(contrast * 100) / 100,
          required,
          color: style.color,
        });
    }
    return problems;
  });
  expect(failures, `Textos con contraste insuficiente en ${page.url()}`).toEqual([]);
}
