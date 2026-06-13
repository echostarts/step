import * as THREE from 'three';
import type { UnitState, WeaponDef } from '../game/types';
import { itemDef } from '../data/items';
import { ENEMIES, NPCS, SQUAD } from '../data/units';
import { applyPalette, assets, PALETTES } from './assets';
import { CELL, cellToWorld } from './scene';
import { makeGlowTexture } from './mapview';

/** имена клипов KayKit; выбор по подстрокам с запасными вариантами */
const CLIP = {
  idle: ['Idle'],
  walk: ['Walking_A', 'Walking_B', 'Running_A'],
  run: ['Running_A', 'Walking_A'],
  melee1h: ['1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Chop', 'Unarmed_Melee_Attack_Punch_A'],
  melee1hHeavy: ['1H_Melee_Attack_Chop', '2H_Melee_Attack_Chop', 'Unarmed_Melee_Attack_Punch_B'],
  melee2h: ['2H_Melee_Attack_Stab', '2H_Melee_Attack_Chop'],
  melee2hHeavy: ['2H_Melee_Attack_Spin', '2H_Melee_Attack_Chop'],
  unarmed: ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_B'],
  shoot: ['2H_Ranged_Shoot', '1H_Ranged_Shoot'],
  reload: ['2H_Ranged_Reload', '1H_Ranged_Reload', 'Use_Item'],
  throw: ['Throw'],
  hit: ['Hit_A', 'Hit_B'],
  death: ['Death_A'],
  downed: ['Death_B', 'Death_A'],
  useItem: ['Use_Item', 'PickUp'],
  spawn: ['Spawn_Ground', 'Idle'],
  cheer: ['Cheer', 'Idle'],
};

function templateFor(u: UnitState) {
  return SQUAD.find((s) => s.defId === u.defId) ?? ENEMIES[u.defId] ?? NPCS[u.defId];
}

/**
 * Визуал юнита: модель KayKit + AnimationMixer + видимая экипировка
 * (оружие в handslot.r, смена меняет меш в руке).
 */
export class UnitView {
  root = new THREE.Group();
  mixer: THREE.AnimationMixer | null = null;
  private clips: THREE.AnimationClip[] = [];
  private current: THREE.AnimationAction | null = null;
  private handR: THREE.Object3D | null = null;
  private handL: THREE.Object3D | null = null;
  private weaponMesh: THREE.Object3D | null = null;
  private selectRing: THREE.Mesh;
  private model: THREE.Group | null = null;
  isSkeleton = false;
  /** мировая позиция «головы» для лейблов */
  headY = 2.6;

  constructor(public unit: UnitState) {
    this.selectRing = makeRing(unit.side === 'player' ? 0x86c5ff : 0xd8634f);
    this.selectRing.visible = false;
    this.root.add(this.selectRing);
    const p = cellToWorld(unit.pos.x, unit.pos.y);
    this.root.position.copy(p);
  }

