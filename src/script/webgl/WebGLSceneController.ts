import * as THREE from 'three';
import gsap from 'gsap';
import studio from '@theatre/studio';
import { WebGLSceneContext } from './core/WebGLSceneContext';
import { PlateContentController } from './content/PlateContentController';
import { WebGLScrollController } from './scroll/WebGLScrollController';
import { TheatreController } from './theatre/TheatreController';
import { PlaygroundBarsController, computeBarUvBounds, calcCoverUvTransform } from './interaction/PlaygroundBarsController';
import {
    WorksHoverController,
    PlaygroundHoverController,
} from './interaction/SectionHoverControllers';
import { WorksMobilePreviewController } from './interaction/WorksMobilePreviewController';
import { PhotosInteractionController } from './interaction/PhotosInteractionController';
import { WebGLDebugPanel } from './debug/WebGLDebugPanel';
import { buildWebGLSceneMeshes, applyAboutImageUniforms } from './scene/createSceneMeshes';
import { bindWebGLSceneLayout } from './scene/WebGLSceneLayout';
import { PhotosPillarPlanes } from './scene/PhotosPillarPlanes';
import {
    ABOUT_IMAGE_KEY,
    ABOUT_IMAGE_URL,
    DEFAULT_ABOUT_IMAGE_CONFIG,
    type AboutImageConfig,
} from './types';

export type { ActiveSection, PlateContent, AboutImageConfig } from './types';

export class WebGLSceneController {
    private context: WebGLSceneContext;
    private isDebug: boolean;
    private rectangles: THREE.Mesh[] = [];
    private rectangleMaterials: THREE.MeshBasicMaterial[] = [];
    private groupRectangles!: THREE.Group;
    private worksPlate!: THREE.Mesh;
    private debugPanel: WebGLDebugPanel | null = null;
    private movies: string[] = [];
    private playgroundMovies: string[] = [];
    private photos: string[] = [];
    private plateContent!: PlateContentController;
    private scroll!: WebGLScrollController;
    private theatre!: TheatreController;
    private plateShaderMaterial!: THREE.ShaderMaterial;
    private aboutImageConfig: AboutImageConfig = { ...DEFAULT_ABOUT_IMAGE_CONFIG };
    private isPC = false;
    private mouseUvTarget = new THREE.Vector2(0.5, 0.5);
    private lensActiveTarget = 0;
    private aboutLensLastMoveAt = 0;
    private readonly aboutLensIdleMs = 1000;
    private readonly aboutRaycaster = new THREE.Raycaster();
    private readonly aboutPointerNdc = new THREE.Vector2(2, 2);
    private aboutPointerDownX = 0;
    private aboutPointerDownY = 0;
    // デフォルトカメラ位置（PC/SP で bindWebGLSceneLayout が上書きする）
    private defaultCameraZ = 5;
    private defaultCameraX = 0;
    private defaultCameraY = 0;

    private photosPillarPlanes!: PhotosPillarPlanes;
    private photosInteraction!: PhotosInteractionController;
    private playgroundBars!: PlaygroundBarsController;
    private playgroundHover!: PlaygroundHoverController;
    private worksMobilePreview!: WorksMobilePreviewController;

