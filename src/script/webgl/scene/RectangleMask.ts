import * as THREE from 'three';

const RECTANGLE_COUNT = 7;
const BOX_SIZE = { x: 2, y: 35, z: 1.1256 };

export type RectangleMask = {
    rectangles: THREE.Mesh[];
    materials: THREE.MeshBasicMaterial[];
    group: THREE.Group;
};

/**
 * ステンシル用の柱マスク（7本の薄い Box）を生成する。
 */
export function createRectangleMask(): RectangleMask {
    const geometry = new THREE.BoxGeometry(BOX_SIZE.x, BOX_SIZE.y, BOX_SIZE.z);
    const rectangles: THREE.Mesh[] = [];
    const materials: THREE.MeshBasicMaterial[] = [];

    for (let i = 0; i < RECTANGLE_COUNT; i++) {
        const material = new THREE.MeshBasicMaterial({
            color: 0x000000,
            side: THREE.DoubleSide,
        });
        materials.push(material);

        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.z = (Math.PI / 12) * i;
        mesh.scale.z = 0.01;
        rectangles.push(mesh);
    }

    const group = new THREE.Group();
    group.add(...rectangles);

    return { rectangles, materials, group };
}
