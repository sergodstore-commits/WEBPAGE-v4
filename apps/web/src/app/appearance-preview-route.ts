import type { Route } from './App.js';

export function routeWithAppearancePreview(next: Route, search: string): string {
  return new URLSearchParams(search).get('appearance-preview') === '1'
    ? `${next}?appearance-preview=1`
    : next;
}
