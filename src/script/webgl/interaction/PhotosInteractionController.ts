import * as THREE from 'three';
import type { PhotosPillarPlanes } from '../scene/PhotosPillarPlanes';

export type PhotosInteractionDeps = {
    getCamera: () => THREE.PerspectiveCamera;
    getRenderer: () => THREE.WebGLRenderer;
    getPhotosPillarPlanes: () => PhotosPillarPlanes | undefined;
    isPC: () => boolean;
};

type AlpineRuntime = {
    evaluate(el: HTMLElement, expression: string): unknown;
};

function setPFAppPhoto(active: boolean, title = '') {
    const alpine = (window as Window & { Alpine?: AlpineRuntime }).Alpine;
    if (!alpine) return;
    alpine.evaluate(document.body, `photoActiveTitle = ${JSON.stringify(title)}`);
    alpine.evaluate(document.body, `isPhotoActive = ${active}`);
}

/**
 * Photos プレーンへの Raycaster クリック → 写真がカメラへ寄って横幅一杯。
 * 再クリック or Esc で復帰＋Lenis スクロール再開。
 */
export class PhotosInteractionController {
    private planes: THREE.Mesh[] = [];
    private titles: string[] = [];
    private isZoomed = false;
    private zoomedPlane: THREE.Mesh | null = null;

    private readonly raycaster = new THREE.Raycaster();
    private readonly pointer = new THREE.Vector2();

    constructor(private readonly deps: PhotosInteractionDeps) {}

    attach(planes: THREE.Mesh[]) {
        this.planes = planes;
        this.titles = this.readTitles();
        window.addEventListener('click', this.onClick);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('pointermove', this.onPointerMove);
    }

    detach() {
        this.planes = [];
        window.removeEventListener('click', this.onClick);
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('pointermove', this.onPointerMove);
        this.setCursor(false);
        if (this.isZoomed) this.zoomOut();
    }

    private onPointerMove = (e: PointerEvent) => {
        if (!this.deps.isPC()) {
            this.setCursor(false);
            return;
        }

        const hits = this.intersectVisiblePlanes(e.clientX, e.clientY);
        this.setCursor(hits.length > 0);
    };

    private setCursor(hovering: boolean) {
        this.deps.getRenderer().domElement.style.cursor = hovering ? 'pointer' : '';
    }

    private intersectVisiblePlanes(clientX: number, clientY: number) {
        this.pointer.x = (clientX / window.innerWidth) * 2 - 1;
        this.pointer.y = -(clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.deps.getCamera());
        const worldPlanes = this.planes.filter((p) => p.visible);
        return this.raycaster.intersectObjects(worldPlanes, false);
    }

    private onClick = (e: MouseEvent) => {
        if (this.isZoomed) {
            this.zoomOut();
            return;
        }

        const hits = this.intersectVisiblePlanes(e.clientX, e.clientY);
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
        this.isZoomed = true;
        this.zoomedPlane = plane;

        const lenis = (window as Window & { lenis?: { stop(): void; start(): void } }).lenis;
        lenis?.stop();
        this.setPhotoActive(true, plane);

        const photos = this.deps.getPhotosPillarPlanes();
        photos?.toOriginal(plane);
        photos?.hideOthers(plane);
        photos?.bringForward(plane, this.deps.getCamera());
    }

    private zoomOut() {
        const zoomedPlane = this.zoomedPlane;
        this.isZoomed = false;
        this.zoomedPlane = null;
        const lenis = (window as Window & { lenis?: { stop(): void; start(): void } }).lenis;
        lenis?.start();
        this.setPhotoActive(false, null);

        const photos = this.deps.getPhotosPillarPlanes();
        photos?.toDuotone(zoomedPlane);
        photos?.restoreForward();
        photos?.restoreOthers();
    }

    private readTitles(): string[] {
        const raw = document.querySelector('[data-photo-titles]')?.getAttribute('data-photo-titles');
        if (!raw) return [];
        try {
            return JSON.parse(decodeURIComponent(raw)) as string[];
        } catch {
            return [];
        }
    }

    private setPhotoActive(active: boolean, plane: THREE.Mesh | null) {
        if (active && plane) {
            const index = typeof plane.userData.photoIndex === 'number'
                ? plane.userData.photoIndex
                : this.planes.indexOf(plane);
            setPFAppPhoto(true, this.titles[index] ?? '');
        } else {
            setPFAppPhoto(false);
        }
    }
}
