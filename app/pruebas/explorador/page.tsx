import type { Metadata } from 'next';
import ExplorerTrial from './trial';

export const metadata: Metadata = {
  title: 'Prueba · Explorador de ediciones',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ExplorerTrial />;
}
