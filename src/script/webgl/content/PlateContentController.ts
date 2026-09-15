import * as THREE from 'three';
import gsap from 'gsap';
import type { PlateContent } from '../types';

export type PlateContentControllerDeps = {
    movies: string[];
    playgroundMovies?: string[];
    getPlateShaderMaterial: () => THREE.ShaderMaterial;
    getWorksPlate: () => THREE.Mesh;
};

/**
 * worksPlate への動画/画像/ノイズ表示・トランジションを担当。
 */
export class PlateContentController {
    private videos: HTMLVideoElement[] = [];
    private videoTextures: THREE.VideoTexture[] = [];
    private playgroundVideos: HTMLVideoElement[] = [];
    private playgroundVideoTextures: THREE.VideoTexture[] = [];
    private imageTextures = new Map<string, THREE.Texture>();
    private imageElements = new Map<string, HTMLImageElement>();
    private currentContent: PlateContent | null = null;
    private pendingContent: PlateContent | null = null;
    private currentTexture: THREE.Texture | null = null;
    private transitionTween: gsap.core.Tween | null = null;
    /** clear() の fadeOut 進行中。showNoise の誤 early-return 防止に使う */
    private isClearing = false;
    private readonly colorExtractCanvas: HTMLCanvasElement;
    private readonly colorExtractCtx: CanvasRenderingContext2D;
    /** noise 用ダミー（テクスチャ不要だがトランジション経路を共有） */
    private readonly noiseDummyTexture: THREE.DataTexture;

    constructor(private readonly deps: PlateContentControllerDeps) {
        this.colorExtractCanvas = document.createElement('canvas');
        this.colorExtractCanvas.width = 8;
        this.colorExtractCanvas.height = 8;
        this.colorExtractCtx = this.colorExtractCanvas.getContext('2d', { willReadFrequently: true })!;

        const data = new Uint8Array([128, 128, 128, 255]);
        this.noiseDummyTexture = new THREE.DataTexture(data, 1, 1);
        this.noiseDummyTexture.needsUpdate = true;
    }

