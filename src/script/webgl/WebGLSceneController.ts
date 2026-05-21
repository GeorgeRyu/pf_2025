import * as THREE from 'three';
import Stats from 'stats.js';
import { GUI } from 'lil-gui';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import SplitText from 'gsap/SplitText';
// import studio from "@theatre/studio";
import { getProject, types, type IProject, type ISheet } from "@theatre/core";
// シェーダーをインポート
import plateVertexShader from './shaders/plateVertex.glsl?raw';
import plateFragmentShader from './shaders/plateFragment.glsl?raw';

gsap.registerPlugin(ScrollTrigger, SplitText);

// worksPlate に表示するコンテンツ種別
// 将来 'image' の key を追加していくことで About / THX 等を共通APIで扱える
export type PlateContent =
    | { kind: 'video'; index: number }
    | { kind: 'image'; key: string };

// 現在アクティブなセクション。Works ホバーや UI 連動の出し分けに使う
export type ActiveSection =
    | 'loading'
    | 'works'
    | 'about'
    | 'photos'
    | 'playground'
    | 'thx';

export class WebGLSceneController {
    private renderer: THREE.WebGLRenderer;
    private container: HTMLElement | null;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private isDebug: boolean;
    private isTheaterEdit: boolean;
    private rectangles: THREE.Mesh[] = [];
    private rectangleMaterials: THREE.MeshBasicMaterial[] = [];
    private groupRectangles!: THREE.Group;
    private worksPlate!: THREE.Mesh;
    private stats!: Stats;
    private gui!: GUI;
    // ---- worksPlate コンテンツ管理 ----
    private movies: string[] = [];
    // 動画系
    private videos: HTMLVideoElement[] = [];
    private videoTextures: THREE.VideoTexture[] = [];
    // 画像系（About / THX 等で使う）
    private imageTextures: Map<string, THREE.Texture> = new Map();
    private imageElements: Map<string, HTMLImageElement> = new Map();
    // 現在/遷移中コンテンツ
    private currentContent: PlateContent | null = null;
    private pendingContent: PlateContent | null = null;
    private theatreProject!: IProject;
    private theatreSheet!: ISheet;
    // トランジション用
    private plateShaderMaterial!: THREE.ShaderMaterial;
    private currentTexture: THREE.Texture | null = null;
    private colorExtractCanvas: HTMLCanvasElement;
    private colorExtractCtx: CanvasRenderingContext2D;
    private transitionTween: gsap.core.Tween | null = null;
    private readonly THEME_CHANGE_EVENT = 'pf:color-theme-change';
    private sequenceLength: number = 20;

    // ---- セクションステート ----
    // どのエリア（Works / About / ...）にいるかを保持。Works ホバーのガード等に使用。
    private activeSection: ActiveSection = 'loading';

    // ---- アセットパス ----
    private static readonly ABOUT_IMAGE_URL = '/images/about/my-01.jpg';
    private static readonly ABOUT_IMAGE_KEY = 'about';

    // ---- 画像モード（About）の演出パラメータ ----
    // ※ ここを編集するとシェーダーへ反映される。runtime に setAboutImageConfig() でも変更可能。
    private aboutImageConfig = {
        baseReveal: 0.65,      // 全体の基準可視率 (0..1) ← 大きいほどはっきり、小さいほどうっすら
        noiseScale: 2.0,       // ノイズの粒度（大きいほど細かい）
        noiseSpeed: 0.4,      // ノイズが流れる速度
        mouseRadius: 0.3,     // PC: カーソルスポットの半径（UV単位 0..1）
        mouseSoftness: 1.75,   // PC: スポット境界のなめらかさ (0..1, 1=ふんわり)
        mousePcStrength: 0.5,  // PC時のカーソル強度（カーソル位置でフル可視に）
    };

    // ---- PC/SP 判定 + ポインタ追跡（PCカーソルスポット用） ----
    private isPC: boolean = false;
    private raycaster = new THREE.Raycaster();
    private pointerNdc = new THREE.Vector2();
    private mouseUvTarget = new THREE.Vector2(0.5, 0.5);
    private lastFrameTime: number = 0;
    
