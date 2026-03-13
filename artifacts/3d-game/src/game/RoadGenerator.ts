import * as THREE from "three";

export const ROAD_WIDTH = 3.5;
export const SEGMENT_LENGTH = 14;
export const SEGMENTS_AHEAD = 22;
export const SEGMENTS_BEHIND = 4;

export interface RoadSegment {
  mesh: THREE.Mesh;
  centerX: number;
  centerZ: number;
}

export function createRoadSegment(
  scene: THREE.Scene,
  centerX: number,
  centerZ: number
): RoadSegment {
  const geometry = new THREE.BoxGeometry(ROAD_WIDTH, 0.3, SEGMENT_LENGTH);
  const material = new THREE.MeshLambertMaterial({ color: 0xcc2222 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.position.set(centerX, 0, centerZ);
  scene.add(mesh);
  return { mesh, centerX, centerZ };
}

export function nextCurveX(prevX: number, xDrift: number): { x: number; drift: number } {
  const maxDrift = 0.18;
  const maxX = 18;
  let newDrift = xDrift + (Math.random() - 0.5) * 0.08;
  newDrift = Math.max(-maxDrift, Math.min(maxDrift, newDrift));
  let newX = prevX + newDrift * SEGMENT_LENGTH;
  if (Math.abs(newX) > maxX) {
    newDrift = -newDrift * 0.5;
    newX = prevX + newDrift * SEGMENT_LENGTH;
  }
  return { x: newX, drift: newDrift };
}
