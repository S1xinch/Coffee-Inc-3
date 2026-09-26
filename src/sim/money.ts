export type Cents = number;

export function assertCents(value: number, context: string): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${context}: ${value} is not a safe integer amount of cents`);
  }
  return value;
}

export const dollars = (d: number): Cents => Math.round(d * 100);

export const scaleCents = (c: Cents, factor: number): Cents => Math.round(c * factor);

const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMoney(c: Cents, withCents = false): string {
  const abs = Math.abs(c) / 100;
  const body = withCents ? exact.format(abs) : whole.format(Math.round(abs));
  return `${c < 0 ? '-' : ''}$${body}`;
}