    constructor() {
        const container = document.getElementById('webgl-container');
        this.context = new WebGLSceneContext(container);

        // ?debug=lil → lil-gui + stats.js  / ?debug=theatre → Theatre Studio UI
        const debugParam = new URLSearchParams(location.search).get('debug');
        this.isDebug = debugParam === 'lil';
        const isTheatre = debugParam === 'theatre';

        // Studio は常に初期化（Core の ticker / onValuesChange に必要）
        studio.initialize();
        if (isTheatre) {
            // ?debug=theatre → Studio UI を表示（localStorage の hidden 状態を上書き）
            studio.ui.restore();
        } else {
            // それ以外 → Studio UI を隠す
            studio.ui.hide();
        }

        const moviesStr = container?.getAttribute('data-movies') || '';
        try {
            this.movies = moviesStr ? JSON.parse(decodeURIComponent(moviesStr)) : [];
        } catch (e) {
            this.movies = [];
        }

        const playgroundMoviesStr = container?.getAttribute('data-playground-movies') || '';
        try {
            this.playgroundMovies = playgroundMoviesStr
                ? JSON.parse(decodeURIComponent(playgroundMoviesStr))
                : [];
        } catch (e) {
            this.playgroundMovies = [];
        }

        const photosStr = container?.getAttribute('data-photos') || '';
        try {
            this.photos = photosStr ? JSON.parse(decodeURIComponent(photosStr)) : [];
        } catch (e) {
            this.photos = [];
        }

        this.plateContent = new PlateContentController({
            movies: this.movies,
            playgroundMovies: this.playgroundMovies,
            getPlateShaderMaterial: () => this.plateShaderMaterial,
            getWorksPlate: () => this.worksPlate,
        });
        this.theatre = new TheatreController();

        this.photosPillarPlanes = new PhotosPillarPlanes();
        this.photosInteraction = new PhotosInteractionController({
            getCamera: () => this.camera,
            getRenderer: () => this.context.renderer,
            getPhotosPillarPlanes: () => this.photosPillarPlanes,
            isPC: () => this.isPC,
        });

        this.playgroundBars = new PlaygroundBarsController({
            getRectangles: () => this.rectangles,
            isPC: () => this.isPC,
        });

        this.worksMobilePreview = new WorksMobilePreviewController({
            plateContent: this.plateContent,
            getMovieCount: () => this.movies.length,
        });

        this.scroll = new WebGLScrollController({
            getTheatreSheet: () => this.theatre.getSheet(),
            getSequenceLength: () => this.theatre.getSequenceLength(),
            plateContent: this.plateContent,
            onPhotosEnter: () => {
                this.photosPillarPlanes.show();
                this.photosInteraction.attach(this.photosPillarPlanes.planes);
            },
            onPhotosLeave: () => {
                this.photosInteraction.detach();
                this.photosPillarPlanes.hide();
            },
            onPlaygroundLeave: () => {
                this.playgroundHover?.reset();
            },
            onAboutEnter: () => {
                this.worksMobilePreview.stop();
            },
            onAboutLeaveBack: () => {
                if (!this.isPC) this.worksMobilePreview.start();
            },
        });

        this.init();
        this.applyTheme();
        this.attachTheme();
        new WorksHoverController({
            plateContent: this.plateContent,
            getActiveSection: () => this.scroll.getActiveSection(),
        }).attach();

        this.playgroundHover = new PlaygroundHoverController({
            plateContent: this.plateContent,
            bars: this.playgroundBars,
            getActiveSection: () => this.scroll.getActiveSection(),
        });
        this.playgroundHover.attach();
    }

    private get scene() {
        return this.context.scene;
    }

    private get camera() {
        return this.context.camera;
    }

    /** Playground ホバー中: フォーカスバーの UV 範囲へ動画を cover */
    private updatePlaygroundBarUv() {
        if (!this.plateShaderMaterial) return;
        const u = this.plateShaderMaterial.uniforms;
        const focused = this.playgroundBars?.getFocusedIndex() ?? null;

        if (focused == null || !this.worksPlate || !this.rectangles[focused]) {
            if (u.barUvRemap) u.barUvRemap.value = 0;
            return;
        }

        const bounds = computeBarUvBounds(this.rectangles[focused], this.worksPlate);
        if (!bounds) {
            u.barUvRemap.value = 0;
            return;
        }

        u.barUvRemap.value = 1;
        (u.barUvMin.value as THREE.Vector2).copy(bounds.min);
        (u.barUvMax.value as THREE.Vector2).copy(bounds.max);

        const videoAspect = this.plateContent.getActivePlaygroundVideoAspect();
        if (videoAspect != null) {
            const destAspect = Math.max(
                (bounds.max.x - bounds.min.x) / Math.max(bounds.max.y - bounds.min.y, 1e-5),
                1e-5,
            );
            const cover = calcCoverUvTransform(videoAspect, destAspect);
            (u.uvScaleB.value as THREE.Vector2).copy(cover.scale);
            (u.uvOffsetB.value as THREE.Vector2).copy(cover.offset);
            // トランジション中も A を同じ cover に揃える（前が別動画でも見た目優先）
            if (u.staticNoiseMode.value < 0.5) {
                (u.uvScaleA.value as THREE.Vector2).copy(cover.scale);
                (u.uvOffsetA.value as THREE.Vector2).copy(cover.offset);
            }
        }
    }

