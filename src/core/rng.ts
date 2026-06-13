/**
 * Детерминированный ГПСЧ (mulberry32). Всё состояние — одно 32-битное число,
 * сериализуется вместе с состоянием игры.
 */
export class Rng {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** целое в [min, max] включительно */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** бросок n костей d-гранных + бонус */
  dice(n: number, d: number, plus: number): number {
    let sum = plus;
    for (let i = 0; i < n; i++) sum += this.int(1, d);
    return sum;
  }

  /** проверка процентного шанса */
  chance(percent: number): boolean {
    return this.next() * 100 < percent;
  }

  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
}

/** seed из строки (например, из URL) */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
