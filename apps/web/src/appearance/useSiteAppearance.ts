import { useContext, useEffect, useState } from 'react';

import { siteAppearanceLayoutSchema, type SiteAppearanceLayout } from '@sergod/contracts';

import { publicRequest } from '../identity/api.js';
import { defaultAppearanceLayout } from './appearance-model.js';
import { SiteAppearancePreviewContext } from './appearance-preview-context.js';

export function useSiteAppearance(): SiteAppearanceLayout {
  const preview = useContext(SiteAppearancePreviewContext);
  const [layout, setLayout] = useState<SiteAppearanceLayout>(defaultAppearanceLayout);
  useEffect(() => {
    let active = true;
    void publicRequest<{ readonly layout?: unknown }>('/api/v1/site-appearance')
      .then(({ layout: loaded }) => {
        if (!active || loaded === null || loaded === undefined) return;
        const parsed = siteAppearanceLayoutSchema.safeParse(loaded);
        if (parsed.success) setLayout(parsed.data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return preview ?? layout;
}