    private startRenderLoop() {
        this.context.startRenderLoop({
            getPlateShaderMaterial: () => this.plateShaderMaterial,
            getWorksPlate: () => this.worksPlate,
            getGroupRectangles: () => this.groupRectangles,
            getRectangles: () => this.rectangles,
            isPC: () => this.isPC,
            getActiveSection: () => this.scroll.getActiveSection(),
            getMouseUvTarget: () => this.mouseUvTarget,
            getLensActiveTarget: () => this.lensActiveTarget,
            getPhotoPlanesGroup: () => this.photosPillarPlanes.group,
            getPhotosPillarFading: () => this.photosPillarPlanes.isPillarFading(),
            getPlaygroundFocusedIndex: () => this.playgroundBars.getFocusedIndex(),
            onTick: (time) => {
                this.theatre.tick(time);
                this.playgroundBars.applyOverrides();
                this.photosPillarPlanes.applyActiveRectOverride();
                this.photosPillarPlanes.updateTransforms();
                this.updatePlaygroundBarUv();
                this.updateAboutLens();
            },
            onFrameStart: () => {
                if (this.isDebug) this.debugPanel?.stats.begin();
            },
            onFrameEnd: () => {
                if (this.isDebug) this.debugPanel?.stats.end();
            },
        });
    }

    async init() {
        this.context.mount();

        const meshes = buildWebGLSceneMeshes(this.aboutImageConfig);
        this.rectangles = meshes.rectangles;
        this.rectangleMaterials = meshes.rectangleMaterials;
        this.groupRectangles = meshes.groupRectangles;
        this.worksPlate = meshes.worksPlate;
        this.plateShaderMaterial = meshes.plateShaderMaterial;

        this.applyTheme();
        this.scene.add(this.worksPlate);
        this.scene.add(this.photosPillarPlanes.group);

        bindWebGLSceneLayout(gsap.matchMedia(), {
            camera: this.camera,
            groupRectangles: this.groupRectangles,
            worksPlate: this.worksPlate,
            plateShaderMaterial: this.plateShaderMaterial,
            setIsPC: (v) => {
                this.isPC = v;
                // PC/SP それぞれのデフォルト Z を記録
                this.defaultCameraZ = v ? 5 : 18;
                this.defaultCameraX = 0;
                this.defaultCameraY = 0;
                if (v) {
                    this.worksMobilePreview.stop();
                } else if (this.scroll.getActiveSection() === 'works') {
                    this.worksMobilePreview.start();
                }
            },
        });

        this.scene.add(this.groupRectangles);

        this.attachAboutPointer();

        const aboutImagePromise = this.plateContent.loadImageTexture(
            ABOUT_IMAGE_KEY,
            ABOUT_IMAGE_URL
        ).catch((err) => {
            console.warn('⚠️ Failed to load about image:', err);
        });

        const photosPromise = this.photos.length > 0
            ? this.photosPillarPlanes.loadAndAttach({
                rectangles: this.rectangles,
                photoUrls: this.photos,
            }).catch((err) => {
                console.warn('⚠️ Failed to load photos:', err);
            })
            : Promise.resolve();

        this.startRenderLoop();

        await this.theatre.init({
            groupRectangles: this.groupRectangles,
            rectangles: this.rectangles,
            worksPlate: this.worksPlate,
        });

        // Theatre が position=0 をセットした後にcanvasをフェードイン表示
        const webglContainer = document.getElementById('webgl-container');
        if (webglContainer) {
            webglContainer.style.transition = 'opacity 0.3s';
            webglContainer.style.opacity = '1';
        }

        // 全動画は裏読み開始。Phase1 は Works 先頭2本のバッファ進捗のみ連動
        const { getProgress } = this.plateContent.preloadVideos({ criticalCount: 2 });

        // ローディングアニメーション（Phase1: 2本進捗連動 / Phase2: tween）
        await this.theatre.playLoadingAnimation(getProgress, () => {
            const fadeInItems = gsap.utils.toArray('[loading-name="text"]');
            fadeInItems.forEach((item , index) => {
                const fromX = this.isPC ? index + 1 * 100 : index + 1 * 40;
                const fromY = this.isPC ? index + 1 * 80 : index + 1 * 80;
                
                gsap.set(item as HTMLElement, {
                    x: fromX,
                    y: fromY,
                    rotate: 30,
                    transformOrigin: 'center bottom',
                });
            });

            if (fadeInItems.length > 0) {
                gsap.to(fadeInItems, {
                    duration: 2,
                    x: 0,
                    y: 0,
                    rotate: 0,
                    ease: 'power3.out',
                    stagger: {
                        amount: this.isPC ? 0.5 : 0.4,
                        // from: 'random',
                    }
                });
                gsap.to(fadeInItems, {
                    opacity: 1,
                    duration: 3.0,
                    stagger: {
                        amount: 0.4,
                    }
                });
            }
        });

        // 残り動画の完了は待たない（scroll.attach をブロックしない）
        await Promise.all([aboutImagePromise, photosPromise]);

        // photos ロード完了後にテーマ色を反映（ロード前に applyTheme が走っているため再実行）
        this.applyTheme();

        this.scroll.setActiveSection('works');
        this.scroll.attach();
        if (!this.isPC) this.worksMobilePreview.start();

        window.addEventListener('resize', () => this.context.resize());

        if (this.isDebug) {
            this.debugPanel = new WebGLDebugPanel({
                getGroupRectangles: () => this.groupRectangles,
                getRectangles: () => this.rectangles,
                getWorksPlate: () => this.worksPlate,
                getAboutImageConfig: () => this.aboutImageConfig,
                onAboutImageConfigChange: (partial) => this.setAboutImageConfig(partial),
            });
        }
    }

