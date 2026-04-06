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

export class WebGLSceneController {
    private renderer: THREE.WebGLRenderer;
    private container: HTMLElement | null;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private isDebug: boolean;
    private isTheaterEdit: boolean;
    private rectangles: THREE.Mesh[] = [];
    private groupRectangles!: THREE.Group;
    private worksPlate!: THREE.Mesh;
    private stats!: Stats;
    private gui!: GUI;
    private videos: HTMLVideoElement[] = [];
    private blackMaterial!: THREE.MeshBasicMaterial;
    private worksPlateBlackMaterial!: THREE.MeshBasicMaterial;
    private movies: string[] = [];
    private currentVideoIndex: number | null = null;
    private pendingVideoIndex: number | null = null;
    private worksPlateVideoTextures: THREE.VideoTexture[] = [];
    private theatreProject!: IProject;
    private theatreSheet!: ISheet;
    // トランジション用
    private plateShaderMaterial!: THREE.ShaderMaterial;
    private currentTexture: THREE.Texture | null = null;
    private dominantColors: THREE.Color[] = [];
    private colorExtractCanvas: HTMLCanvasElement;
    private colorExtractCtx: CanvasRenderingContext2D;
    private transitionTween: gsap.core.Tween | null = null;
    private readonly THEME_CHANGE_EVENT = 'pf:color-theme-change';
    private sequenceLength: number = 20; // 追加
    
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

        // rectangles (shared material)
        if (this.blackMaterial) {
            this.blackMaterial.color.copy(accent);
        }

