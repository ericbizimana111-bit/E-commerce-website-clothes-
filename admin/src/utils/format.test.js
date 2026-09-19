import { describe, expect, it } from 'vitest';
import {
  formatUGX,
  formatDateTime,
  getOrderStatusMeta,
  getDeliveryStatusMeta,
  getPaymentStatusMeta,
  formatRole,
} from './format';

describe('formatUGX (integer UGX, no floating point)', () => {
  it('formats integer amounts with thousands separators', () => {
    expect(formatUGX(25000)).toBe('UGX 25,000');
    expect(formatUGX(1234567)).toBe('UGX 1,234,567');
    expect(formatUGX(0)).toBe('UGX 0');
  });

  it('rounds and never renders decimals', () => {
    expect(formatUGX(25000.4)).toBe('UGX 25,000');
    expect(formatUGX(undefined)).toBe('UGX 0');
    expect(formatUGX(null)).toBe('UGX 0');
  });
});

describe('status metadata maps to semantic tones consistently', () => {
  it('treats terminal-good order statuses as success', () => {
    for (const status of ['COMMITMENT_PAID', 'DELIVERED', 'COMPLETED', 'BALANCE_PAID']) {
      expect(getOrderStatusMeta(status).tone).toBe('success');
    }
  });

  it('treats failed/cancelled order statuses as danger', () => {
    for (const status of ['CANCELLED', 'PAYMENT_FAILED', 'DELIVERY_FAILED']) {
      expect(getOrderStatusMeta(status).tone).toBe('danger');
    }
  });

  it('treats in-flight order statuses as warning/info', () => {
    expect(getOrderStatusMeta('PENDING_PAYMENT').tone).toBe('warning');
    expect(getOrderStatusMeta('PREPARING').tone).toBe('info');
  });

  it('delivery statuses use the delivery map (PICKED_UP is success, not neutral)', () => {
    expect(getDeliveryStatusMeta('PICKED_UP').tone).toBe('success');
    expect(getDeliveryStatusMeta('OUT_FOR_DELIVERY').tone).toBe('warning');
    expect(getDeliveryStatusMeta('FAILED').tone).toBe('danger');
  });

  it('payment statuses: SUCCESS success, FAILED danger, EXPIRED neutral', () => {
    expect(getPaymentStatusMeta('SUCCESS').tone).toBe('success');
    expect(getPaymentStatusMeta('FAILED').tone).toBe('danger');
    expect(getPaymentStatusMeta('EXPIRED').tone).toBe('neutral');
  });

  it('falls back to a neutral tone for unknown statuses', () => {
    expect(getOrderStatusMeta('SOMETHING_NEW').tone).toBe('neutral');
    expect(getOrderStatusMeta(undefined).label).toBe('—');
  });
});

describe('formatRole', () => {
  it('renders readable role labels', () => {
    expect(formatRole('SUPER_ADMIN')).toBe('Super Admin');
    expect(formatRole('ADMIN')).toBe('Administrator');
    expect(formatRole('DISPATCHER')).toBe('Dispatcher');
    expect(formatRole(null)).toBe('—');
  });
});

describe('formatDateTime', () => {
  it('renders an em-dash for missing values', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('')).toBe('—');
  });

  it('renders a parseable date without throwing', () => {
    expect(formatDateTime('2026-09-19T10:30:00.000Z')).toMatch(/2026/);
  });
});
