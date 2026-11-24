import type { Page } from './demo';

export const pagePaths: Record<Page, string> = {
  Overview: '/overview', 'Dining tables': '/dining-tables', Orders: '/orders',
  'Billing desk': '/billing-desk', Bills: '/bills', Payments: '/payments',
  Customers: '/customers', Menu: '/menu', Reports: '/reports', Activity: '/activity',
  'Staff & access': '/staff-access', Settings: '/settings', 'My profile': '/my-profile',
};
export const pageAtPath = (path: string): Page =>
  (Object.keys(pagePaths) as Page[]).find(page => pagePaths[page] === path.replace(/\/$/, '')) ?? 'Overview';
