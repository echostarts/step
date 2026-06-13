import { beforeEach, describe, expect, it } from 'vitest';
import { EnemyAI } from '../src/game/ai';
import { Battle } from '../src/game/combat';
import { MAPS } from '../src/data/maps';
import { ENEMIES, SQUAD } from '../src/data/units';
import { makeUnit, maxAp, resetUnitSeq } from '../src/game/unit';
import type { UnitState, Vec2 } from '../src/game/types';

// тестовый полигон 12×7: бочка в центре, стена справа
MAPS['arena'] = {
  id: 'arena',
  nameKey: 'arena',
  rows: [
    '############',
    '#..........#'.slice(0, 12),
    '#....b.....#'.slice(0, 12),
    '#..........#'.slice(0, 12),
    '#....#.....#'.slice(0, 12),
    '#..........#'.slice(0, 12),
    '############',
  ],
  playerSpawns: [],
};

function spawn(defId: string, pos: Vec2, side?: 'player' | 'enemy'): UnitState {
  const tplBase =
    side === 'player' || SQUAD.some((s) => s.defId === defId)
      ? SQUAD.find((s) => s.defId === defId)!
      : ENEMIES[defId];
  const u = makeUnit(tplBase);
  u.pos = { ...pos };
  return u;
}

function freshBattle(units: UnitState[], seed = 42): Battle {
  const b = Battle.create('arena', units, seed);
  b.begin();
  return b;
}

beforeEach(() => resetUnitSeq());

describe('Шанс попадания', () => {
  it('бочка между стрелком и целью даёт −20 (полуукрытие)', () => {
    const shooter = spawn('vdova', { x: 1, y: 2 });
    const target = spawn('ghul', { x: 6, y: 2 }); // бочка на 5,2... в карте b на x=5,y=2
    const b = freshBattle([shooter, target]);
    const pre = b.hitPreview(shooter, target, 'light');
    expect(pre.cover).toBe('half');
    expect(pre.parts.find((p) => p.key === 'acc.cover')!.val).toBe(-20);
  });

  it('атака с фланга снимает укрытие', () => {
    const shooter = spawn('vdova', { x: 6, y: 1 }); // сверху, бочка слева от цели не мешает
    const target = spawn('ghul', { x: 6, y: 2 });
    const b = freshBattle([shooter, target]);
    const pre = b.hitPreview(shooter, target, 'light');
    expect(pre.cover).toBe('none');
  });

  it('вплотную укрытие не работает', () => {
    const knife = spawn('knizhnitsa', { x: 4, y: 2 });
    const target = spawn('ghul', { x: 6, y: 2 });
    knife.pos = { x: 5, y: 1 }; // вплотную по диагонали? нет: ставим рядом
    knife.pos = { x: 6, y: 1 };
    const b = freshBattle([knife, target]);
    const pre = b.hitPreview(knife, target, 'light');
    expect(pre.parts.find((p) => p.key === 'acc.cover')).toBeUndefined();
  });

  it('дальше оптимала — штраф за дистанцию', () => {
    const shooter = spawn('vdova', { x: 1, y: 1 });
    const target = spawn('ghul', { x: 1 + 11, y: 1 }); // 11 > optimal 9
    MAPS['long'] = {
      id: 'long',
      nameKey: 'long',
      rows: ['##############', '#............#', '##############'],
      playerSpawns: [],
    };
    const b = Battle.create('long', [shooter, target], 1);
    b.begin();
    const pre = b.hitPreview(shooter, target, 'light');
    const dpart = pre.parts.find((p) => p.key === 'acc.dist');
    expect(dpart).toBeDefined();
    expect(dpart!.val).toBe(-8); // 11 клеток при оптимале 9: −4 за каждую лишнюю
  });

  it('шанс зажат в [5, 95]', () => {
    const shooter = spawn('vdova', { x: 1, y: 1 });
    shooter.stats.dex = 10;
    const target = spawn('ghul', { x: 2, y: 1 });
    target.stats.dex = 1;
    const b = freshBattle([shooter, target]);
    const pre = b.hitPreview(shooter, target, 'light');
    expect(pre.chance).toBeLessThanOrEqual(95);
    expect(pre.chance).toBeGreaterThanOrEqual(5);
  });

  it('Хладнокровие: первая атака по целому врагу = 100%', () => {
    const k = spawn('kolodnik', { x: 5, y: 3 });
    k.perks.push('cold_blood');
    const target = spawn('ghul', { x: 6, y: 3 });
    const b = freshBattle([k, target]);
    const pre = b.hitPreview(k, target, 'light');
    expect(pre.chance).toBe(100);
  });
});

