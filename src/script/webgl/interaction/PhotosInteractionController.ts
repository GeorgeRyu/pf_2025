import * as THREE from 'three';
import gsap from 'gsap';

export type PhotosInteractionDeps = {
    getCamera: () => THREE.PerspectiveCamera;
    getRenderer: () => THREE.WebGLRenderer;
    getDefaultCameraZ: () => number;
    getDefaultCameraXY: () => { x: number; y: number };
};

/**
 * Photos プレーンへの Raycaster クリック → カメラズーム（横幅一杯）。
 * 再クリック or Esc でズームアウト＋Lenis スクロール再開。
 */
export class PhotosInteractionController {
    private planes: THREE.Mesh[] = [];
    private isZoomed = false;
    private zoomedPlane: THREE.Mesh | null = null;
    private cameraTween: gsap.core.Tween | null = null;

    private readonly raycaster = new THREE.Raycaster();
    private readonly pointer = new THREE.Vector2();

    constructor(private readonly deps: PhotosInteractionDeps) {}

    attach(planes: THREE.Mesh[]) {
        this.planes = planes;
        window.addEventListener('click', this.onClick);
        window.addEventListener('keydown', this.onKeyDown);
    }

    detach() {
        this.planes = [];
        window.removeEventListener('click', this.onClick);
        window.removeEventListener('keydown', this.onKeyDown);
        if (this.isZoomed) this.zoomOut();
    }

    private onClick = (e: MouseEvent) => {
        const camera = this.deps.getCamera();
        const renderer = this.deps.getRenderer();

        this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.pointer, camera);

        if (this.isZoomed) {
            this.zoomOut();
            return;
        }

        const worldPlanes: THREE.Mesh[] = this.planes.filter((p) => p.visible);
        const hits = this.raycaster.intersectObjects(worldPlanes, false);
        if (hits.length > 0) {
            this.zoomIn(hits[0].object as THREE.Mesh);
        }
    };

    private onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && this.isZoomed) {
            this.zoomOut();
        }
    };

    private zoomIn(plane: THREE.Mesh) {
        const camera = this.deps.getCamera();
        const fovRad = (camera.fov * Math.PI) / 180;
        const aspect = window.innerWidth / window.innerHeight;

        // planeのworldZ
        const worldPos = new THREE.Vector3();
        plane.getWorldPosition(worldPos);

        // 画面横幅一杯になるカメラZ: planeWidth / (2 * tan(fov/2) * aspect) + planeZ
        const planeWidth = 2; // PLANE_WIDTH in local = 2、scaleは親rect.scale.x=1
        const targetZ = worldPos.z + planeWidth / (2 * Math.tan(fovRad / 2) * aspect);

        this.isZoomed = true;
        this.zoomedPlane = plane;

        if (this.cameraTween) this.cameraTween.kill();

        const lenis = (window as Window & { lenis?: { stop(): void; start(): void } }).lenis;
        lenis?.stop();

        this.cameraTween = gsap.to(camera.position, {
            x: worldPos.x,
            y: worldPos.y,
            z: targetZ,
            duration: 1.0,
            ease: 'power3.out',
        });
    }

    private zoomOut() {
        if (this.cameraTween) this.cameraTween.kill();

        const camera = this.deps.getCamera();
        const defaultZ = this.deps.getDefaultCameraZ();
        const { x, y } = this.deps.getDefaultCameraXY();

        this.cameraTween = gsap.to(camera.position, {
            x,
            y,
            z: defaultZ,
            duration: 0.9,
            ease: 'power3.out',
            onComplete: () => {
                const lenis = (window as Window & { lenis?: { stop(): void; start(): void } }).lenis;
                lenis?.start();
                this.isZoomed = false;
                this.zoomedPlane = null;
            },
        });
    }
}
