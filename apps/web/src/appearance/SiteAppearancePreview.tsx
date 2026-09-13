import { useEffect, useState, type ReactNode } from 'react';

import { siteAppearanceLayoutSchema, type SiteAppearanceLayout } from '@sergod/contracts';

import {
  appearancePreviewMessageType,
  appearancePreviewReadyType,
  SiteAppearancePreviewContext,
} from './appearance-preview-context.js';

export function SiteAppearancePreviewProvider({ children }: { readonly children: ReactNode }) {
  const previewEnabled =
    new URLSearchParams(window.location.search).get('appearance-preview') === '1';
  const [layout, setLayout] = useState<SiteAppearanceLayout | null>(null);

  useEffect(() => {
    if (!previewEnabled || window.parent === window) return;
    const receive = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      if (!isPreviewMessage(event.data)) return;
      const parsed = siteAppearanceLayoutSchema.safeParse(event.data.layout);
      if (parsed.success) setLayout(parsed.data);
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: appearancePreviewReadyType }, window.location.origin);
    return () => window.removeEventListener('message', receive);
  }, [previewEnabled]);

  return (
    <SiteAppearancePreviewContext.Provider value={layout}>
      {children}
    </SiteAppearancePreviewContext.Provider>
  );
}

function isPreviewMessage(
  value: unknown,
): value is { readonly layout: unknown; readonly type: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === appearancePreviewMessageType &&
    'layout' in value
  );
}
