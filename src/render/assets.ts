import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Загрузчик ассетов KayKit. Все модели — GLB/GLTF из /public/assets.
 * Если ассеты недоступны, выдаёт процедурные плейсхолдеры с тем же API
 * и поднимает флаг fallbackUsed (страховка сборки, не результат).
 */

const BASE = import.meta.env.BASE_URL + 'assets/';

/** файлы подземелья без суффикса .gltf */
const PLAIN_GLB = new Set([
  'wall_doorway',
  'wall_doorway_scaffold',
  'chest',
  'chest_gold',
  'floor_tile_big_spikes',
]);

function dungeonUrl(key: string): string {
  return BASE + 'dungeon/' + key + (PLAIN_GLB.has(key) ? '.glb' : '.gltf.glb');
}

function characterUrl(key: string): string {
  return BASE + 'characters/' + key + '.glb';
}

/** оружие/щиты: пак приключенцев и скелетов */
const WEAPON_URLS: Record<string, string> = {
  sword_1handed: BASE + 'weapons/adventurers/sword_1handed.gltf',
  sword_2handed: BASE + 'weapons/adventurers/sword_2handed.gltf',
  axe_1handed: BASE + 'weapons/adventurers/axe_1handed.gltf',
  axe_2handed: BASE + 'weapons/adventurers/axe_2handed.gltf',
  crossbow_2handed: BASE + 'weapons/adventurers/crossbow_2handed.gltf',
  crossbow_1handed: BASE + 'weapons/adventurers/crossbow_1handed.gltf',
  dagger: BASE + 'weapons/adventurers/dagger.gltf',
  smokebomb: BASE + 'weapons/adventurers/smokebomb.gltf',
  staff: BASE + 'weapons/adventurers/staff.gltf',
  quiver: BASE + 'weapons/adventurers/quiver.gltf',
  shield_round: BASE + 'weapons/adventurers/shield_round.gltf',
  spellbook_open: BASE + 'weapons/adventurers/spellbook_open.gltf',
  skeleton_blade: BASE + 'weapons/skeletons/Skeleton_Blade.gltf',
  skeleton_staff: BASE + 'weapons/skeletons/Skeleton_Staff.gltf',
};

export interface CharacterAsset {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

export class Assets {
  private loader = new GLTFLoader();
  private cache = new Map<string, Promise<GLTF | null>>();
  fallbackUsed = false;

  private load(url: string): Promise<GLTF | null> {
    let p = this.cache.get(url);
    if (!p) {
      p = this.loader.loadAsync(url).catch((e) => {
        console.warn('[assets] не загрузилось: ' + url, e);
        this.fallbackUsed = true;
        return null;
      });
      this.cache.set(url, p);
    }
    return p;
  }

  /** статичная модель подземелья; null модели не бывает — всегда есть плейсхолдер */
  async dungeon(key: string): Promise<THREE.Group> {
    const g = await this.load(dungeonUrl(key));
    if (g) return g.scene.clone(true);
    return placeholderProp(key);
  }

  /** геометрии+материалы тайла для инстансинга (без клона сцены) */
  async dungeonRaw(key: string): Promise<THREE.Mesh[]> {
    const g = await this.load(dungeonUrl(key));
    const meshes: THREE.Mesh[] = [];
    if (g) {
      g.scene.updateMatrixWorld(true);
      g.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
      });
    }
    if (!meshes.length) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(2, 0.1, 2),
        new THREE.MeshStandardMaterial({ color: 0x4a4f58 }),
      );
      m.position.y = -0.05;
      m.updateMatrixWorld(true);
      meshes.push(m);
    }
    return meshes;
  }

  /** персонаж: свежий клон со скелетом и клипами */
  async character(key: string): Promise<CharacterAsset> {
    const g = await this.load(characterUrl(key));
    if (g) {
      const scene = cloneSkeleton(g.scene) as THREE.Group;
      return { scene, clips: g.animations };
    }
    return { scene: placeholderCharacter(), clips: [] };
  }

  async weapon(key: string): Promise<THREE.Group | null> {
    if (key === 'spear') return proceduralSpear();
    const url = WEAPON_URLS[key];
    if (!url) return null;
    const g = await this.load(url);
    if (g) return g.scene.clone(true);
    return proceduralSpear(); // близкий по духу простой меш
  }
}

export const assets = new Assets();

// ---------- Плейсхолдеры (страховка сборки) ----------

function placeholderProp(key: string): THREE.Group {
  const g = new THREE.Group();
  const isWall = key.startsWith('wall') || key === 'pillar';
  const mesh = new THREE.Mesh(
    isWall ? new THREE.BoxGeometry(2, 4, 1) : new THREE.BoxGeometry(1.2, 1, 1.2),
    new THREE.MeshStandardMaterial({ color: isWall ? 0x55585f : 0x6b5a44 }),
  );
  mesh.position.y = isWall ? 2 : 0.5;
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

function placeholderCharacter(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.45, 1.2, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x8888aa }),
  );
  body.position.y = 1.1;
  body.castShadow = true;
  g.add(body);
  return g;
}

function proceduralSpear(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6e4f33, roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9c0c8, roughness: 0.35, metalness: 0.6 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.4, 6), wood);
  shaft.position.y = 0.9;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.5, 6), steel);
  head.position.y = 2.3;
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 6), steel);
  guard.position.y = 2.04;
  g.add(shaft, head, guard);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  return g;
}

// ---------- Палитры ----------

export const PALETTES: Record<string, { tint: number; emissive?: number; emissiveIntensity?: number }> = {
  convict_grey: { tint: 0xb4afa6 },
  convict_ash: { tint: 0xa8a8b2 },
  convict_rust: { tint: 0xbca08c },
  convict_ink: { tint: 0x9aa0b4 },
  ghul: { tint: 0xafc2a4 },
  cultist: { tint: 0xa05050 },
  abbot: { tint: 0x9a86b0, emissive: 0x6633aa, emissiveIntensity: 0.25 },
  abbot_ascended: { tint: 0xb09ac8, emissive: 0x9944ff, emissiveIntensity: 0.6 },
  npc_elder: { tint: 0xb0a890 },
  npc_herbalist: { tint: 0x9ab694 },
  npc_boy: { tint: 0xb6b0a0 },
};

/** перекраска модели под фракцию: клонирует материалы и затемняет/подкрашивает */
export function applyPalette(root: THREE.Object3D, paletteKey: string): void {
  const p = PALETTES[paletteKey];
  if (!p) return;
  const tint = new THREE.Color(p.tint);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const cloned = mats.map((m) => {
      const c = (m as THREE.MeshStandardMaterial).clone();
      c.color.multiply(tint);
      if (p.emissive !== undefined) {
        c.emissive = new THREE.Color(p.emissive);
        c.emissiveIntensity = p.emissiveIntensity ?? 0.3;
      }
      return c;
    });
    mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
  });
}
