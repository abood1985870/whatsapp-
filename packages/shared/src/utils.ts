export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  return phone.slice(0, 3) + "****" + phone.slice(-3);
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^0/, "");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTruthy<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
