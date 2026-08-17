import { PaymentStatus } from './types/paystack.types';

export const MPESA_CURRENCY = 'KES';

export const DEFAULT_DISPLAY_TEXT = 'Please complete authorization process on your mobile phone';

export function mapPaystackStatus(status: string): PaymentStatus {
  if (status === 'success') {
    return PaymentStatus.SUCCESS;
  }
  if (status === 'failed') {
    return PaymentStatus.FAILED;
  }
  return PaymentStatus.PENDING;
}

export function convertAmountToSubunit(amount: number): number {
  return Math.round(amount * 100);
}

export function convertAmountFromSubunit(amount: number): number {
  return amount / 100;
}

export function normalizeKenyanPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('254')) {
    return `+${digits}`;
  }
  if (digits.startsWith('0')) {
    return `+254${digits.slice(1)}`;
  }
  return `+${digits}`;
}
