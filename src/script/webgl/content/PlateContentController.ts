import * as THREE from 'three';
import gsap from 'gsap';
import type { PlateContent } from '../types';

export type PlateContentControllerDeps = {
    movies: string[];
    getPlateShaderMaterial: () => THREE.ShaderMaterial;
    getWorksPlate: () => THREE.Mesh;
};

/**
 * worksPlate への動画/画像表示・トランジションを担当。
 */
export class PlateContentController {
    private videos: HTMLVideoElement[] = [];
    private videoTextures: THREE.VideoTexture[] = [];
    private imageTextures = new Map<string, THREE.Texture>();
    private imageElements = new Map<string, HTMLImageElement>();
    private currentContent: PlateContent | null = null;
    private pendingContent: PlateContent | null = null;
    private currentTexture: THREE.Texture | null = null;
    private transitionTween: gsap.core.Tween | null = null;
    private readonly colorExtractCanvas: HTMLCanvasElement;
    private readonly colorExtractCtx: CanvasRenderingContext2D;

    constructor(private readonly deps: PlateContentControllerDeps) {
        this.colorExtractCanvas = document.createElement('canvas');
        this.colorExtractCanvas.width = 8;
        this.colorExtractCanvas.height = 8;
        this.colorExtractCtx = this.colorExtractCanvas.getContext('2d', { willReadFrequently: true })!;
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
        console.log('🎬 showContentOnPlate', next);

        const resolved = this.resolveContent(next);
        if (!resolved) return;

        if (this.isSameContent(this.currentContent, next)) return;

        const duration = opts?.duration ?? 1.0;
        const ease = opts?.ease ?? 'power2.out';
        const plateShaderMaterial = this.deps.getPlateShaderMaterial();
        const worksPlate = this.deps.getWorksPlate();

        if (this.transitionTween) {
            this.transitionTween.kill();
            this.transitionTween = null;

            if (this.pendingContent && !this.isSameContent(this.pendingContent, next)) {
                console.log('🛑 Stopping pending content:', this.pendingContent);
                this.pauseContent(this.pendingContent);
            }
            this.pendingContent = null;
        }

        const uniforms = plateShaderMaterial.uniforms;

        if (uniforms.fadeOutProgress.value > 0 && this.currentContent) {
            console.log('🛑 Stopping fadeOut content:', this.currentContent);
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

    clear(opts?: { duration?: number; ease?: string }) {
        const duration = opts?.duration ?? 1.0;
        const ease = opts?.ease ?? 'power2.out';
        const plateShaderMaterial = this.deps.getPlateShaderMaterial();

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

        const uniforms = plateShaderMaterial.uniforms;

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

    private ensureVideosPrepared() {
        if (this.videos.length || !this.deps.movies.length) return;

        const videoCount = this.deps.movies.length;
        for (let i = 0; i < videoCount; i++) {
            const url = this.deps.movies[i];
            const video = document.createElement('video');
            video.src = url;
            video.muted = true;
            video.loop = true;
            (video as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
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

    private resolveContent(content: PlateContent):
        | { texture: THREE.Texture; source: HTMLVideoElement | HTMLImageElement }
        | null {
        if (content.kind === 'video') {
            this.ensureVideosPrepared();
            const tex = this.videoTextures[content.index];
            const el = this.videos[content.index];
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
        if (a.kind === 'image' && b.kind === 'image') return a.key === b.key;
        return false;
    }

    private playContent(content: PlateContent) {
        if (content.kind !== 'video') return;
        const v = this.videos[content.index];
        if (!v) return;
        try { v.currentTime = 0; } catch { /* ignore */ }
        v.loop = true;
        v.play().catch(() => {});
    }

    private pauseContent(content: PlateContent | null) {
        if (!content || content.kind !== 'video') return;
        this.videos[content.index]?.pause();
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
