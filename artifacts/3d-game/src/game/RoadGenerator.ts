import * as THREE from "three";

export interface RoadSegment {
  mesh: THREE.Mesh;
  body: {
    position: { x: number; y: number; z: number };
    quaternion: { x: number; y: number; z: number; w: number };
  };
  centerX: number;
  centerZ: number;
  width: number;
  length: number;
  yaw: number;
  endX: number;
  endZ: number;
  endYaw: number;
}

export const ROAD_WIDTH = 3.5;
export const SEGMENT_LENGTH = 12;
export const SEGMENTS_AHEAD = 20;
export const SEGMENTS_BEHIND = 5;

export function createRoadSegment(
  scene: THREE.Scene,
  startX: number,
  startZ: number,
  yaw: number,
  segmentLength: number = SEGMENT_LENGTH
): RoadSegment {
  const halfLen = segmentLength / 2;

  const geometry = new THREE.BoxGeometry(ROAD_WIDTH, 0.3, segmentLength);
  const material = new THREE.MeshLambertMaterial({ color: 0xcc2222 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;

  const cx = startX + Math.sin(yaw) * halfLen;
  const cz = startZ + Math.cos(yaw) * halfLen;

  mesh.position.set(cx, 0, cz);
  mesh.rotation.y = -yaw;
  scene.add(mesh);

  const endX = startX + Math.sin(yaw) * segmentLength;
  const endZ = startZ + Math.cos(yaw) * segmentLength;

  return {
    mesh,
    body: {
      position: { x: cx, y: 0, z: cz },
      quaternion: { x: 0, y: Math.sin(-yaw / 2), z: 0, w: Math.cos(-yaw / 2) },
    },
    centerX: cx,
    centerZ: cz,
    width: ROAD_WIDTH,
    length: segmentLength,
    yaw,
    endX,
    endZ,
    endYaw: yaw,
  };
}

export function generateCurvedYaw(currentYaw: number): number {
  const maxTurn = Math.PI / 6;
  const turn = (Math.random() - 0.5) * 2 * maxTurn;
  return currentYaw + turn;
}
