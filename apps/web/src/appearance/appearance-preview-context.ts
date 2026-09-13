import { createContext } from 'react';

import type { SiteAppearanceLayout } from '@sergod/contracts';

export const SiteAppearancePreviewContext = createContext<SiteAppearanceLayout | null>(null);
export const appearancePreviewMessageType = 'SERGOD_APPEARANCE_PREVIEW';
export const appearancePreviewReadyType = 'SERGOD_APPEARANCE_PREVIEW_READY';
