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
      return {
        geometry: source.geometry,
        material,
        scale: asset.scale,
      };
    })
    .catch(() => null);

  templateCache.set(assetId, promise);
  return promise;
}

/**
 * Inserta una familia de árboles / arbustos en un grupo de InstancedMesh.
 *
 * @param {string} assetId clave de `VEGETATION_ASSETS`
 * @param {{x:number,z:number, y?:number, scale?:number, rotation?:number}[]} placements
 * @param {THREE.Group} group destino
 * @param {(x:number,z:number)=>number} heightAt fuente de altura del terreno
 * @param {() => boolean} isCurrent evita que cargas asíncronas de una zona
 * antigua reaparezcan después de viajar.
 * @returns {Promise<THREE.InstancedMesh|null>}
 */
export async function addInstancedVegetation(assetId, placements, group, heightAt, isCurrent = () => true) {
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

  const dummy = new THREE.Object3D();
  for (let index = 0; index < placements.length; index += 1) {
    const placement = placements[index];
    const y = placement.y ?? heightAt(placement.x, placement.z);
    const s = template.scale * (placement.scale ?? 1);
    dummy.position.set(placement.x, y, placement.z);
    dummy.rotation.set(0, placement.rotation ?? 0, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();

  if (!isCurrent()) return null;
  group.add(mesh);
  return mesh;
}
