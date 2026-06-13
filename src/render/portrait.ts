import * as THREE from 'three';
import { ENEMIES, SQUAD } from '../data/units';
import { applyPalette, assets } from './assets';

/**
 * Портреты: бюст модели рендерится в офскрин-таргет на тёмном фоне.
 * Кэш по defId.
 */
const cache = new Map<string, string>();

export async function portraitFor(defId: string): Promise<string> {
  const hit = cache.get(defId);
  if (hit) return hit;
  const tpl = SQUAD.find((s) => s.defId === defId) ?? ENEMIES[defId];
  if (!tpl) return '';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(160, 200);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x11151d);
  const cam = new THREE.PerspectiveCamera(28, 160 / 200, 0.1, 30);
  cam.position.set(0.5, 2.1, 3.4);
  cam.lookAt(0, 1.78, 0);
  const key = new THREE.DirectionalLight(0xbfd2ec, 2.2);
  key.position.set(2, 3, 2.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff9944, 1.1);
  rim.position.set(-2.5, 2, -1.5);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0x44516b, 1.4));
  const ch = await assets.character(tpl.model);
  applyPalette(ch.scene, tpl.palette);
  // T-поза прячется первой idle-позой, если есть клипы
  if (ch.clips.length) {
    const mixer = new THREE.AnimationMixer(ch.scene);
    const idle = ch.clips.find((c) => c.name === 'Idle') ?? ch.clips[0];
    mixer.clipAction(idle).play();
    mixer.update(0.05);
  }
  ch.scene.rotation.y = 0.35;
  scene.add(ch.scene);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  renderer.dispose();
  renderer.forceContextLoss();
  cache.set(defId, url);
  return url;
}