    constructor() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true });
        this.container = document.getElementById('webgl-container');
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

        this.isDebug = false;
        this.isTheaterEdit = true;
        
        // 色抽出用canvas（頻繁に読み取るのでwillReadFrequently: true）
        this.colorExtractCanvas = document.createElement('canvas');
        this.colorExtractCanvas.width = 8;
        this.colorExtractCanvas.height = 8;
        this.colorExtractCtx = this.colorExtractCanvas.getContext('2d', { willReadFrequently: true })!;

        // movies を data 属性から取得
        const moviesStr = this.container?.getAttribute('data-movies') || '';
        try {
            this.movies = moviesStr ? JSON.parse(decodeURIComponent(moviesStr)) : [];
        } catch (e) {
            this.movies = [];
        }

        this.init();
        this.applyAccentToWebGL();
        window.addEventListener(this.THEME_CHANGE_EVENT, () => this.applyAccentToWebGL());
        if (this.isDebug) this.debug();
        this.attachHoverHandlers();
        this.animate();
    }

    private readCssVarColor(varName: string, fallbackHex: string): THREE.Color {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        const value = raw || fallbackHex;
        try {
            return new THREE.Color(value);
        } catch {
            return new THREE.Color(fallbackHex);
        }
    }

    private applyAccentToWebGL() {
        const accent = this.readCssVarColor('--c-accent', '#000000');
        const base = this.readCssVarColor('--c-base', '#ffffff');

        // 各 rectangle のマテリアル（個別インスタンス）
        this.rectangleMaterials.forEach((m) => m.color.copy(accent));

        // works plate (shader)
        if (this.plateShaderMaterial?.uniforms?.baseColor) {
            const u = this.plateShaderMaterial.uniforms;
            (u.baseColor.value as THREE.Color).copy(accent);
            // About 画像のデュオトーン: 明部=base, 暗部=accent
            (u.duotoneLight.value as THREE.Color).copy(base);
            (u.duotoneDark.value as THREE.Color).copy(accent);
        }
    }

    async init() {
        // レンダラーの設定
        let mmInit = gsap.matchMedia();

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x000000, 0);
        if (this.container) {
            this.container.appendChild(this.renderer.domElement);
        }

        // 四角柱を作成（ステンシルマスク用）
        // 将来 Photos/Playground で各柱の手前フェイスに個別テクスチャを当てるため、
        // material は共有せず 1本ずつ独立インスタンスにしておく。
        const geometry = new THREE.BoxGeometry(2, 35, 1.1256);

        for (let i = 0; i < 7; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: 0x000000,
                side: THREE.DoubleSide
            });
            this.rectangleMaterials.push(material);

            const mesh = new THREE.Mesh(geometry, material);
            mesh.rotation.z = Math.PI / 12 * i;
            mesh.scale.z = 0.01;
            this.rectangles.push(mesh);
        }
        this.groupRectangles = new THREE.Group();
        this.groupRectangles.add(...this.rectangles);
        
        // works plateを作成（マスクされる側）
        const worksPlateGeometry = new THREE.PlaneGeometry(38, 38);
        
        // トランジション用ShaderMaterial
        this.plateShaderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                textureA: { value: null },
                textureB: { value: null },
                colorA: { value: new THREE.Color(0, 0, 0) },
                colorB: { value: new THREE.Color(0, 0, 0) },
                baseColor: { value: new THREE.Color(0, 0, 0) },
                progress: { value: 0.0 },
                useTexture: { value: 0.0 },
                fadeOutProgress: { value: 0.0 },
                time: { value: 0.0 },
                uvScaleA: { value: new THREE.Vector2(1, 1) },
                uvOffsetA: { value: new THREE.Vector2(0, 0) },
                uvScaleB: { value: new THREE.Vector2(1, 1) },
                uvOffsetB: { value: new THREE.Vector2(0, 0) },
                // --- 画像モード（About） ---
                imageMode:          { value: 0.0 },
                imageBaseReveal:    { value: this.aboutImageConfig.baseReveal },
                imageNoiseScale:    { value: this.aboutImageConfig.noiseScale },
                imageNoiseSpeed:    { value: this.aboutImageConfig.noiseSpeed },
                imageMouseUv:       { value: new THREE.Vector2(0.5, 0.5) },
                imageMouseStrength: { value: 0.0 },   // PC判定後に上書き
                imageMouseRadius:   { value: this.aboutImageConfig.mouseRadius },
                imageMouseSoftness: { value: this.aboutImageConfig.mouseSoftness },
                // --- デュオトーン（テーマ連動） ---
                duotoneLight: { value: new THREE.Color(1, 1, 1) },
                duotoneDark:  { value: new THREE.Color(0, 0, 0) },
            },
            vertexShader: plateVertexShader,
            fragmentShader: plateFragmentShader,
            side: THREE.DoubleSide,
            transparent: true
        });

        // テーマカラー（baseColor / duotone）を shader に反映
        this.applyAccentToWebGL();
        
        this.worksPlate = new THREE.Mesh(worksPlateGeometry, this.plateShaderMaterial);
        this.worksPlate.scale.set(1, 1, 1);
        this.worksPlate.rotation.set(0, 0, 0);
        this.scene.add(this.worksPlate);
        
        mmInit.add('(max-width: 1023px)', () => {
            this.camera.position.z = 18;
            this.groupRectangles.position.set(-9, -3.5, -15);
            this.worksPlate.position.set(-9, -3.5, -16);
            this.isPC = false;
            this.plateShaderMaterial.uniforms.imageMouseStrength.value = 0.0;
        });

        mmInit.add('(min-width: 1024px)', () => {
            this.camera.position.z = 5;
            this.groupRectangles.position.set(-17, -6, -15);
            this.worksPlate.position.set(-18, -4.5, -19);
            this.isPC = true;
            this.plateShaderMaterial.uniforms.imageMouseStrength.value = this.aboutImageConfig.mousePcStrength;
        });

        this.scene.add(this.groupRectangles);

        // PCのみ pointermove でカーソル UV をトラッキング
        window.addEventListener('pointermove', this.onPointerMove);

        // About 画像を事前ロード（Theatre 初期化と並列）
        const aboutImagePromise = this.loadImageTexture(
            WebGLSceneController.ABOUT_IMAGE_KEY,
            WebGLSceneController.ABOUT_IMAGE_URL
        ).catch((err) => {
            console.warn('⚠️ Failed to load about image:', err);
        });

        await this.initTheatre();
        // ローディングアニメーション（0% → 20%）を再生
        await this.playLoadingAnimation();

        // ローディング完了 → Works が初期セクション
        this.activeSection = 'works';

        // 画像ロード完了を待つ（scrollAnimations 内でトリガーするため）
        await aboutImagePromise;

        this.scrollAnimations();

        window.addEventListener('resize', this.onWindowResize.bind(this));
    }


    async initTheatre() {
        // Studio UIは開発時のみ
        // if (this.isTheaterEdit) {
        //     studio.initialize();
        // }
    
        // 初期画面サイズでPC/SP判定
        const isMobile = window.innerWidth <= 1023;
        const projectName = isMobile ? 'sevenLinesMotionSP' : 'sevenLinesMotionPC';        
        let projectState = null;
        
        try {
            if (isMobile) {
                // SP用JSONを読み込む（存在する場合）
                const spData = await import('../../json/spAnimation.json');
                projectState = spData.default;
                console.log('📱 SP animation will be loaded (when available)');
            } else {
                // PC用JSONを読み込む
                const pcData = await import('../../json/pcAnimation.json');
                projectState = pcData.default;
                console.log('💻 PC animation JSON loaded');
            }
        } catch (error) {
            console.error('❌ Failed to load animation JSON:', error);
        }
    
        // JSONがある場合は読み込んで、ない場合は新規作成
        if (projectState) {
            console.log('✅ Loading project with saved state');
            this.theatreProject = getProject(projectName, { state: projectState });
        } else {
            console.log('🆕 Creating new project (no saved state)');
            this.theatreProject = getProject(projectName);
        }
    
        // シート名はJSON内のシート名を使用
        const sheetName = projectState?.sheetsById 
            ? Object.keys(projectState.sheetsById)[0] 
            : 'sevenLinesMotion';
        
        console.log('📄 Sheet name:', sheetName);
        
        this.theatreSheet = this.theatreProject.sheet(sheetName);
        
        console.log('sheet: ', this.theatreSheet);

        // project.readyで読み込み完了を待つ
        await this.theatreProject.ready;

        // シーケンス長を設定
        if (projectState?.sheetsById?.[sheetName]?.sequence?.length) {
            this.sequenceLength = projectState.sheetsById[sheetName].sequence.length;
        }
        console.log('📏 Sequence length:', this.sequenceLength);

        console.log('🔢 sequenceLength:', this.sequenceLength, typeof this.sequenceLength);
        const loadingEndPosition = Number(this.sequenceLength) * 0.2;
        console.log('🎬 Loading animation: 0 → ', loadingEndPosition, typeof loadingEndPosition);        

        console.log('📏 Sequence length:', this.sequenceLength);

        // オブジェクトをTheatre.jsにバインド
        this.bindObject3D("groupRectangles", this.groupRectangles);
        this.rectangles.forEach((rect, i) => {
            this.bindObject3D(`rac${i + 1}`, rect);
        });
        this.bindObject3D("worksPlate", this.worksPlate);
        
        console.log('✅ Theatre.js binding complete');
        

    }

    // ローディングアニメーションを再生
    async playLoadingAnimation() {
        const loadingEndPosition = this.sequenceLength * 0.2; // 20%の位置（20秒 * 0.2 = 4秒）
        console.log('🎬 Loading animation: 0 → ', loadingEndPosition);
    
        // Theatre.jsの位置を0に設定
        this.theatreSheet.sequence.position = 0;
        
        // GSAPで0秒から20%の位置（4秒）まで自動アニメーション
        return new Promise<void>((resolve) => {
            const positionObj = { value: 0 };
            gsap.to(positionObj, {
                value: loadingEndPosition, // 0.2ではなく、4（= 20 * 0.2）
                duration: 5, // 2秒かけてアニメーション
                onUpdate: () => {
                    this.theatreSheet.sequence.position = positionObj.value;
                    // console.log('Position:', positionObj.value);
                },
                onComplete: () => {
                    // console.log('✅ Loading animation complete at position:', loadingEndPosition);
                    resolve();
                }
            });
        });
    }


    // 例：Theatreの値 → THREE.Object3Dへ反映するバインド
    bindObject3D(name: string, obj: THREE.Object3D) {
        const tObj = this.theatreSheet.object(name, {
        position: types.compound({
            x: types.number(obj.position.x, { range: [-50, 50] }),
            y: types.number(obj.position.y, { range: [-50, 50] }),
            z: types.number(obj.position.z, { range: [-50, 50] }),
        }),
        rotation: types.compound({
            x: types.number(obj.rotation.x, { range: [-Math.PI*2, Math.PI*2] }),
            y: types.number(obj.rotation.y, { range: [-Math.PI*2, Math.PI*2] }),
            z: types.number(obj.rotation.z, { range: [-Math.PI*2, Math.PI*2] }),
        }),
        scale: types.compound({
            x: types.number(obj.scale.x, { range: [0, 5] }),
            y: types.number(obj.scale.y, { range: [0, 5] }),
            z: types.number(obj.scale.z, { range: [0, 5] }),
        }),
        });
    
        // GUI操作で値が変わったらTHREE側へ反映
        return tObj.onValuesChange((v) => {
            obj.position.set(v.position.x, v.position.y, v.position.z);
            obj.rotation.set(v.rotation.x, v.rotation.y, v.rotation.z);
            obj.scale.set(v.scale.x, v.scale.y, v.scale.z);
        });
    }    

    // =========================================================
    //  worksPlate コンテンツ（動画 / 画像）共通API
    // =========================================================

    /** 動画要素・テクスチャを必要時に初期化（初回 show 時に呼ばれる） */
    private ensureVideosPrepared() {
        if (this.videos.length || !this.movies.length) return;

        const videoCount = this.movies.length;
        for (let i = 0; i < videoCount; i++) {
            const url = this.movies[i];
            const video = document.createElement('video');
            video.src = url;
            video.muted = true;
            video.loop = true;
            (video as any).playsInline = true;
            video.preload = 'auto';
            video.crossOrigin = 'anonymous';
            this.videos.push(video);

            const plateTex = new THREE.VideoTexture(video);
            plateTex.colorSpace = THREE.SRGBColorSpace;
            plateTex.wrapS = THREE.ClampToEdgeWrapping;
            plateTex.wrapT = THREE.ClampToEdgeWrapping;
            this.videoTextures.push(plateTex);
        }
    }

    /** 画像を読み込み、key で参照できるよう登録（About 等のセットアップで呼ぶ） */
    protected loadImageTexture(key: string, url: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const loader = new THREE.TextureLoader();
            loader.setCrossOrigin('anonymous');
            loader.load(
                url,
                (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.wrapS = THREE.ClampToEdgeWrapping;
                    texture.wrapT = THREE.ClampToEdgeWrapping;
                    this.imageTextures.set(key, texture);
                    const img = texture.image as HTMLImageElement;
                    if (img) this.imageElements.set(key, img);
                    resolve();
                },
                undefined,
                (err) => reject(err)
            );
        });
    }

    /** PlateContent からテクスチャと色抽出元の HTMLElement を取り出す。未準備なら null */
    private resolveContent(content: PlateContent):
        | { texture: THREE.Texture; source: HTMLVideoElement | HTMLImageElement }
        | null {
        if (content.kind === 'video') {
            this.ensureVideosPrepared();
            const tex = this.videoTextures[content.index];
            const el = this.videos[content.index];
            if (!tex || !el) return null;
            return { texture: tex, source: el };
        } else {
            const tex = this.imageTextures.get(content.key);
            const el = this.imageElements.get(content.key);
            if (!tex || !el) return null;
            return { texture: tex, source: el };
        }
    }

    private isSameContent(a: PlateContent | null, b: PlateContent | null): boolean {
        if (!a || !b) return a === b;
        if (a.kind !== b.kind) return false;
        if (a.kind === 'video' && b.kind === 'video') return a.index === b.index;
        if (a.kind === 'image' && b.kind === 'image') return a.key === b.key;
        return false;
    }

    /** 動画コンテンツのみ再生開始（画像は no-op） */
    private playContent(content: PlateContent) {
        if (content.kind !== 'video') return;
        const v = this.videos[content.index];
        if (!v) return;
        try { v.currentTime = 0; } catch (e) {}
        v.loop = true;
        v.play().catch(() => {});
    }

    /** 動画コンテンツのみ一時停止（画像は no-op） */
    private pauseContent(content: PlateContent | null) {
        if (!content || content.kind !== 'video') return;
        this.videos[content.index]?.pause();
    }

    /** plate(1:1) に対する cover 相当の UV scale/offset を計算 */
    private calcUVTransform(source: HTMLVideoElement | HTMLImageElement) {
        const plateAspect = 1;
        let w = 0, h = 0;
        if (source instanceof HTMLVideoElement) {
            w = source.videoWidth;
            h = source.videoHeight;
        } else {
            w = source.naturalWidth;
            h = source.naturalHeight;
        }
        const aspect = (w && h) ? (w / h) : (16 / 9);

        if (aspect > plateAspect) {
            const scale = plateAspect / aspect;
            return { scale: new THREE.Vector2(scale, 1), offset: new THREE.Vector2((1 - scale) / 2, 0) };
        } else {
            const scale = aspect / plateAspect;
            return { scale: new THREE.Vector2(1, scale), offset: new THREE.Vector2(0, (1 - scale) / 2) };
        }
    }

    /** ソース（動画/画像）からドミナントカラーを抽出 */
    private getDominantColor(source: HTMLVideoElement | HTMLImageElement): THREE.Color {
        try {
            this.colorExtractCtx.drawImage(source as CanvasImageSource, 0, 0, 8, 8);
            const imageData = this.colorExtractCtx.getImageData(0, 0, 8, 8).data;
            let r = 0, g = 0, b = 0;
            const pixelCount = 64;
            for (let i = 0; i < imageData.length; i += 4) {
                r += imageData[i];
                g += imageData[i + 1];
                b += imageData[i + 2];
            }
            return new THREE.Color(r / pixelCount / 255, g / pixelCount / 255, b / pixelCount / 255);
        } catch (e) {
            return new THREE.Color(0.5, 0.5, 0.5);
        }
    }

    /**
     * worksPlate に動画/画像を表示する（ドット → 解像 のリビールで遷移）
     * @param next 表示したいコンテンツ
     * @param opts duration / ease を上書き可能
     */
    private showContentOnPlate(next: PlateContent, opts?: { duration?: number; ease?: string }) {
        console.log('🎬 showContentOnPlate', next);

        const resolved = this.resolveContent(next);
        if (!resolved) return;

        if (this.isSameContent(this.currentContent, next)) return;

        const duration = opts?.duration ?? 1.0;
        const ease = opts?.ease ?? 'power2.out';

        // 進行中の tween があれば中断
        if (this.transitionTween) {
            this.transitionTween.kill();
            this.transitionTween = null;

            // pending（再生中だが未完了の動画）が別ターゲットなら停止
            if (this.pendingContent && !this.isSameContent(this.pendingContent, next)) {
                console.log('🛑 Stopping pending content:', this.pendingContent);
                this.pauseContent(this.pendingContent);
            }
            this.pendingContent = null;
        }

        const uniforms = this.plateShaderMaterial.uniforms;

        // fadeOut の途中なら現在コンテンツを破棄
        if (uniforms.fadeOutProgress.value > 0 && this.currentContent) {
            console.log('🛑 Stopping fadeOut content:', this.currentContent);
            this.pauseContent(this.currentContent);
            this.currentTexture = null;
            this.currentContent = null;
        }

        const nextTexture = resolved.texture;
        const nextSource = resolved.source;

        this.playContent(next);
        this.worksPlate.material = this.plateShaderMaterial;

        const nextUV = this.calcUVTransform(nextSource);

        const prevTexture = this.currentTexture || nextTexture;
        const prevContent = this.currentContent;
        const prevResolved = prevContent ? this.resolveContent(prevContent) : null;
        const prevSource = prevResolved?.source ?? nextSource;
        const prevUV = this.calcUVTransform(prevSource);

        const prevColor = prevResolved
            ? this.getDominantColor(prevResolved.source)
            : new THREE.Color(0, 0, 0);
        const nextColor = this.getDominantColor(nextSource);

        uniforms.textureA.value = prevTexture;
        uniforms.textureB.value = nextTexture;
        uniforms.uvScaleA.value = prevUV.scale;
        uniforms.uvOffsetA.value = prevUV.offset;
        uniforms.uvScaleB.value = nextUV.scale;
        uniforms.uvOffsetB.value = nextUV.offset;
        uniforms.colorA.value = prevColor;
        uniforms.colorB.value = nextColor;
        uniforms.useTexture.value = 1.0;
        uniforms.progress.value = 0.0;
        uniforms.fadeOutProgress.value = 0.0;
        // imageMode: 画像コンテンツの場合のみ ON（うっすら表示 + カーソルスポット）
        uniforms.imageMode.value = next.kind === 'image' ? 1.0 : 0.0;

        const progressObj = { value: 0.0 };
        const prevContentSnapshot = prevContent;

        this.pendingContent = next;

        console.log('🎬 Starting transition', { from: prevContent, to: next });

        this.transitionTween = gsap.to(progressObj, {
            value: 1.0,
            duration,
            ease,
            onUpdate: () => {
                uniforms.progress.value = progressObj.value;
            },
            onComplete: () => {
                console.log('✅ Transition complete');
                this.pauseContent(prevContentSnapshot);
                this.currentTexture = nextTexture;
                this.currentContent = next;
                this.pendingContent = null;
                this.transitionTween = null;
            }
        });
    }

    /** worksPlate を baseColor へフェードアウトしてクリア */
    private clearPlate(opts?: { duration?: number; ease?: string }) {
        const duration = opts?.duration ?? 1.0;
        const ease = opts?.ease ?? 'power2.out';

        if (this.transitionTween) {
            this.transitionTween.kill();
            this.transitionTween = null;

            if (this.pendingContent) {
                console.log('🛑 Promoting pending to current for fadeout:', this.pendingContent);
                this.currentContent = this.pendingContent;
                const resolved = this.resolveContent(this.pendingContent);
                this.currentTexture = resolved?.texture ?? null;
                this.pendingContent = null;
            }
        }

        const uniforms = this.plateShaderMaterial.uniforms;

        if (this.currentTexture && this.currentContent) {
            const resolved = this.resolveContent(this.currentContent);
            const currentColor = resolved
                ? this.getDominantColor(resolved.source)
                : new THREE.Color(0, 0, 0);
            const currentContentSnapshot = this.currentContent;

            uniforms.colorA.value = currentColor;
            uniforms.colorB.value = new THREE.Color(0, 0, 0);
            uniforms.fadeOutProgress.value = 0.0;

            const fadeObj = { value: 0.0 };

            console.log('🌙 Starting fade out');

            this.transitionTween = gsap.to(fadeObj, {
                value: 1.0,
                duration,
                ease,
                onUpdate: () => {
                    uniforms.fadeOutProgress.value = fadeObj.value;
                },
                onComplete: () => {
                    console.log('⬛ Fade out complete');
                    this.pauseContent(currentContentSnapshot);
                    this.currentTexture = null;
                    this.currentContent = null;
                    uniforms.progress.value = 0.0;
                    uniforms.fadeOutProgress.value = 0.0;
                    uniforms.useTexture.value = 0.0;
                    uniforms.imageMode.value = 0.0;
                    this.transitionTween = null;
                }
            });
        } else {
            uniforms.useTexture.value = 0.0;
            uniforms.fadeOutProgress.value = 0.0;
            uniforms.imageMode.value = 0.0;
            this.currentContent = null;
        }
    }

    private attachHoverHandlers() {
        const worksInfo = document.querySelector('[data-name="works-info"]');
        if (!worksInfo) return;

        let items = worksInfo.querySelectorAll('.js-project-modal-btn');
        if (!items || items.length === 0) {
            items = worksInfo.querySelectorAll('.project-link');
        }

        items.forEach((el, idx) => {
            const show = () => {
                // Works セクション中だけ反応（About 等では強制表示を維持）
                if (this.activeSection !== 'works') return;
                this.showContentOnPlate({ kind: 'video', index: idx });
            };
            const clear = () => {
                if (this.activeSection !== 'works') return;
                this.clearPlate();
            };
            el.addEventListener('mouseenter', show);
            el.addEventListener('mouseleave', clear);
            el.addEventListener('focus', show);
            el.addEventListener('blur', clear);
        });
    }

    // =========================================================
    //  カーソル追跡（PC: About 画像のスポットリビール用）
    // =========================================================

    private onPointerMove = (e: PointerEvent) => {
        // PC かつ About 中のみレイキャストして UV を取得
        if (!this.isPC || this.activeSection !== 'about') return;
        if (!this.worksPlate) return;

        this.pointerNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.pointerNdc.y = -(e.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.pointerNdc, this.camera);
        const hits = this.raycaster.intersectObject(this.worksPlate, false);
        if (hits.length > 0 && hits[0].uv) {
            this.mouseUvTarget.copy(hits[0].uv);
        }
    };

    /**
     * About 画像演出のチューニング用 API（runtime からも呼べる）
     * 例: webglScene.setAboutImageConfig({ baseReveal: 0.2 })
     */
    public setAboutImageConfig(partial: Partial<typeof this.aboutImageConfig>) {
        Object.assign(this.aboutImageConfig, partial);
        if (!this.plateShaderMaterial) return;
        const u = this.plateShaderMaterial.uniforms;
        u.imageBaseReveal.value = this.aboutImageConfig.baseReveal;
        u.imageNoiseScale.value = this.aboutImageConfig.noiseScale;
        u.imageNoiseSpeed.value = this.aboutImageConfig.noiseSpeed;
        u.imageMouseRadius.value = this.aboutImageConfig.mouseRadius;
        u.imageMouseSoftness.value = this.aboutImageConfig.mouseSoftness;
        u.imageMouseStrength.value = this.isPC ? this.aboutImageConfig.mousePcStrength : 0.0;
    }

    // =========================================================
    //  セクション遷移ハンドラ
    // =========================================================

    /** About エリアに入った時：画像を fadeIn 表示し、Works ホバーを無効化 */
    private enterAboutZone() {
        if (this.activeSection === 'about') return;
        this.activeSection = 'about';
        this.showContentOnPlate(
            { kind: 'image', key: WebGLSceneController.ABOUT_IMAGE_KEY },
            { duration: 1.8, ease: 'power3.out' }
        );
    }

    /**
     * About エリアから抜けた時：プレートをクリアし、進行方向に応じた次セクションへ。
     * - backward: Works に戻る（ホバー再有効化）
     * - forward : Photos へ向かう（プレートは引き続き出さない）
     */
    private leaveAboutZone(direction: 'forward' | 'backward') {
        // 既に About 以外なら何もしない（多重発火対策）
        if (this.activeSection !== 'about') return;
        this.activeSection = direction === 'backward' ? 'works' : 'photos';
        this.clearPlate({ duration: 1.2 });
    }

    scrollAnimations() {
        const distanceHeight = window.innerHeight * 1.5;
        const body = document.querySelector('body');
        const sequenceLength = this.sequenceLength;

            // groupRectangles = this.groupRectangles,
            // rac1 = this.rectangles[0],
            // rac2 = this.rectangles[1],
            // rac3 = this.rectangles[2],
            // rac4 = this.rectangles[3],
            // rac5 = this.rectangles[4],
            // rac6 = this.rectangles[5],
            // rac7 = this.rectangles[6],
            // worksPlate = this.worksPlate;

        // 20%以降の4つのセクションを定義
        const sections = [
            { start: 0.2, end: 0.4, scrollStart: distanceHeight * 0.5, scrollEnd: distanceHeight * 2 },
            { start: 0.4, end: 0.6, scrollStart: distanceHeight * 2.5, scrollEnd: distanceHeight * 4 },
            { start: 0.6, end: 0.8, scrollStart: distanceHeight * 4.5, scrollEnd: distanceHeight * 6 },
            { start: 0.8, end: 1.0, scrollStart: distanceHeight * 6.5, scrollEnd: distanceHeight * 8 }
        ];
        sections.forEach((section, index) => {
            ScrollTrigger.create({
                trigger: body,
                start: `${section.scrollStart} top`,
                end: `${section.scrollEnd} top`,
                scrub: 1.5,
                markers: false,
                onUpdate: (self) => {
                    const progress = self.progress;
                    const theatreStart = section.start * sequenceLength;
                    const theatreEnd = section.end * sequenceLength;
                    const theatrePosition = theatreStart + (theatreEnd - theatreStart) * progress;
                    
                    this.theatreSheet.sequence.position = theatrePosition;
                }
            });
        });

        // ----- About 区間のコンテンツ切替 -----
        // 「About に到着したタイミング」で fadeIn したいので、
        // sections[0]（Works→About 遷移）の完了 ～ sections[1]（About→Photos 遷移）の開始までの
        // 「停留ゾーン」をトリガー範囲とする。
        const aboutZoneStart = sections[0].scrollEnd;
        const aboutZoneEnd = sections[1].scrollStart;
        ScrollTrigger.create({
            trigger: body,
            start: `${aboutZoneStart} top`,
            end: `${aboutZoneEnd} top`,
            markers: false,
            onEnter: () => this.enterAboutZone(),
            onEnterBack: () => this.enterAboutZone(),
            onLeave: () => this.leaveAboutZone('forward'),
            onLeaveBack: () => this.leaveAboutZone('backward')
        });

            // tlWorkToAbout = gsap.timeline({
            //     scrollTrigger: {
            //         trigger: body,
            //         start: `${distanceHeight} bottom-=10%`,
            //         end: `${distanceHeight * 2} center`,
            //         scrub: true,
            //         markers: false
            //     }
            // }),
            // tlAboutToPhotos = gsap.timeline({
            //     scrollTrigger: {
            //         trigger: body,
            //         start: `${distanceHeight * 3.5} bottom`,
            //         end: `${distanceHeight * 4} center`,
            //         scrub: true,
            //         markers: false,
            //     }
            // }),
            // tlPhotosToPlayground = gsap.timeline({
            //     scrollTrigger: {
            //         trigger: body,
            //         start: `${distanceHeight * 5.5} bottom`,
            //         end: `${distanceHeight * 6} center`,
            //         scrub: true,
            //         markers: false
            //     }
            // });

        let mm = gsap.matchMedia();

        // this.bindObject3D("groupRectangles", this.groupRectangles);
        // // rectangles（rac1〜rac7）
        // this.rectangles.forEach((m, i) => {
        //     this.bindObject3D(`rac${i + 1}`, m);
        // });
        // // worksPlate
        // this.bindObject3D("worksPlate", this.worksPlate);


        // mm.add('(max-width: 1023px)', () => {
        //     tlWorkToAbout
        //         .to(rac1.position, { x: 4, duration: 1, ease: 'easeOut01' })
        //         .to(rac2.position, { x: 1.8, duration: 1, ease: 'easeOut01' }, '0.2')
        //         .to(rac2.rotation, { z: 0, duration: 1, ease: 'easeOut01' }, '<')
        //         .to(rac3.position, { x: -0.4, duration: 1, ease: 'easeOut01' }, '0.4')
        //         .to(rac3.rotation, { z: 0, duration: 1, ease: 'easeOut01' }, '<')
        //         .to(rac4.position, { x: -2.6, duration: 1, ease: 'easeOut01' }, '0.6')
        //         .to(rac4.rotation, { z: 0, duration: 1, ease: 'easeOut01' }, '<')
        //         .to(rac5.position, { x: -4.8, duration: 1, ease: 'easeOut01' }, '0.8')
        //         .to(rac5.rotation, { z: 0, duration: 1, ease: 'easeOut01' }, '<')
        //         .to(rac6.position, { x: -7, duration: 1, ease: 'easeOut01' }, '1')
        //         .to(rac6.rotation, { z: 0, duration: 1, ease: 'easeOut01' }, '<')
        //         .to(rac7.position, { x: -9.2, duration: 1, ease: 'easeOut01' }, '1.2')
        //         .to(rac7.rotation, { z: 0, duration: 1, ease: 'easeOut01' }, '<')
        //         .to(groupRectangles.position, { x: -13.5, y: -13, z: 10, duration: 1.8, ease: 'easeOut01' }, '0.8')
        //         .to(groupRectangles.rotation, { z: -0.7, duration: 1.8, ease: 'easeOut01' }, '<')
        //         .to(worksPlate.position, {y: -6, z: -10, duration: 0.5, ease: 'easeOut01' }, '<')
        //         .to(worksPlate.position, {x: -10, y: -11.0, z: -21, duration: 1.1, ease: 'easeIn01' })
        //         ;

        //     tlAboutToPhotos
        //         .to([rac1.position, rac2.position, rac3.position, rac4.position, rac5.position, rac6.position, rac7.position], { y: 5, duration: 1, ease: 'easeOut01', stagger: 0.1 })
        //         .to(groupRectangles.position, { x: 1, y: -1, z: 10, duration: 1.5, ease: 'power3.inOut' }, '<')
        //         .to(worksPlate.position, {x: 0, y: 0, z: 0, duration: 1.0, ease: 'easeOut01' }, '<')
        //         .to(rac1.position, { x: 5, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac2.position, { x: 3, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac3.position, { x: 1, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac4.position, { x: -1, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac5.position, { x: -3, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac6.position, { x: -5, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac7.position, { x: -7, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(groupRectangles.rotation, { z: 0, x: (Math.PI / 2), duration: 1.5, ease: 'power3.inOut' })
        //         .to(groupRectangles.scale, { y: 0.001, duration: 1.5, ease: 'easeOut01' }, '<')
        //         .to(groupRectangles.position, { y: -1.8, z: 4, duration: 1.5, ease: 'easeOut01' }, '<')
        //         .to([rac1.scale, rac2.scale, rac3.scale, rac4.scale, rac5.scale, rac6.scale, rac7.scale], { z: 1, duration: 1, ease: 'easeOut01' }, '1.2')
        //         .to(rac1.position, { x: 5.3, duration: 1.5, ease: 'power3.out' })
        //         .to(rac2.position, { x: 3.2, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac3.position, { x: 1.1, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac4.position, { x: -1, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac5.position, { x: -3.1, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac6.position, { x: -5.2, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac7.position, { x: -7.3, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(groupRectangles.position, { z: 8.6, duration: 1.5, ease: 'easeOut01' })
        //         .to(rac2.position, { x: -2.1, z: 0.7628, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac6.position, { x: 0.1, z: -1.8884, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac1.position, { x: 0.1, z: 0.7628, duration: 1.5, ease: 'power3.out' }, '<+=0.075')
        //         .to(rac7.position, { x: -2.1, z: -1.8884, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac3.position, { x: 1.2, z: -0.5628, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac4.position, { x: -1, z: -0.5628, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac5.position, { x: -3.2, z: -0.5628, duration: 1.5, ease: 'power3.out' }, '<');

        //     tlPhotosToPlayground  
        //         .to(groupRectangles.position, { z: -10, y: -6, duration: 1.5, ease: 'power3.inOut' })
        //         .to(groupRectangles.scale, { y: 1, duration: 1.5, ease: 'power3.inOut' }, '<') 
        //         .to(rac7.position, { z: 3.485, x: 0, duration: 1, ease: 'power3.inOut' }, '0.3')
        //         .to(rac7.rotation, { z: Math.PI / -2, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac7.scale, { x: 0.001, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac6.position, { z: 2.135, x: 0, duration: 1, ease: 'power3.inOut' }, '<+0.1')
        //         .to(rac6.rotation, { z: Math.PI / -2, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac6.scale, { x: 0.001, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac5.position, { z: 0.7825, x: 0, duration: 1, ease: 'power3.inOut' }, '<+0.1')
        //         .to(rac5.rotation, { z: Math.PI / -2, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac5.scale, { x: 0.001, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac4.position, { z: -0.5625, x: 0, duration: 1, ease: 'power3.inOut' }, '<+0.1')
        //         .to(rac4.rotation, { z: Math.PI / -2, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac4.scale, { x: 0.001, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac3.position, { z: -1.9125, x: 0, duration: 1, ease: 'power3.inOut' }, '<+0.1')
        //         .to(rac3.rotation, { z: Math.PI / -2, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac3.scale, { x: 0.001, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac2.position, { z: -3.2625, x: 0, duration: 1, ease: 'power3.inOut' }, '<+0.1')
        //         .to(rac2.rotation, { z: Math.PI / -2, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac2.scale, { x: 0.001, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac1.position, { z: -4.6215, x: 0, duration: 1, ease: 'power3.inOut' }, '<+0.1')
        //         .to(rac1.rotation, { z: Math.PI / -2, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac1.scale, { x: 0.001, duration: 1, ease: 'power3.inOut' }, '<')

        //         .to(groupRectangles.position, { z: 0, y: -4.5, duration: 1.5, ease: 'power3.inOut' })
        //         .to(rac4.position, { x: -14.5, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to([rac3.position, rac5.position], { x: -17, duration: 1, ease: 'power3.inOut' }, '<+0.1')
        //         .to([rac2.position, rac6.position], { x: -19.5, duration: 1, ease: 'power3.inOut' }, '<+0.1')
        //         .to([rac1.position, rac7.position], { x: -22, duration: 1, ease: 'power3.inOut' }, '<+0.1');
        // });

        // mm.add('(min-width: 1024px)', () => {
        //     tlWorkToAbout
        //         .to(rac1.position, { x: 4, duration: 1, ease: 'easeOut01' })
        //         .to(rac2.position, { x: 1.8, duration: 1, ease: 'easeOut01' }, '0.2')
        //         .to(rac2.rotation, { z: 0, duration: 1, ease: 'easeOut01' }, '<')
        //         .to(rac3.position, { x: -0.4, duration: 1, ease: 'easeOut01' }, '0.4')
        //         .to(rac3.rotation, { z: 0, duration: 1, ease: 'easeOut01' }, '<')
        //         .to(rac4.position, { x: -2.6, duration: 1, ease: 'easeOut01' }, '0.6')
        //         .to(rac4.rotation, { z: 0, duration: 1, ease: 'easeOut01' }, '<')
        //         .to(rac5.position, { x: -4.8, duration: 1, ease: 'easeOut01' }, '0.8')
        //         .to(rac5.rotation, { z: 0, duration: 1, ease: 'easeOut01' }, '<')
        //         .to(rac6.position, { x: -7, duration: 1, ease: 'easeOut01' }, '1')
        //         .to(rac6.rotation, { z: 0, duration: 1, ease: 'easeOut01' }, '<')
        //         .to(rac7.position, { x: -9.2, duration: 1, ease: 'easeOut01' }, '1.2')
        //         .to(rac7.rotation, { z: 0, duration: 1, ease: 'easeOut01' }, '<')
        //         .to(groupRectangles.position, { x: -12.32, y: -14, z: 1.6, duration: 1.8, ease: 'easeOut01' }, '0.8')
        //         .to(groupRectangles.rotation, { z: -0.50265, duration: 1.8, ease: 'easeOut01' }, '<')
        //         .to(worksPlate.position, { x: -15.5, y: -1.2, z: -19, duration: 0.6, ease: 'easeOut01' }, '<')
        //         .to(worksPlate.position, { x: -14.8, y: -5.5, z: -19, duration: 0.6, ease: 'easeIn01' })
        //         ;

        //     tlAboutToPhotos
        //         .to([rac1.position, rac2.position, rac3.position, rac4.position, rac5.position, rac6.position, rac7.position], { y: 5, duration: 1, ease: 'easeOut01', stagger: 0.1 })
        //         .to(groupRectangles.position, { x: 1, y: -1, z: -0.9, duration: 1.5, ease: 'power3.inOut' }, '<')
        //         .to(worksPlate.position, { x: 0, y: 0, z: -6.0, duration: 0.9, ease: 'easeOut01' }, '<')
        //         .to(rac1.position, { x: 5, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac2.position, { x: 3, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac3.position, { x: 1, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac4.position, { x: -1, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac5.position, { x: -3, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac6.position, { x: -5, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac7.position, { x: -7, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(groupRectangles.rotation, {x: (Math.PI / 2), z: 0, duration: 1.5, ease: 'power3.inOut' })
        //         .to(groupRectangles.scale, { y: 0.001, duration: 1.5, ease: 'easeOut01' }, '<')
        //         .to(groupRectangles.position, { y: -0.7, z: 1.66, duration: 1.5, ease: 'easeOut01' }, '<')
        //         .to([rac1.scale, rac2.scale, rac3.scale, rac4.scale, rac5.scale, rac6.scale, rac7.scale], { z: 1, duration: 1, ease: 'easeOut01' }, '1.2')
        //         .to(rac1.position, { x: 5.3, duration: 1.5, ease: 'power3.out' })
        //         .to(rac2.position, { x: 3.2, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac3.position, { x: 1.1, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac4.position, { x: -1, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac5.position, { x: -3.1, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac6.position, { x: -5.2, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac7.position, { x: -7.3, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac1.position, { x: 2.6, z: -0.6628, duration: 1.5, ease: 'power3.out' })
        //         .to(rac2.position, { x: 2.6, z: 0.6628, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac3.position, { x: 0.2, z: -0.6628, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac4.position, { x: -1, z: 0.6628, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac5.position, { x: -2.2, z: -0.6628, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac6.position, { x: -4.6, z: 0.6628, duration: 1.5, ease: 'power3.out' }, '<')
        //         .to(rac7.position, { x: -4.6, z: -0.6628, duration: 1.5, ease: 'power3.out' }, '<');

        //     tlPhotosToPlayground
        //         .to(groupRectangles.position, {y: -1,  z: -20, duration: 1.5, ease: 'power3.inOut' })                
        //         .to(groupRectangles.scale, { y: 1, duration: 1.5, ease: 'power3.inOut' }, '<')
                
        //         .to(rac7.position, { z: 3.485, x: 0, duration: 1, ease: 'power3.inOut' }, '0.3')
        //         .to(rac7.rotation, { z: Math.PI / -2, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac7.scale, { x: 0.001, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac6.position, { z: 2.135, x: 0, duration: 1, ease: 'power3.inOut' }, '<+0.1')
        //         .to(rac6.rotation, { z: Math.PI / -2, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac6.scale, { x: 0.001, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac5.position, { z: 0.7825, x: 0, duration: 1, ease: 'power3.inOut' }, '<+0.1')
        //         .to(rac5.rotation, { z: Math.PI / -2, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac5.scale, { x: 0.001, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac4.position, { z: -0.5625, x: 0, duration: 1, ease: 'power3.inOut' }, '<+0.1')
        //         .to(rac4.rotation, { z: Math.PI / -2, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac4.scale, { x: 0.001, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac3.position, { z: -1.9125, x: 0, duration: 1, ease: 'power3.inOut' }, '<+0.1')
        //         .to(rac3.rotation, { z: Math.PI / -2, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac3.scale, { x: 0.001, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac2.position, { z: -3.2625, x: 0, duration: 1, ease: 'power3.inOut' }, '<+0.1')
        //         .to(rac2.rotation, { z: Math.PI / -2, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac2.scale, { x: 0.001, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac1.position, { z: -4.6215, x: 0, duration: 1, ease: 'power3.inOut' }, '<+0.1')
        //         .to(rac1.rotation, { z: Math.PI / -2, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to(rac1.scale, { x: 0.001, duration: 1, ease: 'power3.inOut' }, '<')

        //         .to(groupRectangles.position, { z: -10, y: -1, duration: 1.5, ease: 'power3.inOut' })
        //         .to(rac4.position, { x: -18.5, duration: 1, ease: 'power3.inOut' }, '<')
        //         .to([rac3.position, rac5.position], { x: -22.5, duration: 1, ease: 'power3.inOut' }, '<+0.1')
        //         .to([rac2.position, rac6.position], { x: -26.5, duration: 1, ease: 'power3.inOut' }, '<+0.1')
        //         .to([rac1.position, rac7.position], { x: -30.5, duration: 1, ease: 'power3.inOut' }, '<+0.1');
        // });
    }

    debug() {
        this.stats = new Stats();
        this.stats.showPanel(0);
        document.body.appendChild(this.stats.dom);

        this.gui = new GUI();
        // groupRectangles用のフォルダ
        const groupFolder = this.gui.addFolder('Group Rectangles');
        groupFolder.add(this.groupRectangles.position, 'x', -50, 50).name('Group Pos X');
        groupFolder.add(this.groupRectangles.position, 'y', -50, 50).name('Group Pos Y');
        groupFolder.add(this.groupRectangles.position, 'z', -50, 50).name('Group Pos Z');
        groupFolder.add(this.groupRectangles.rotation, 'x', -Math.PI, Math.PI).name('Group Rot X');
        groupFolder.add(this.groupRectangles.rotation, 'y', -Math.PI, Math.PI).name('Group Rot Y');
        groupFolder.add(this.groupRectangles.rotation, 'z', -Math.PI, Math.PI).name('Group Rot Z');
        groupFolder.add(this.groupRectangles.scale, 'x', 0, 5).name('Group Scale X');
        groupFolder.add(this.groupRectangles.scale, 'y', 0, 5).name('Group Scale Y');
        groupFolder.add(this.groupRectangles.scale, 'z', 0, 5).name('Group Scale Z');
        
        // 各rectangle用のフォルダ（rac1～rac7）
        this.rectangles.forEach((rect, index) => {
            const rectFolder = this.gui.addFolder(`Rectangle ${index + 1}`).close();
            rectFolder.add(rect.position, 'x', -50, 50).name(`Rac${index + 1} Pos X`);
            rectFolder.add(rect.position, 'y', -50, 50).name(`Rac${index + 1} Pos Y`);
            rectFolder.add(rect.position, 'z', -50, 50).name(`Rac${index + 1} Pos Z`);
            rectFolder.add(rect.rotation, 'x', -Math.PI, Math.PI).name(`Rac${index + 1} Rot X`);
            rectFolder.add(rect.rotation, 'y', -Math.PI, Math.PI).name(`Rac${index + 1} Rot Y`);
            rectFolder.add(rect.rotation, 'z', -Math.PI, Math.PI).name(`Rac${index + 1} Rot Z`);
            rectFolder.add(rect.scale, 'x', 0, 5).name(`Rac${index + 1} Scale X`);
            rectFolder.add(rect.scale, 'y', 0, 5).name(`Rac${index + 1} Scale Y`);
            rectFolder.add(rect.scale, 'z', 0, 5).name(`Rac${index + 1} Scale Z`);
        });
        
        // Works Plate用のフォルダ
        const worksPlateGroup = this.gui.addFolder('Works Plate').close();
        worksPlateGroup.add(this.worksPlate.position, 'x', -180, 180).name('Works Plate Pos X');
        worksPlateGroup.add(this.worksPlate.position, 'y', -50, 50).name('Works Plate Pos Y');
        worksPlateGroup.add(this.worksPlate.position, 'z', -50, 50).name('Works Plate Pos Z');

        document.addEventListener('scroll', () => {
            const groupRectangles = this.groupRectangles,
                rectangles = this.rectangles;
            console.log('groupRectangles pos:', groupRectangles.position.x, groupRectangles.position.y, groupRectangles.position.z);
            console.log('groupRectangles rot:', groupRectangles.rotation.x, groupRectangles.rotation.y, groupRectangles.rotation.z);
        });
    }

    animate() {
        this.isDebug && this.stats.begin();

        // --- 画像モード用 uniforms 更新（time 進行 + カーソル UV の追従） ---
        if (this.plateShaderMaterial) {
            const now = performance.now() * 0.001; // 秒
            const dt = this.lastFrameTime > 0 ? Math.min(now - this.lastFrameTime, 0.1) : 0.016;
            this.lastFrameTime = now;

            // time は常にゆっくり進める（ノイズアニメ用）
            this.plateShaderMaterial.uniforms.time.value += dt;

            // PC かつ About 中だけカーソル UV を追従させる
            if (this.isPC && this.activeSection === 'about') {
                const u = this.plateShaderMaterial.uniforms.imageMouseUv.value as THREE.Vector2;
                u.lerp(this.mouseUvTarget, 0.18);
            }
        }

        const gl = this.renderer.getContext();
        
        gl.enable(gl.STENCIL_TEST);
        
        this.renderer.autoClear = false;
        this.renderer.clear(true, true, true);
        
        // Pass 1: マスク（rectangles）をステンシルバッファに書き込む
        this.worksPlate.visible = false;
        gl.stencilFunc(gl.ALWAYS, 1, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        gl.colorMask(false, false, false, false);
        gl.depthMask(false);
        this.renderer.render(this.scene, this.camera);
        
        // Pass 2: worksPlateをステンシルテスト有効でレンダリング
        this.worksPlate.visible = true;
        this.groupRectangles.visible = false;
        gl.stencilFunc(gl.EQUAL, 1, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        gl.colorMask(true, true, true, true);
        gl.depthMask(true);
        this.renderer.render(this.scene, this.camera);
        
        // Pass 3: リセット
        this.groupRectangles.visible = true;
        gl.disable(gl.STENCIL_TEST);
        this.renderer.autoClear = true;
        
        this.isDebug && this.stats.end();

        requestAnimationFrame(this.animate.bind(this));
    }

    animationByScroll(progress: number) {
        if (this.groupRectangles) {
            this.groupRectangles.rotation.y = progress * Math.PI * 2;
            
            this.rectangles.forEach((rect, index) => {
                rect.rotation.z = (Math.PI / 12 * index) + (progress * Math.PI * 0.5);
            });
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

