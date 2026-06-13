import { RU } from '../data/strings';

const dicts: Record<string, Record<string, string>> = { ru: RU };
let locale = 'ru';

export function setLocale(l: string): void {
  if (dicts[l]) locale = l;
}

/** перевод по ключу; {0},{1}… — подстановки */
export function t(key: string, ...args: (string | number)[]): string {
  let s = dicts[locale][key];
  if (s === undefined) return key;
  for (let i = 0; i < args.length; i++) s = s.replaceAll('{' + i + '}', String(args[i]));
  return s;
}

export function hasKey(key: string): boolean {
  return dicts[locale][key] !== undefined;
}