    public setAboutImageConfig(partial: Partial<AboutImageConfig>) {
        Object.assign(this.aboutImageConfig, partial);
        if (!this.plateShaderMaterial) return;
        applyAboutImageUniforms(this.plateShaderMaterial, this.aboutImageConfig);
    }

    private applyTheme() {
        const accent = readCssVarColor('--c-accent', '#000000');
        const base = readCssVarColor('--c-base', '#ffffff');

        this.rectangleMaterials.forEach((m) => m.color.copy(accent));

        const plateShaderMaterial = this.plateShaderMaterial;
        if (plateShaderMaterial?.uniforms?.baseColor) {
            const u = plateShaderMaterial.uniforms;
            (u.baseColor.value as THREE.Color).copy(accent);
            (u.duotoneLight.value as THREE.Color).copy(base);
            (u.duotoneDark.value as THREE.Color).copy(accent);
        }

        this.photosPillarPlanes?.setDuotoneColors(base, accent);
    }

    private attachTheme() {
        window.addEventListener('pf:color-theme-change', () => this.applyTheme());
    }

    private updateAboutLens() {
        if (this.scroll.getActiveSection() !== 'about') {
            this.lensActiveTarget = 0;
            return;
        }

        if (
            this.lensActiveTarget > 0 &&
            performance.now() - this.aboutLensLastMoveAt >= this.aboutLensIdleMs
        ) {
            this.lensActiveTarget = 0;
        }
    }

    private attachAboutPointer() {
        window.addEventListener('pointerdown', this.onAboutPointerDown);
        window.addEventListener('pointerup', this.onAboutPointerUp);
        window.addEventListener('pointermove', this.onAboutPointerMove);
    }

    private onAboutPointerDown = (e: PointerEvent) => {
        this.aboutPointerDownX = e.clientX;
        this.aboutPointerDownY = e.clientY;
    };

    private onAboutPointerUp = (e: PointerEvent) => {
        if (this.isPC || this.scroll.getActiveSection() !== 'about') return;

        const dx = e.clientX - this.aboutPointerDownX;
        const dy = e.clientY - this.aboutPointerDownY;
        if (Math.hypot(dx, dy) > 12) return;

        this.setAboutPointerNdc(e.clientX, e.clientY);
        this.applyAboutLensFromRaycast();
    };

    private onAboutPointerMove = (e: PointerEvent) => {
        this.setAboutPointerNdc(e.clientX, e.clientY);
        if (this.isPC) this.updateAboutPointerRaycast();
    };

    private setAboutPointerNdc(clientX: number, clientY: number) {
        this.aboutPointerNdc.x = (clientX / window.innerWidth) * 2 - 1;
        this.aboutPointerNdc.y = -(clientY / window.innerHeight) * 2 + 1;
    }

    private updateAboutPointerRaycast() {
        if (!this.isPC || this.scroll.getActiveSection() !== 'about') return;
        this.applyAboutLensFromRaycast();
    }

    private applyAboutLensFromRaycast() {
        if (!this.worksPlate || this.scroll.getActiveSection() !== 'about') return;

        this.aboutRaycaster.setFromCamera(this.aboutPointerNdc, this.camera);
        const hits = this.aboutRaycaster.intersectObject(this.worksPlate, false);
        if (hits.length > 0 && hits[0].uv) {
            const uv = hits[0].uv;
            const appearing = this.lensActiveTarget < 0.5;
            if (appearing && this.plateShaderMaterial) {
                (this.plateShaderMaterial.uniforms.imageMouseUv.value as THREE.Vector2).copy(uv);
            }
            this.mouseUvTarget.copy(uv);
            this.lensActiveTarget = 1;
            this.aboutLensLastMoveAt = performance.now();
        } else {
            this.lensActiveTarget = 0;
        }
    }
}

function readCssVarColor(varName: string, fallbackHex: string): THREE.Color {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    const value = raw || fallbackHex;
    try {
        return new THREE.Color(value);
    } catch {
        return new THREE.Color(fallbackHex);
    }
}