describe('Бой', () => {
  it('инициатива по Ловкости, игрок первым при равенстве', () => {
    const a = spawn('vdova', { x: 1, y: 1 }); // dex 8
    const g = spawn('ghul', { x: 9, y: 5 }); // dex 4
    const k = spawn('kolodnik', { x: 1, y: 3 }); // dex 4
    const b = freshBattle([g, k, a]);
    expect(b.state.order[0]).toBe(a.id);
    expect(b.state.order[1]).toBe(k.id); // игрок раньше упыря при dex 4 = 4
    expect(b.state.order[2]).toBe(g.id);
  });

  it('движение тратит 1 ОД за клетку', () => {
    const a = spawn('vdova', { x: 1, y: 1 });
    const g = spawn('ghul', { x: 10, y: 5 });
    const b = freshBattle([a, g]);
    const ap0 = a.ap;
    b.perform({ type: 'move', to: { x: 3, y: 1 } });
    expect(a.ap).toBe(ap0 - 2);
    expect(a.pos).toEqual({ x: 3, y: 1 });
  });

  it('пас копит до +2 ОД на следующий ход', () => {
    const a = spawn('vdova', { x: 1, y: 1 });
    const g = spawn('ghul', { x: 10, y: 5 });
    const b = freshBattle([a, g]);
    b.perform({ type: 'pass' }); // у Вдовы полный ОД, банк = 2
    // ход упыря — пасуем за него
    b.perform({ type: 'pass' });
    expect(b.activeUnit()!.id).toBe(a.id);
    expect(a.ap).toBe(maxAp(a) + 2);
  });

  it('атака без ОД невозможна', () => {
    const k = spawn('kolodnik', { x: 5, y: 3 });
    const g = spawn('ghul', { x: 6, y: 3 });
    const b = freshBattle([k, g]);
    k.ap = 1;
    expect(b.canAttack(k, g, 'light')).toBe('hud.noAp');
  });

  it('арбалет требует перезарядки после выстрела', () => {
    const a = spawn('vdova', { x: 1, y: 1 });
    const g = spawn('ghul', { x: 5, y: 1 });
    const far = spawn('ghul', { x: 10, y: 5 }); // чтобы бой не закончился с одного болта
    const b = freshBattle([a, g, far]);
    expect(a.loaded).toBe(1);
    b.perform({ type: 'attack', target: g.id, mode: 'light' });
    expect(a.loaded).toBe(0);
    expect(b.canAttack(a, g, 'light')).toBe('hud.needReload');
    const bolts0 = b.countAmmo(a, 'bolts');
    b.perform({ type: 'reload' });
    expect(a.loaded).toBe(1);
    expect(b.countAmmo(a, 'bolts')).toBe(bolts0 - 1);
  });

  it('детерминизм: одинаковый сид — одинаковый результат', () => {
    const run = (seed: number) => {
      resetUnitSeq();
      const units = [
        spawn('kolodnik', { x: 1, y: 1 }),
        spawn('vdova', { x: 1, y: 3 }),
        spawn('ghul', { x: 9, y: 1 }),
        spawn('ghul', { x: 9, y: 4 }),
      ];
      const b = Battle.create('arena', units, seed);
      b.begin();
      const ai = new EnemyAI();
      let guard = 200;
      while (!b.state.result && guard-- > 0) {
        const u = b.activeUnit();
        if (!u) break;
        if (u.side === 'enemy') ai.takeTurn(b, u);
        else {
          // игрок: простая политика — атаковать ближайшего или идти
          const enemy = b.state.units.find((x) => x.side === 'enemy' && !x.down);
          if (!enemy) break;
          if (!b.canAttack(u, enemy, 'light')) b.perform({ type: 'attack', target: enemy.id, mode: 'light' });
          else b.perform({ type: 'pass' });
        }
      }
      return JSON.stringify([b.state.result, b.state.units.map((u) => [u.hp, u.pos])]);
    };
    expect(run(123)).toBe(run(123));
    expect(run(123)).not.toBe(run(987)); // другой сид — другая история (почти наверняка)
  });

  it('победа фиксируется, опыт начислен', () => {
    const k = spawn('kolodnik', { x: 5, y: 3 });
    k.stats.str = 10;
    const g = spawn('ghul', { x: 6, y: 3 });
    g.hp = 1;
    const b = freshBattle([k, g]);
    // бьём до результата (детерминированный rng, шанс высокий)
    let guard = 10;
    while (!b.state.result && guard-- > 0) {
      if (b.activeUnit()?.id !== k.id) b.endTurn();
      else if (k.ap >= 3) b.perform({ type: 'attack', target: g.id, mode: 'light' });
      else b.perform({ type: 'pass' });
    }
    expect(b.state.result).toBe('victory');
    expect(b.state.xpAwarded).toBeGreaterThanOrEqual(30);
  });

  it('игрок при 0 HP — без сознания, не мёртв; все легли — поражение', () => {
    const k = spawn('knizhnitsa', { x: 5, y: 3 });
    k.hp = 1;
    const g = spawn('ghul_brute', { x: 6, y: 3 });
    const b = freshBattle([k, g]);
    // упырь сильный, книжница хрупкая: применяем урон напрямую
    const ev: never[] = [];
    b.applyDamage(k, 10, g, ev as never);
    expect(k.down).toBe(true);
    expect(k.hp).toBe(0);
    b.endTurn();
    expect(b.state.result).toBe('defeat');
  });

  it('Мародёр: добивание в ближнем возвращает 3 ОД', () => {
    const k = spawn('kolodnik', { x: 5, y: 3 });
    k.perks.push('marauder', 'cold_blood'); // гарантируем попадание
    k.stats.str = 10;
    const g = spawn('ghul', { x: 6, y: 3 });
    g.hp = 1;
    const other = spawn('ghul', { x: 10, y: 5 });
    const b = freshBattle([k, g, other]);
    const ap0 = k.ap;
    b.perform({ type: 'attack', target: g.id, mode: 'light' });
    expect(g.down).toBe(true);
    expect(k.ap).toBe(ap0 - 3 + 3);
  });

  it('Стена щитов: рядом с союзником-носителем оба в полуукрытии', () => {
    const k = spawn('kolodnik', { x: 5, y: 3 });
    k.perks.push('shield_wall');
    const a = spawn('vdova', { x: 5, y: 2 }); // нет: 5,2 бочка? b на 5,2 — займём 4,3
    a.pos = { x: 4, y: 3 };
    const g = spawn('ghul', { x: 9, y: 3 });
    const b = freshBattle([k, a, g]);
    expect(b.coverAgainst(g.pos, a).cover).toBe('half');
    expect(b.coverAgainst(g.pos, k).cover).toBe('half');
  });

  it('алхимический огонь: 3×3, поджигает клетки на 2 хода', () => {
    const r = spawn('rasstriga', { x: 1, y: 1 });
    const g1 = spawn('ghul', { x: 8, y: 2 });
    const g2 = spawn('ghul', { x: 8, y: 3 });
    const b = freshBattle([r, g1, g2]);
    const ev = b.perform({ type: 'attackArea', at: { x: 8, y: 3 } });
    const aoe = ev.find((e) => e.type === 'aoeFire');
    expect(aoe).toBeDefined();
    expect(b.state.fire.length).toBeGreaterThanOrEqual(6);
    expect(b.state.fire[0].turns).toBe(2);
    expect(g1.statuses.some((s) => s.kind === 'burn') || g1.down).toBe(true);
  });
});