    loadImageTexture(key: string, url: string): Promise<void> {
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

    show(next: PlateContent, opts?: { duration?: number; ease?: string }) {
        if (next.kind === 'noise') {
            this.showNoise(opts);
            return;
        }

        this.isClearing = false;

        const resolved = this.resolveContent(next);
        if (!resolved) return;

        if (this.isSameContent(this.currentContent, next)) return;

        const duration = opts?.duration ?? 1.0;
        const ease = opts?.ease ?? 'power2.out';
        const plateShaderMaterial = this.deps.getPlateShaderMaterial();
        const worksPlate = this.deps.getWorksPlate();

        this.killTransitionKeepingCurrent();

        const uniforms = plateShaderMaterial.uniforms;

        if (uniforms.fadeOutProgress.value > 0 && this.currentContent) {
            this.pauseContent(this.currentContent);
            this.currentTexture = null;
            this.currentContent = null;
        }

        const nextTexture = resolved.texture;
        const nextSource = resolved.source;

        this.playContent(next);
        worksPlate.material = plateShaderMaterial;

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
        uniforms.imageMode.value = next.kind === 'image' ? 1.0 : 0.0;
        uniforms.imageFromPrev.value = next.kind === 'image' && prevContent ? 1.0 : 0.0;
        uniforms.staticNoiseMode.value = 0.0;

        const progressObj = { value: 0.0 };
        const prevContentSnapshot = prevContent;

        this.pendingContent = next;

        this.transitionTween = gsap.to(progressObj, {
            value: 1.0,
            duration,
            ease,
            onUpdate: () => {
                uniforms.progress.value = progressObj.value;
            },
            onComplete: () => {
                this.pauseContent(prevContentSnapshot);
                this.currentTexture = nextTexture;
                this.currentContent = next;
                this.pendingContent = null;
                this.transitionTween = null;
            }
        });
    }

    clear(opts?: { duration?: number; ease?: string }) {
        const duration = opts?.duration ?? 1.0;
        const ease = opts?.ease ?? 'power2.out';
        const plateShaderMaterial = this.deps.getPlateShaderMaterial();

        this.isClearing = true;

        if (this.transitionTween) {
            this.transitionTween.kill();
            this.transitionTween = null;

            if (this.pendingContent) {
                this.currentContent = this.pendingContent;
                const resolved = this.resolveContent(this.pendingContent);
                this.currentTexture = resolved?.texture ?? (
                    this.pendingContent.kind === 'noise' ? this.noiseDummyTexture : null
                );
                this.pendingContent = null;
            }
        }

        const uniforms = plateShaderMaterial.uniforms;

        if (this.currentContent) {
            const currentContentSnapshot = this.currentContent;
            const isNoise = currentContentSnapshot.kind === 'noise';

            if (!isNoise && this.currentTexture) {
                const resolved = this.resolveContent(this.currentContent);
                const currentColor = resolved
                    ? this.getDominantColor(resolved.source)
                    : new THREE.Color(0, 0, 0);
                uniforms.colorA.value = currentColor;
            }

            uniforms.colorB.value = new THREE.Color(0, 0, 0);
            uniforms.fadeOutProgress.value = 0.0;

            const fadeObj = { value: 0.0 };

            this.transitionTween = gsap.to(fadeObj, {
                value: 1.0,
                duration,
                ease,
                onUpdate: () => {
                    uniforms.fadeOutProgress.value = fadeObj.value;
                },
                onComplete: () => {
                    this.pauseContent(currentContentSnapshot);
                    this.pauseAllPlaygroundVideos();
                    this.currentTexture = null;
                    this.currentContent = null;
                    uniforms.progress.value = 0.0;
                    uniforms.fadeOutProgress.value = 0.0;
                    uniforms.useTexture.value = 0.0;
                    uniforms.imageMode.value = 0.0;
                    uniforms.imageFromPrev.value = 0.0;
                    uniforms.staticNoiseMode.value = 0.0;
                    this.transitionTween = null;
                    this.isClearing = false;
                }
            });
        } else {
            uniforms.useTexture.value = 0.0;
            uniforms.fadeOutProgress.value = 0.0;
            uniforms.imageMode.value = 0.0;
            uniforms.imageFromPrev.value = 0.0;
            uniforms.staticNoiseMode.value = 0.0;
            this.currentContent = null;
            this.isClearing = false;
        }
    }

    /**
     * 全動画を裏で preload しつつ、Works 先頭 criticalCount 本のバッファ進捗を返す。
     * Phase1 ゲートは getProgress / criticalReady のみを使う（allReady は待たない）。
     */
    preloadVideos(options?: { criticalCount?: number }): {
        getProgress: () => number;
        criticalReady: Promise<void>;
        allReady: Promise<void>;
    } {
        const criticalCount = options?.criticalCount ?? 2;

        this.ensureVideosPrepared();
        this.ensurePlaygroundVideosPrepared();

        const allVideos = [...this.videos, ...this.playgroundVideos];
        const criticalVideos = this.videos.slice(0, Math.min(criticalCount, this.videos.length));

        if (!allVideos.length) {
            return {
                getProgress: () => 1,
                criticalReady: Promise.resolve(),
                allReady: Promise.resolve(),
            };
        }

        const waitVideoReady = (video: HTMLVideoElement) =>
            new Promise<void>((resolve) => {
                if (video.readyState >= 3 || video.error) {
                    resolve();
                    return;
                }
                const done = () => resolve();
                video.addEventListener('loadeddata', done, { once: true });
                video.addEventListener('canplay', done, { once: true });
                video.addEventListener('error', done, { once: true });
            });

        const criticalReady = criticalVideos.length
            ? Promise.all(criticalVideos.map(waitVideoReady)).then(() => {})
            : Promise.resolve();

        const allReady = Promise.all(allVideos.map(waitVideoReady)).then(() => {});

        return {
            getProgress: () => {
                if (!criticalVideos.length) return 1;
                let sum = 0;
                for (const video of criticalVideos) {
                    sum += this.getVideoBufferProgress(video);
                }
                return sum / criticalVideos.length;
            },
            criticalReady,
            allReady,
        };
    }

    /**
     * 0〜1。再生可能（readyState >= 3）で 1。
     * それ以前は buffered/duration でまだら進捗。error は 1（ゲートを止めない）。
     */
    private getVideoBufferProgress(video: HTMLVideoElement): number {
        if (video.error) return 1;
        if (video.readyState >= 3) return 1;

        const duration = video.duration;
        if (Number.isFinite(duration) && duration > 0 && video.buffered.length > 0) {
            try {
                const end = video.buffered.end(video.buffered.length - 1);
                // ready 前は 1 未満に抑え、完了判定は readyState >= 3 に任せる
                return Math.min(0.99, Math.max(0, end / duration));
            } catch {
                // buffered range が一時的に読めない場合
            }
        }

        return Math.min(0.99, video.readyState / 4);
    }

    private showNoise(opts?: { duration?: number; ease?: string }) {
        const plateShaderMaterial = this.deps.getPlateShaderMaterial();
        const uniforms = plateShaderMaterial.uniforms;

        // 安定してノイズ表示中のみスキップ。clear 中 / fadeOut 中は再アサートする
        const stableNoise =
            !this.isClearing &&
            this.isSameContent(this.currentContent, { kind: 'noise' }) &&
            uniforms.fadeOutProgress.value <= 0 &&
            uniforms.staticNoiseMode.value > 0.5;
        if (stableNoise) return;

        this.isClearing = false;

        const duration = opts?.duration ?? 0.7;
        const ease = opts?.ease ?? 'power2.out';
        const worksPlate = this.deps.getWorksPlate();

        this.killTransitionKeepingCurrent();

        if (uniforms.fadeOutProgress.value > 0 && this.currentContent) {
            this.pauseContent(this.currentContent);
            this.currentTexture = null;
            this.currentContent = null;
        }

        const prevContent = this.currentContent;
        this.pauseAllPlaygroundVideos();
        worksPlate.material = plateShaderMaterial;

        uniforms.useTexture.value = 1.0;
        uniforms.progress.value = 0.0;
        uniforms.fadeOutProgress.value = 0.0;
        uniforms.imageMode.value = 0.0;
        uniforms.imageFromPrev.value = 0.0;
        uniforms.staticNoiseMode.value = 1.0;

        const progressObj = { value: 0.0 };
        this.pendingContent = { kind: 'noise' };

        this.transitionTween = gsap.to(progressObj, {
            value: 1.0,
            duration,
            ease,
            onUpdate: () => {
                uniforms.progress.value = progressObj.value;
            },
            onComplete: () => {
                this.pauseContent(prevContent);
                this.currentTexture = this.noiseDummyTexture;
                this.currentContent = { kind: 'noise' };
                this.pendingContent = null;
                this.transitionTween = null;
            }
        });
    }

    private killTransitionKeepingCurrent() {
        if (!this.transitionTween) return;
        this.transitionTween.kill();
        this.transitionTween = null;

        if (this.pendingContent && !this.isSameContent(this.pendingContent, this.currentContent)) {
            this.pauseContent(this.pendingContent);
        }
        this.pendingContent = null;
    }

    private ensureVideosPrepared() {
        if (this.videos.length || !this.deps.movies.length) return;
        this.prepareVideoList(this.deps.movies, this.videos, this.videoTextures);
    }

    private ensurePlaygroundVideosPrepared() {
        const urls = this.deps.playgroundMovies ?? [];
        if (this.playgroundVideos.length || !urls.length) return;
        this.prepareVideoList(urls, this.playgroundVideos, this.playgroundVideoTextures);
    }

    private prepareVideoList(
        urls: string[],
        videos: HTMLVideoElement[],
        textures: THREE.VideoTexture[],
    ) {
        for (let i = 0; i < urls.length; i++) {
            const video = document.createElement('video');
            video.src = urls[i];
            video.muted = true;
            video.loop = true;
            (video as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
            video.preload = 'auto';
            video.crossOrigin = 'anonymous';
            videos.push(video);

            const plateTex = new THREE.VideoTexture(video);
            plateTex.colorSpace = THREE.SRGBColorSpace;
            plateTex.wrapS = THREE.ClampToEdgeWrapping;
            plateTex.wrapT = THREE.ClampToEdgeWrapping;
            textures.push(plateTex);
        }
    }

    private resolveContent(content: PlateContent):
        | { texture: THREE.Texture; source: HTMLVideoElement | HTMLImageElement }
        | null {
        if (content.kind === 'noise') {
            return null;
        }
        if (content.kind === 'video') {
            this.ensureVideosPrepared();
            const tex = this.videoTextures[content.index];
            const el = this.videos[content.index];
            if (!tex || !el) return null;
            return { texture: tex, source: el };
        }
        if (content.kind === 'playgroundVideo') {
            this.ensurePlaygroundVideosPrepared();
            const tex = this.playgroundVideoTextures[content.index];
            const el = this.playgroundVideos[content.index];
            if (!tex || !el) return null;
            return { texture: tex, source: el };
        }
        const tex = this.imageTextures.get(content.key);
        const el = this.imageElements.get(content.key);
        if (!tex || !el) return null;
        return { texture: tex, source: el };
    }

    private isSameContent(a: PlateContent | null, b: PlateContent | null): boolean {
        if (!a || !b) return a === b;
        if (a.kind !== b.kind) return false;
        if (a.kind === 'video' && b.kind === 'video') return a.index === b.index;
        if (a.kind === 'playgroundVideo' && b.kind === 'playgroundVideo') return a.index === b.index;
        if (a.kind === 'noise' && b.kind === 'noise') return true;
        if (a.kind === 'image' && b.kind === 'image') return a.key === b.key;
        return false;
    }

    private playContent(content: PlateContent) {
        if (content.kind === 'video') {
            const v = this.videos[content.index];
            if (!v) return;
            try { v.currentTime = 0; } catch { /* ignore */ }
            v.loop = true;
            v.play().catch(() => {});
            return;
        }
        if (content.kind === 'playgroundVideo') {
            this.pauseAllPlaygroundVideos();
            const v = this.playgroundVideos[content.index];
            if (!v) return;
            try { v.currentTime = 0; } catch { /* ignore */ }
            v.loop = true;
            v.play().catch(() => {});
        }
    }

    private pauseContent(content: PlateContent | null) {
        if (!content) return;
        if (content.kind === 'video') {
            this.videos[content.index]?.pause();
            return;
        }
        if (content.kind === 'playgroundVideo') {
            this.playgroundVideos[content.index]?.pause();
        }
    }

    private pauseAllPlaygroundVideos() {
        this.playgroundVideos.forEach((v) => v.pause());
    }

    /** Playground 表示中動画のアスペクト。無ければ null */
    getActivePlaygroundVideoAspect(): number | null {
        const candidates = [this.pendingContent, this.currentContent];
        for (const content of candidates) {
            if (content?.kind !== 'playgroundVideo') continue;
            const v = this.playgroundVideos[content.index];
            if (v && v.videoWidth > 0 && v.videoHeight > 0) {
                return v.videoWidth / v.videoHeight;
            }
        }
        return null;
    }

    private calcUVTransform(source: HTMLVideoElement | HTMLImageElement) {
        const plateAspect = 1;
        let w = 0;
        let h = 0;
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
        }
        const scale = aspect / plateAspect;
        return { scale: new THREE.Vector2(1, scale), offset: new THREE.Vector2(0, (1 - scale) / 2) };
    }

    private getDominantColor(source: HTMLVideoElement | HTMLImageElement): THREE.Color {
        try {
            this.colorExtractCtx.drawImage(source as CanvasImageSource, 0, 0, 8, 8);
            const imageData = this.colorExtractCtx.getImageData(0, 0, 8, 8).data;
            let r = 0;
            let g = 0;
            let b = 0;
            const pixelCount = 64;
            for (let i = 0; i < imageData.length; i += 4) {
                r += imageData[i];
                g += imageData[i + 1];
                b += imageData[i + 2];
            }
            return new THREE.Color(r / pixelCount / 255, g / pixelCount / 255, b / pixelCount / 255);
        } catch {
            return new THREE.Color(0.5, 0.5, 0.5);
        }
    }
}
