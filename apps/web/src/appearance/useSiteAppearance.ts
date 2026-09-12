import { useEffect, useState } from 'react';

import type { SiteAppearanceLayout } from '@sergod/contracts';

import { publicRequest } from '../identity/api.js';
import { defaultAppearanceLayout } from './appearance-model.js';

export function useSiteAppearance(): SiteAppearanceLayout {
  const [layout, setLayout] = useState<SiteAppearanceLayout>(defaultAppearanceLayout);
  useEffect(() => {
    let active = true;
    void publicRequest<{ readonly layout: SiteAppearanceLayout | null }>('/api/v1/site-appearance')
      .then(({ layout: loaded }) => {
        if (active && loaded !== null) setLayout(loaded);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return layout;
}
