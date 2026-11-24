import { z } from 'zod';

const phone = z.string().max(24).refine(value => value === '' || /^\+?[\d ().-]+$/.test(value), 'Enter a valid mobile number.')
  .refine(value => !value.startsWith('+') || /^91\d{10}$/.test(value.replace(/\D/g, '')), 'Use an Indian mobile number.')
  .transform(value => value.replace(/\D/g, '').replace(/^(0091|91|0)(?=\d{10}$)/, ''))
  .refine(value => value === '' || /^\d{10}$/.test(value), 'Enter a valid Indian mobile number.');
const id = z.string().regex(/^(guest|companion)-[a-f\d-]{36}$/i);
export const customerInput = z.object({
  id, name: z.string().trim().min(1).max(120), phone,
  notes: z.string().max(2000).default(''), contactNote: z.string().max(500).default(''),
  companions: z.array(z.object({ id, name: z.string().trim().min(1).max(120), phone: phone.refine(Boolean), saveToGoogle: z.boolean().optional() })).max(10).default([]),
  revision: z.number().int().nonnegative().optional(), shared: z.boolean().optional(),
});
export const businessInput = z.object({
  name: z.string().trim().min(1).max(120), address: z.string().trim().min(1).max(500),
  phone: z.string().trim().min(1).max(24), gstin: z.string().trim().max(15),
  footer: z.string().max(240), taxRate: z.number().min(0).max(50).multipleOf(.01),
  staffDiscountLimit: z.number().min(0).max(100).multipleOf(.01), contactSync: z.boolean(),
  revision: z.number().int().nonnegative(),
});
