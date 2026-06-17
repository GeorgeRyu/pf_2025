import * as THREE from 'three';
import gsap from 'gsap';
import studio from '@theatre/studio';
import { WebGLSceneContext } from './core/WebGLSceneContext';
import { PlateContentController } from './content/PlateContentController';
import { WebGLScrollController } from './scroll/WebGLScrollController';
import { TheatreController } from './theatre/TheatreController';
import { WebGLTheme } from './theme/WebGLTheme';
import { WorksHoverController } from './interaction/WorksHoverController';
import { AboutPointerController } from './interaction/AboutPointerController';
import { PhotosInteractionController } from './interaction/PhotosInteractionController';
import { WebGLDebugPanel } from './debug/WebGLDebugPanel';
import { buildWebGLSceneMeshes } from './scene/buildWebGLSceneMeshes';
import { bindWebGLSceneLayout } from './scene/WebGLSceneLayout';
import { applyAboutImageUniforms } from './scene/WorksPlateMesh';
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
    private photos: string[] = [];
    private plateContent!: PlateContentController;
    private scroll!: WebGLScrollController;
    private theatre!: TheatreController;
    private theme!: WebGLTheme;
    private plateShaderMaterial!: THREE.ShaderMaterial;
    private aboutImageConfig: AboutImageConfig = { ...DEFAULT_ABOUT_IMAGE_CONFIG };
    private isPC = false;
    private mouseUvTarget = new THREE.Vector2(0.5, 0.5);
    // デフォルトカメラ位置（PC/SP で bindWebGLSceneLayout が上書きする）
    private defaultCameraZ = 5;
    private defaultCameraX = 0;
    private defaultCameraY = 0;

    private photosPillarPlanes!: PhotosPillarPlanes;
    private photosInteraction!: PhotosInteractionController;

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

        const photosStr = container?.getAttribute('data-photos') || '';
        try {
            this.photos = photosStr ? JSON.parse(decodeURIComponent(photosStr)) : [];
        } catch (e) {
            this.photos = [];
        }

        this.plateContent = new PlateContentController({
            movies: this.movies,
            getPlateShaderMaterial: () => this.plateShaderMaterial,
            getWorksPlate: () => this.worksPlate,
        });
        this.theatre = new TheatreController();

        this.photosPillarPlanes = new PhotosPillarPlanes();
        this.photosInteraction = new PhotosInteractionController({
            getCamera: () => this.camera,
            getRenderer: () => this.context.renderer,
            getDefaultCameraZ: () => this.defaultCameraZ,
            getDefaultCameraXY: () => ({ x: this.defaultCameraX, y: this.defaultCameraY }),
            getPhotosPillarPlanes: () => this.photosPillarPlanes,
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
                this.photosPillarPlanes.hide();
                this.photosInteraction.detach();
            },
        });
        this.theme = new WebGLTheme({
            getRectangleMaterials: () => this.rectangleMaterials,
            getPlateShaderMaterial: () => this.plateShaderMaterial,
            getPhotosPillarPlanes: () => this.photosPillarPlanes,
        });

        this.init();
        this.theme.apply();
        this.theme.attach();
        new WorksHoverController({
            plateContent: this.plateContent,
            getActiveSection: () => this.scroll.getActiveSection(),
        }).attach();
    }

    private get scene() {
        return this.context.scene;
    }

    private get camera() {
        return this.context.camera;
    }

    private startRenderLoop() {
        this.context.startRenderLoop({
            getPlateShaderMaterial: () => this.plateShaderMaterial,
            getWorksPlate: () => this.worksPlate,
            getGroupRectangles: () => this.groupRectangles,
            isPC: () => this.isPC,
            getActiveSection: () => this.scroll.getActiveSection(),
            getMouseUvTarget: () => this.mouseUvTarget,
            getPhotoPlanesGroup: () => this.photosPillarPlanes.group,
            onTick: (time) => this.theatre.tick(time),
            onFrameStart: () => {
                if (this.isDebug) this.debugPanel?.stats.begin();
            },
            onFrameEnd: () => {
                this.photosPillarPlanes.updateTransforms();
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

        this.theme.apply();
        this.scene.add(this.worksPlate);
        this.scene.add(this.photosPillarPlanes.group);

        bindWebGLSceneLayout(gsap.matchMedia(), {
            camera: this.camera,
            groupRectangles: this.groupRectangles,
            worksPlate: this.worksPlate,
            plateShaderMaterial: this.plateShaderMaterial,
            aboutConfig: this.aboutImageConfig,
            setIsPC: (v) => {
                this.isPC = v;
                // PC/SP それぞれのデフォルト Z を記録
                this.defaultCameraZ = v ? 5 : 18;
                this.defaultCameraX = 0;
                this.defaultCameraY = 0;
            },
        });

        this.scene.add(this.groupRectangles);

        new AboutPointerController({
            getWorksPlate: () => this.worksPlate,
            getCamera: () => this.camera,
            isPC: () => this.isPC,
            getActiveSection: () => this.scroll.getActiveSection(),
            mouseUvTarget: this.mouseUvTarget,
        }).attach();

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
        await this.theatre.playLoadingAnimation();

        await aboutImagePromise;
        await photosPromise;

        // photos ロード完了後にテーマ色を反映（ロード前に theme.apply が走っているため再実行）
        this.theme.apply();

        this.scroll.setActiveSection('works');
        this.scroll.attach();

        window.addEventListener('resize', () => this.context.resize());

        if (this.isDebug) {
            this.debugPanel = new WebGLDebugPanel({
                getGroupRectangles: () => this.groupRectangles,
                getRectangles: () => this.rectangles,
                getWorksPlate: () => this.worksPlate,
            });
        }
    }

    public setAboutImageConfig(partial: Partial<AboutImageConfig>) {
        Object.assign(this.aboutImageConfig, partial);
        if (!this.plateShaderMaterial) return;
        applyAboutImageUniforms(this.plateShaderMaterial, this.aboutImageConfig, this.isPC);
    }
}
