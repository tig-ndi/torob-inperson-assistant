export class ContractError extends Error {
  constructor(message = 'پاسخ سرویس با قرارداد داده سازگار نیست.') { super(message); this.name = 'ContractError'; }
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ContractError();
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 10000): string {
  if (typeof value !== 'string' || value.length > max) throw new ContractError();
  return value;
}
export function identifier(value: unknown): string {
  const result = text(value, 200);
  if (!result || result.trim() !== result || /[\u0000-\u001f]/u.test(result)) throw new ContractError();
  return result;
}
export function nullableText(value: unknown, max = 10000): string | null {
  return value === null ? null : text(value, max);
}
export function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new ContractError();
  return value;
}
export function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new ContractError();
  return value;
}
export function oneOf<const T extends readonly string[]>(value: unknown, choices: T): T[number] {
  if (typeof value !== 'string' || !choices.includes(value)) throw new ContractError();
  return value as T[number];
}
export function list<T>(value: unknown, parse: (item: unknown) => T, max = 1000): T[] {
  if (!Array.isArray(value) || value.length > max) throw new ContractError();
  return value.map(parse);
}
export function money(value: unknown): string | null {
  if (value === null) return null;
  const result = text(value, 19);
  if (!/^[0-9]{1,19}$/.test(result) || BigInt(result) > 9223372036854775807n) throw new ContractError('مبلغ خارج از محدودهٔ معتبر است.');
  return result;
}
export function instant(value: unknown): string {
  const result = text(value, 50);
  if (!/T.*(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(result) || !Number.isFinite(Date.parse(result))) throw new ContractError();
  return result;
}
export function provenance(value: unknown) {
  const source = record(value);
  if (source.currency !== 'toman' || source.inventory_status !== 'unconfirmed') throw new ContractError();
  return { snapshot_id: identifier(source.snapshot_id), dataset: text(source.dataset),
    generated_at_utc: instant(source.generated_at_utc), currency: 'toman' as const, inventory_status: 'unconfirmed' as const };
}
export function pairedCoordinates(lat: unknown, lon: unknown): { lat: number; lon: number } | null {
  if (lat === null && lon === null) return null;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || Math.abs(lat) > 90 ||
      typeof lon !== 'number' || !Number.isFinite(lon) || Math.abs(lon) > 180) throw new ContractError('موقعیت معتبر و کامل لازم است.');
  return { lat, lon };
}
