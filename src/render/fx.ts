import * as THREE from 'three';
import type { Vec2 } from '../game/types';
import { makeGlowTexture } from './mapview';
import { CELL, cellToWorld, type IsoScene } from './scene';
import { tween } from './unitview';

/**
 * Эффекты: огонь на клетках (частицы + эмиссивная декаль + свет),
 * снаряды, вспышки попаданий, плавающие числа урона (HTML).
 */

interface FireFx {
  key: string;
  group: THREE.Group;
  parts: THREE.Sprite[];
  light: THREE.PointLight;
  seed: number;
}

export class Fx {
  private fires = new Map<string, FireFx>();
  private labels: HTMLDivElement;
  private camera: THREE.Camera;
  private scene: THREE.Scene;

  constructor(iso: IsoScene, labelLayer: HTMLDivElement) {
    this.scene = iso.scene;
    this.camera = iso.camera;
    this.labels = labelLayer;
  }

  // ---------- Огонь ----------

  igniteCells(cells: Vec2[]): void {
    for (const c of cells) this.igniteCell(c);
  }

  private igniteCell(c: Vec2): void {
    const key = c.x + ',' + c.y;
    if (this.fires.has(key)) return;
    const group = new THREE.Group();
    const pos = cellToWorld(c.x, c.y);
    group.position.copy(pos);
    // выжженная декаль с эмиссивным свечением
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(CELL * 0.95, CELL * 0.95),
      new THREE.MeshBasicMaterial({
        color: 0xff5a1f,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.y = 0.09;
    group.add(decal);
    // частицы пламени
    const tex = makeGlowTexture();
    const parts: THREE.Sprite[] = [];
    for (let i = 0; i < 11; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          color: i % 3 === 0 ? 0xffcc44 : 0xff6622,
          transparent: true,
          opacity: 0.8,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      s.position.set((Math.random() - 0.5) * 1.4, Math.random() * 0.5, (Math.random() - 0.5) * 1.4);
      s.scale.setScalar(0.4 + Math.random() * 0.5);
      parts.push(s);
      group.add(s);
    }
    const light = new THREE.PointLight(0xff7733, 5, 8, 2);
    light.position.y = 1;
    group.add(light);
    this.scene.add(group);
    this.fires.set(key, { key, group, parts, light, seed: Math.random() * 10 });
  }

  extinguish(cells: Vec2[]): void {
    for (const c of cells) {
      const key = c.x + ',' + c.y;
      const f = this.fires.get(key);
      if (f) {
        f.group.removeFromParent();
        this.fires.delete(key);
      }
    }
  }

  clearAllFires(): void {
    for (const f of this.fires.values()) f.group.removeFromParent();
    this.fires.clear();
  }

  // ---------- Снаряды ----------

  async projectile(from: THREE.Vector3, to: THREE.Vector3, kind: 'bolt' | 'knife'): Promise<void> {
    const geo =
      kind === 'bolt'
        ? new THREE.BoxGeometry(0.06, 0.06, 0.55)
        : new THREE.BoxGeometry(0.05, 0.02, 0.3);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xd9cba8 }));
    mesh.position.copy(from);
    mesh.lookAt(to);
    this.scene.add(mesh);
    const dist = from.distanceTo(to);
    await tween(Math.min(0.4, dist / 40 + 0.08), (t) => {
      mesh.position.lerpVectors(from, to, t);
      if (kind === 'knife') mesh.rotation.x += 0.5;
    });
    mesh.removeFromParent();
    geo.dispose();
  }

  /** лоб бомбы по дуге */
  async lob(from: THREE.Vector3, to: THREE.Vector3): Promise<void> {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x39424e, roughness: 0.6 }),
    );
    this.scene.add(mesh);
    await tween(0.55, (t) => {
      mesh.position.lerpVectors(from, to, t);
      mesh.position.y += Math.sin(t * Math.PI) * 3.2;
    });
    mesh.removeFromParent();
  }

  /** вспышка взрыва */
  async explosion(at: Vec2): Promise<void> {
    const pos = cellToWorld(at.x, at.y);
    pos.y = 0.8;
    const tex = makeGlowTexture();
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        color: 0xffaa44,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    s.position.copy(pos);
    this.scene.add(s);
    const light = new THREE.PointLight(0xffbb66, 30, 14, 2);
    light.position.copy(pos);
    this.scene.add(light);
    await tween(0.35, (t) => {
      s.scale.setScalar(1 + t * 7);
      (s.material as THREE.SpriteMaterial).opacity = 1 - t;
      light.intensity = 30 * (1 - t);
    });
    s.removeFromParent();
    light.removeFromParent();
  }

  /** короткая вспышка попадания на юните */
  async hitFlash(at: THREE.Vector3): Promise<void> {
    const tex = makeGlowTexture();
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        color: 0xffe2c4,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    s.position.copy(at).add(new THREE.Vector3(0, 1.4, 0));
    s.scale.setScalar(1);
    this.scene.add(s);
    await tween(0.22, (t) => {
      s.scale.setScalar(1 + t * 1.6);
      (s.material as THREE.SpriteMaterial).opacity = 0.9 * (1 - t);
    });
    s.removeFromParent();
  }

  // ---------- Плавающие надписи ----------

  floatText(world: THREE.Vector3, text: string, cls: string): void {
    const div = document.createElement('div');
    div.className = 'float-label ' + cls;
    div.textContent = text;
    this.labels.appendChild(div);
    const start = performance.now();
    const animate = () => {
      const t = (performance.now() - start) / 1300;
      if (t >= 1) {
        div.remove();
        return;
      }
      const p = world.clone();
      p.y += 2.6 + t * 1.4;
      p.project(this.camera);
      div.style.left = ((p.x + 1) / 2) * window.innerWidth + 'px';
      div.style.top = ((1 - p.y) / 2) * window.innerHeight + 'px';
      div.style.opacity = String(t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
      requestAnimationFrame(animate);
    };
    animate();
  }

  update(time: number): void {
    for (const f of this.fires.values()) {
      f.light.intensity = 4.2 + Math.sin(time * 11 + f.seed) * 1.4;
      f.parts.forEach((p, i) => {
        const ph = f.seed + i;
        p.position.y = 0.25 + ((time * (0.6 + (i % 4) * 0.18) + ph) % 1) * 1.3;
        const lif = 1 - p.position.y / 1.6;
        p.material.opacity = Math.max(0, lif * 0.8);
        p.scale.setScalar(0.32 + lif * 0.45);
      });
    }
  }
}
