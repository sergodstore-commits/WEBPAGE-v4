'use client';
import { usePathname } from 'next/navigation';
import StoreApp from './StoreApp';
import AdminApp from './AdminApp';
export default function SiteApp() {
  const pathname = usePathname();
  return pathname.startsWith('/admin') ? <AdminApp /> : <StoreApp />;
}
