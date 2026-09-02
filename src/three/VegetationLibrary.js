import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { VEGETATION_ASSETS } from './WorldAssets.js';

/**
 * Cargador de árboles low-poly suministrados en `media/models`.
 *
 * Los FBX comparten geometría muy ligera y un atlas PNG con canal alfa. Se
 * convierten una vez en una plantilla y después se dibujan como
 * `InstancedMesh`: se respetan los modelos originales sin penalizar las rutas
 * con cientos de draw calls. La librería no usa copas cónicas de respaldo; si
 * un recurso no llegara a cargar, simplemente conserva el resto del paisaje.
 */
const templateCache = new Map();
const fbxLoader = new FBXLoader();
const textureLoader = new THREE.TextureLoader();

function configureTexture(texture) {
  if (!texture) return texture;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function loadTexture(url) {
  return new Promise((resolve) => {
    try {
      textureLoader.load(
        url,
        (texture) => resolve(configureTexture(texture)),
        undefined,
        () => resolve(null),
      );
    } catch {
      resolve(null);
    }
  });
}

function loadFbx(url) {
  return new Promise((resolve) => {
    try {
      fbxLoader.load(url, (root) => resolve(root), undefined, () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

function findFirstMesh(root) {
  let mesh = null;
  root?.traverse((node) => {
    if (!mesh && node.isMesh) mesh = node;
  });
  return mesh;
}

/**
 * Devuelve geometría y material compartidos para una variante de vegetación.
 * La promesa se cachea para que un cambio de zona no vuelva a descargar el FBX.
 */
export function loadVegetationTemplate(assetId) {
  if (templateCache.has(assetId)) return templateCache.get(assetId);

  const asset = VEGETATION_ASSETS[assetId];
  if (!asset) return Promise.resolve(null);

  const promise = Promise.all([loadFbx(asset.modelUrl), loadTexture(asset.textureUrl)])
    .then(([root, texture]) => {
      const source = findFirstMesh(root);
      if (!source?.geometry || !texture) return null;

      // El atlas trae transparencia alrededor de las hojas. alphaTest evita el
      // típico orden incorrecto de transparencias y conserva sombras limpias.
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: false,
        alphaTest: 0.38,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0,
        dithering: true,
      });
      material.name = `Gandia vegetation · ${assetId}`;

      source.geometry.computeBoundingBox();
      source.geometry.computeBoundingSphere();

      // Huella en metros del modelo (antes de aplicar la escala de la
      // plantilla) y tipo de obstáculo: los arbustos son “blandos” (sólo
      // rozan), los árboles son sólidos (la furgoneta choca).
      const box = source.geometry.boundingBox;
      const footprint = {
        radiusX: Math.max(Math.abs(box.min.x), Math.abs(box.max.x)),
        radiusZ: Math.max(Math.abs(box.min.z), Math.abs(box.max.z)),
        height: Math.max(0.5, box.max.y - box.min.y),
      };
      const isBush = /^bush/.test(assetId) || assetId.startsWith('bush');

      return {
        geometry: source.geometry,
        material,
        scale: asset.scale,
        footprint,
        soft: isBush,
        // El tronco ocupa bastante menos que la copa: se estima un 45 % del
        // radio de la silueta para no bloquear donde sólo hay hojas.
        collideScale: isBush ? 0.5 : 0.45,
      };
    })
    .catch(() => null);

  templateCache.set(assetId, promise);
  return promise;
}

/**
 * Inserta una familia de árboles / arbustos en un grupo de InstancedMesh.
 *
 * Los `placements` admiten escala uniforme (`scale: número`) o no uniforme
 * (`scale: [x, y, z]`), lo que permite reutilizar los mismos FBX como carrizos
 * altos y estrechos o como matas bajas y anchas sin añadir recursos nuevos.
 *
 * @param {string} assetId clave de `VEGETATION_ASSETS`
 * @param {{x:number,z:number, y?:number, scale?:number|number[], rotation?:number, soft?:boolean}[]} placements
 * @param {THREE.Group} group destino
 * @param {(x:number,z:number)=>number} heightAt fuente de altura del terreno
 * @param {() => boolean} isCurrent evita que cargas asíncronas de una zona
 * antigua reaparezcan después de viajar.
 * @param {{ onColliders?: (colliders: object[]) => void }} [options]
 *   `onColliders` recibe la huella real en metros de cada ejemplar (calculada
 *   con la caja envolvente del FBX ya escalada) para que el mundo registre los
 *   troncos como obstáculos y la furgoneta deje de atravesarlos.
 * @returns {Promise<THREE.InstancedMesh|null>}
 */
export async function addInstancedVegetation(
  assetId,
  placements,
  group,
  heightAt,
  isCurrent = () => true,
  { onColliders } = {},
) {
  if (!placements?.length) return null;
  const template = await loadVegetationTemplate(assetId);
  if (!template || !isCurrent()) return null;

  const mesh = new THREE.InstancedMesh(template.geometry, template.material, placements.length);
  mesh.name = `Vegetación FBX · ${assetId}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  // La geometría y material viven en la caché global: InstancedElements no
  // debe liberarlos cada vez que se cambia de zona.
  mesh.userData.sharedVegetation = true;
  mesh.userData.assetId = assetId;

  const colliders = [];
  const dummy = new THREE.Object3D();
  for (let index = 0; index < placements.length; index += 1) {
    const placement = placements[index];
    const y = placement.y ?? heightAt(placement.x, placement.z);
    const extra = placement.scale ?? 1;
    const extraScale = Array.isArray(extra) ? extra : [extra, extra, extra];
    const sx = template.scale * extraScale[0];
    const sy = template.scale * extraScale[1];
    const sz = template.scale * extraScale[2];
    dummy.position.set(placement.x, y, placement.z);
    dummy.rotation.set(0, placement.rotation ?? 0, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);

    if (onColliders) {
      // Huella en planta del modelo ya escalado (media de ancho y fondo).
      const radius = ((template.footprint.radiusX + template.footprint.radiusZ) / 2) * Math.max(sx, sz);
      colliders.push({
        x: placement.x,
        z: placement.z,
        radius: Math.max(0.18, radius * (placement.collideScale ?? template.collideScale)),
        height: Math.max(0.5, template.footprint.height * sy),
        // Arbustos y herbáceas frenan, pero no detienen al vehículo.
        soft: placement.soft ?? template.soft,
        type: 'vegetation',
      });
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();

  if (!isCurrent()) return null;
  group.add(mesh);
  onColliders?.(colliders);
  return mesh;
}