  async load(): Promise<void> {
    const tpl = templateFor(this.unit);
    this.isSkeleton = tpl.model.startsWith('Skeleton');
    const ch = await assets.character(tpl.model);
    this.model = ch.scene;
    this.clips = ch.clips;
    if (tpl.scale) this.model.scale.setScalar(tpl.scale);
    applyPalette(this.model, tpl.palette);
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false; // скелетная анимация двигает кости — куллинг врёт
      }
      if (o.name === 'handslot.r' || o.name === 'handSlotRight') this.handR = o;
      if (o.name === 'handslot.l' || o.name === 'handSlotLeft') this.handL = o;
    });
    // скрыть встроенные пропсы паков (мечи/щиты, приклеенные к рукам в GLB)
    this.hideBuiltinProps();
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    await this.equipWeapon(this.unit.weaponId);
    // эмиссивное свечение глаз настоятеля
    const pal = PALETTES[tpl.palette];
    if (pal?.emissive) this.addEyeGlow(pal.emissive, (pal.emissiveIntensity ?? 0.3) * 2);
    this.play('idle', true);
    this.mixer.update(Math.random() * 2); // рассинхронизировать idle
  }

  private hideBuiltinProps(): void {
    if (!this.model) return;
    const names = ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '2H_Sword', '1H_Sword', 'Mug', 'Spellbook', 'spellbook'];
    this.model.traverse((o) => {
      if (names.some((n) => o.name === n || o.name.startsWith(n))) o.visible = false;
    });
  }

  private addEyeGlow(color: number, intensity: number): void {
    const tex = makeGlowTexture();
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        color,
        transparent: true,
        opacity: Math.min(0.85, intensity),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    s.scale.setScalar(1.4);
    s.position.y = 2.0;
    this.root.add(s);
  }

  /** сменить меш в руке под текущее оружие */
  async equipWeapon(weaponId: string): Promise<void> {
    if (this.weaponMesh) {
      this.weaponMesh.removeFromParent();
      this.weaponMesh = null;
    }
    const def = itemDef(weaponId) as WeaponDef;
    if (!def.model) return;
    let key = def.model;
    // скелеты держат своё оружие, чтобы не было стилевого разнобоя
    if (this.isSkeleton && key === 'sword_1handed') key = 'skeleton_blade';
    const mesh = await assets.weapon(key);
    if (!mesh || !this.handR) return;
    mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });
    this.handR.add(mesh);
    this.weaponMesh = mesh;
  }

  /** проиграть клип; resolve по окончании (для одноразовых) */
  play(kind: keyof typeof CLIP, loop = false, fade = 0.18): Promise<void> {
    if (!this.mixer || !this.clips.length) return Promise.resolve();
    const names = CLIP[kind];
    let clip: THREE.AnimationClip | undefined;
    for (const n of names) {
      clip = this.clips.find((c) => c.name === n);
      if (clip) break;
    }
    if (!clip) return Promise.resolve();
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.loop = loop ? THREE.LoopRepeat : THREE.LoopOnce;
    action.clampWhenFinished = !loop;
    if (this.current && this.current !== action) {
      this.current.crossFadeTo(action, fade, false);
    }
    action.play();
    const prev = this.current;
    this.current = action;
    if (prev && prev !== action) {
      // отпустить предыдущий после фейда
      setTimeout(() => prev.stop(), fade * 1000 + 60);
    }
    if (loop) return Promise.resolve();
    return new Promise((resolve) => {
      const onDone = (e: { action: THREE.AnimationAction }) => {
        if (e.action === action) {
          this.mixer!.removeEventListener('finished', onDone);
          resolve();
        }
      };
      this.mixer!.addEventListener('finished', onDone);
      // страховка от пропавшего события
      setTimeout(resolve, clip.duration * 1000 + 400);
    });
  }

  setSelected(sel: boolean): void {
    this.selectRing.visible = sel;
  }

  faceTowards(x: number, y: number): void {
    const dx = x * CELL - this.root.position.x;
    const dz = y * CELL - this.root.position.z;
    if (Math.abs(dx) + Math.abs(dz) < 0.01) return;
    this.root.rotation.y = Math.atan2(dx, dz);
  }

  setCell(x: number, y: number): void {
    const p = cellToWorld(x, y);
    this.root.position.set(p.x, 0, p.z);
  }

  /** плавное перемещение по пути; скорость в клетках/сек */
  async walkPath(path: { x: number; y: number }[], speed = 5): Promise<void> {
    this.play(path.length > 3 ? 'run' : 'walk', true);
    for (const step of path) {
      const from = this.root.position.clone();
      const to = cellToWorld(step.x, step.y);
      const dur = 1 / speed;
      this.faceTowards(step.x, step.y);
      await tween(dur, (t) => {
        this.root.position.lerpVectors(from, to, t);
      });
    }
    this.play('idle', true);
  }

  update(dt: number): void {
    this.mixer?.update(dt);
    if (this.selectRing.visible) this.selectRing.rotation.z += dt * 0.6;
  }
}

function makeRing(color: number): THREE.Mesh {
  const geo = new THREE.RingGeometry(0.72, 0.85, 40);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.07;
  return m;
}

export function tween(duration: number, fn: (t: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / (duration * 1000));
      fn(t);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}
