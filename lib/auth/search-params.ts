/** searchParams の値は string | string[] | undefined で届く。単一の文字列へ寄せる */
export function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
