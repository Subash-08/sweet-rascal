import type { Method } from './demo';

export type HistoryResource = 'bills' | 'sales' | 'refunds' | 'activity' | 'payments';
export type HistorySort = 'newest' | 'oldest' | 'amount-desc' | 'amount-asc' | 'guest';
export type BillStatus = 'Paid' | 'Part refunded' | 'Refunded' | 'Cancelled' | 'Voided';
export type HistoryRow = {
  id: string; date: string; guest: string; kind: 'Dine-in' | 'Parcel';
  time?: string; billId?: string; orderId?: string; at?: string; actor?: string; action?: string; detail?: string;
  total?: number; sales?: number; gst?: number; tip?: number; status?: BillStatus;
  amount?: number; salesAmount?: number; taxAmount?: number; tipAmount?: number;
  method?: Method; reason?: string; cancelled?: boolean; paymentType?: string;
};
export type HistoryResponse = {
  items: HistoryRow[]; next: string | null; previous: string | null; total: number; pageSize: number;
  summary: { sales: number; gst: number; tips: number; amount: number; salesAmount: number; taxAmount: number; tipAmount: number };
  generatedAt: string;
};
export type OverviewResponse = {
  today: string; activeCount: number; upcomingCount: number; billsToday: number; guests: number;
  sales?: number; returnedSales?: number; netSales?: number; tips?: number; averageBill?: number; dineIn?: number; parcel?: number;
  trend: { day: string; amount: number }[]; topDishes: { name: string; quantity: number }[]; recent: HistoryRow[];
};