        // works plate base color (shader)
        if (this.plateShaderMaterial?.uniforms?.baseColor) {
            (this.plateShaderMaterial.uniforms.baseColor.value as THREE.Color).copy(accent);
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
        const geometry = new THREE.BoxGeometry(2, 35, 1.1256);
        this.blackMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x000000,
            side: THREE.DoubleSide
        });
        
        for (let i = 0; i < 7; i++) {
            const mesh = new THREE.Mesh(geometry, this.blackMaterial);
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
                uvOffsetB: { value: new THREE.Vector2(0, 0) }
            },
            vertexShader: plateVertexShader,
            fragmentShader: plateFragmentShader,
            side: THREE.DoubleSide,
            transparent: true
        });
        
        this.worksPlate = new THREE.Mesh(worksPlateGeometry, this.plateShaderMaterial);
        this.worksPlate.scale.set(1, 1, 1);
        this.worksPlate.rotation.set(0, 0, 0);
        this.scene.add(this.worksPlate);
        
        mmInit.add('(max-width: 1023px)', () => {
            this.camera.position.z = 18;
            this.groupRectangles.position.set(-9, -3.5, -15);
            this.worksPlate.position.set(-9, -3.5, -16);
        });
        
        mmInit.add('(min-width: 1024px)', () => {
            this.camera.position.z = 5;
            this.groupRectangles.position.set(-17, -6, -15);
            this.worksPlate.position.set(-18, -4.5, -19);
        });

        this.scene.add(this.groupRectangles);
    
        await this.initTheatre();
        // ローディングアニメーション（0% → 20%）を再生
        await this.playLoadingAnimation();
    
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
            this.worksPlateVideoTextures.push(plateTex);
            
            this.dominantColors.push(new THREE.Color(0, 0, 0));
        }
    }

    private getDominantColor(video: HTMLVideoElement): THREE.Color {
        try {
            this.colorExtractCtx.drawImage(video, 0, 0, 8, 8);
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

    private showVideoOnWorksPlate(videoIndex: number) {

        console.log('🎬 showVideoOnWorksPlate', videoIndex);
        this.ensureVideosPrepared();
        if (!this.worksPlateVideoTextures[videoIndex]) return;
        
        if (this.currentVideoIndex === videoIndex) return;

        if (this.transitionTween) {
            this.transitionTween.kill();
            this.transitionTween = null;
            
            if (this.pendingVideoIndex !== null && this.pendingVideoIndex !== videoIndex) {
                console.log('🛑 Stopping pending video:', this.pendingVideoIndex);
                if (this.videos[this.pendingVideoIndex]) {
                    this.videos[this.pendingVideoIndex].pause();
                }
            }
            this.pendingVideoIndex = null;
        }
        
        const uniforms = this.plateShaderMaterial.uniforms;
        if (uniforms.fadeOutProgress.value > 0 && this.currentVideoIndex !== null) {
            console.log('🛑 Stopping fadeOut video:', this.currentVideoIndex);
            if (this.videos[this.currentVideoIndex]) {
                this.videos[this.currentVideoIndex].pause();
            }
            this.currentTexture = null;
            this.currentVideoIndex = null;
        }

        const nextTexture = this.worksPlateVideoTextures[videoIndex];
        const nextVideo = this.videos[videoIndex];

        try { nextVideo.currentTime = 0; } catch(e) {}
        nextVideo.loop = true;
        nextVideo.play().catch(() => {});

        this.worksPlate.material = this.plateShaderMaterial;
        
        const calcUVTransform = (video: HTMLVideoElement) => {
            const plateAspect = 1;
            const videoAspect = video.videoWidth / video.videoHeight || 16/9;
            
            if (videoAspect > plateAspect) {
                const scale = plateAspect / videoAspect;
                return { scale: new THREE.Vector2(scale, 1), offset: new THREE.Vector2((1 - scale) / 2, 0) };
            } else {
                const scale = videoAspect / plateAspect;
                return { scale: new THREE.Vector2(1, scale), offset: new THREE.Vector2(0, (1 - scale) / 2) };
            }
        };
        
        const nextUV = calcUVTransform(nextVideo);
        
        const prevTexture = this.currentTexture || nextTexture;
        const prevVideoIdx = this.currentVideoIndex;
        const prevVideo = prevVideoIdx !== null ? this.videos[prevVideoIdx] : nextVideo;
        const prevUV = calcUVTransform(prevVideo);

        const prevColor = prevVideoIdx !== null ? this.getDominantColor(prevVideo) : new THREE.Color(0, 0, 0);
        const nextColor = this.getDominantColor(nextVideo);
        
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
        uniforms.time.value = Math.random() * 1000.0;
        
        const progressObj = { value: 0.0 };
        const prevVideoIndex = this.currentVideoIndex;
        
        this.pendingVideoIndex = videoIndex;
        
        console.log('🎬 Starting transition animation', { from: prevVideoIndex, to: videoIndex });
        
        this.transitionTween = gsap.to(progressObj, { 
            value: 1.0, 
            duration: 1.0,
            ease: 'power2.out',
            onUpdate: () => {
                uniforms.progress.value = progressObj.value;
                console.log('📊 Progress:', progressObj.value.toFixed(3));
            },
            onComplete: () => {
                console.log('✅ Transition complete');
                if (prevVideoIndex !== null && this.videos[prevVideoIndex]) {
                    this.videos[prevVideoIndex].pause();
                }
                this.currentTexture = nextTexture;
                this.currentVideoIndex = videoIndex;
                this.pendingVideoIndex = null;
                this.transitionTween = null;
            }
        });
    }

    private updatePlateTextureAspect(texture: THREE.VideoTexture, videoWidth: number, videoHeight: number) {
        const plateAspect = 1;
        const videoAspect = videoWidth / videoHeight;

        if (videoAspect > plateAspect) {
            const scale = plateAspect / videoAspect;
            texture.repeat.set(scale, 1);
            texture.offset.set((1 - scale) / 2, 0);
        } else {
            const scale = videoAspect / plateAspect;
            texture.repeat.set(1, scale);
            texture.offset.set(0, (1 - scale) / 2);
        }
    }

    private clearVideoFromWorksPlate() {
        if (this.transitionTween) {
            this.transitionTween.kill();
            this.transitionTween = null;
            
            if (this.pendingVideoIndex !== null) {
                console.log('🛑 Promoting pending video to current for fadeout:', this.pendingVideoIndex);
                this.currentVideoIndex = this.pendingVideoIndex;
                this.currentTexture = this.worksPlateVideoTextures[this.pendingVideoIndex];
                this.pendingVideoIndex = null;
            }
        }
        
        const uniforms = this.plateShaderMaterial.uniforms;
        
        if (this.currentTexture && this.currentVideoIndex !== null) {
            const currentColor = this.getDominantColor(this.videos[this.currentVideoIndex]);
            const currentVideoIdx = this.currentVideoIndex;
            
            uniforms.colorA.value = currentColor;
            uniforms.colorB.value = new THREE.Color(0, 0, 0);
            uniforms.fadeOutProgress.value = 0.0;
            uniforms.time.value = Math.random() * 1000.0;
            
            const fadeObj = { value: 0.0 };
            
            console.log('🌙 Starting fade out animation');
            
            this.transitionTween = gsap.to(fadeObj, { 
                value: 1.0, 
                duration: 1.0,
                ease: 'power2.out',
                onUpdate: () => {
                    uniforms.fadeOutProgress.value = fadeObj.value;
                    console.log('🌑 FadeOut:', fadeObj.value.toFixed(3));
                },
                onComplete: () => {
                    console.log('⬛ Fade out complete');
                    if (currentVideoIdx !== null && this.videos[currentVideoIdx]) {
                        this.videos[currentVideoIdx].pause();
                    }
                    this.currentTexture = null;
                    this.currentVideoIndex = null;
                    uniforms.progress.value = 0.0;
                    uniforms.fadeOutProgress.value = 0.0;
                    uniforms.useTexture.value = 0.0;
                    this.transitionTween = null;
                }
            });
        } else {
            uniforms.useTexture.value = 0.0;
            uniforms.fadeOutProgress.value = 0.0;
            this.currentVideoIndex = null;
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
            el.addEventListener('mouseenter', () => this.showVideoOnWorksPlate(idx));
            el.addEventListener('mouseleave', () => this.clearVideoFromWorksPlate());
            el.addEventListener('focus', () => this.showVideoOnWorksPlate(idx));
            el.addEventListener('blur', () => this.clearVideoFromWorksPlate());
        });
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

