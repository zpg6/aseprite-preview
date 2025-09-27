import {
    AsepriteFile,
    AsepriteFrame,
    CelChunk,
    LayerChunk,
    PaletteChunk,
    TagChunk,
    ColorDepth,
    CelType,
    LayerType,
    BlendMode,
    LoopDirection,
} from "./asepriteTypes";
import { AsepriteParser } from "./asepriteParser";

/**
 * Rendering configuration options
 * Controls visual appearance and animation playback
 */
export interface RenderOptions {
    /** Pixel scaling factor for display */
    scale: number;
    /** Whether to render grid overlay */
    showGrid: boolean;
    /** Whether to show background layer */
    showBackground: boolean;
    /** Background color for transparent areas */
    backgroundColor: string;
    /** Current frame index to render */
    currentFrame: number;
    /** Whether animation is playing */
    playAnimation: boolean;
    /** Selected animation tag name */
    selectedTag?: string;
}

/**
 * Layer rendering information with calculated properties
 * Used for proper layer ordering and compositing
 */
export interface LayerRenderInfo {
    /** Layer definition from ASE file */
    layer: LayerChunk;
    /** Layer index as per spec NOTE.2 */
    layerIndex: number;
    /** Computed visibility state */
    visible: boolean;
    /** Combined opacity from layer and cel */
    opacity: number;
    /** Z-index for depth sorting as per spec NOTE.5 */
    zIndex: number;
}

/**
 * Aseprite sprite renderer with animation support
 * Implements proper layer ordering and blend modes as per ASE specification
 */
export class AsepriteRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private asepriteFile: AsepriteFile;
    private animationId: number | null = null;
    private lastFrameTime: number = 0;
    private currentFrameIndex: number = 0;
    private tagFrameIndex: number = 0;
    private playingForward: boolean = true;
    private currentTag: TagChunk | undefined;

    constructor(canvas: HTMLCanvasElement, asepriteFile: AsepriteFile) {
        this.canvas = canvas;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Could not get 2D context from canvas");
        }
        this.ctx = ctx;
        this.asepriteFile = asepriteFile;

        // Disable image smoothing for pixel-perfect rendering
        this.ctx.imageSmoothingEnabled = false;
    }

    render(options: RenderOptions): void {
        const { scale, showGrid, showBackground, backgroundColor, currentFrame } = options;

        // Set canvas size
        const scaledWidth = this.asepriteFile.header.width * scale;
        const scaledHeight = this.asepriteFile.header.height * scale;
        this.canvas.width = scaledWidth;
        this.canvas.height = scaledHeight;

        // Clear canvas
        this.ctx.fillStyle = backgroundColor;
        this.ctx.fillRect(0, 0, scaledWidth, scaledHeight);

        // Get the frame to render
        const frameIndex = Math.min(currentFrame, this.asepriteFile.frames.length - 1);
        const frame = this.asepriteFile.frames[frameIndex];

        if (!frame) return;

        // Collect all layers with their render info
        const layerRenderInfos = this.collectLayerRenderInfo(frame);

        // Sort layers by z-index and layer order (implements spec NOTE.5 algorithm)
        layerRenderInfos.sort((a, b) => {
            const orderA = a.layerIndex + a.zIndex;
            const orderB = b.layerIndex + b.zIndex;
            return orderA !== orderB ? orderA - orderB : a.zIndex - b.zIndex;
        });

        // Render each layer
        for (const renderInfo of layerRenderInfos) {
            if (renderInfo.visible) {
                this.renderLayer(frame, renderInfo, scale);
            }
        }

        // Draw grid if enabled
        if (showGrid && this.asepriteFile.header.gridWidth > 0 && this.asepriteFile.header.gridHeight > 0) {
            this.drawGrid(scale);
        }
    }

    /**
     * Collect layer rendering information for the current frame
     * Processes each cel and determines visibility, opacity, and z-ordering
     */
    private collectLayerRenderInfo(frame: AsepriteFrame): LayerRenderInfo[] {
        const renderInfos: LayerRenderInfo[] = [];

        // Create a map of layer index to layer for quick lookup
        const layerMap = new Map<number, LayerChunk>();
        frame.layers.forEach((layer, index) => {
            layerMap.set(index, layer);
        });

        // Process each cel
        for (const cel of frame.cels) {
            const layer = layerMap.get(cel.layerIndex);
            if (!layer) continue;

            // Skip group layers (they don't have visual content)
            if (layer.type === LayerType.GROUP) continue;

            const visible = (layer.flags & 1) !== 0; // Check visible flag bit
            const opacity = (cel.opacity / 255) * (layer.opacity / 255); // Combine cel and layer opacity

            renderInfos.push({
                layer,
                layerIndex: cel.layerIndex,
                visible,
                opacity,
                zIndex: cel.zIndex,
            });
        }

        return renderInfos;
    }

    /**
     * Render a single layer to the main canvas
     * Uses separate canvas for layer compositing with proper blend modes
     */
    private renderLayer(frame: AsepriteFrame, renderInfo: LayerRenderInfo, scale: number): void {
        const cel = frame.cels.find(c => c.layerIndex === renderInfo.layerIndex);
        if (!cel) return;

        // Create temporary canvas for layer rendering
        const layerCanvas = document.createElement("canvas");
        const layerCtx = layerCanvas.getContext("2d");
        if (!layerCtx) return;

        layerCanvas.width = this.asepriteFile.header.width;
        layerCanvas.height = this.asepriteFile.header.height;
        layerCtx.imageSmoothingEnabled = false;

        this.renderCel(cel, layerCtx);

        // Apply layer opacity and blend mode
        this.ctx.save();
        this.ctx.globalAlpha = renderInfo.opacity;
        this.ctx.globalCompositeOperation = this.getBlendModeString(renderInfo.layer.blendMode);

        this.ctx.drawImage(
            layerCanvas,
            0,
            0,
            layerCanvas.width,
            layerCanvas.height,
            0,
            0,
            layerCanvas.width * scale,
            layerCanvas.height * scale
        );

        this.ctx.restore();
    }

    /**
     * Render cel data to canvas context
     * Handles different cel types (raw, compressed) and pixel format conversion
     */
    private renderCel(cel: CelChunk, ctx: CanvasRenderingContext2D): void {
        if (cel.type === CelType.LINKED_CEL) {
            // Linked cels reference another frame - skip for now
            return;
        }

        let imageData: Uint8Array;
        let width: number;
        let height: number;

        if (cel.type === CelType.RAW_IMAGE && cel.rawPixelData && cel.width && cel.height) {
            // Raw uncompressed image data (rarely used)
            imageData = cel.rawPixelData;
            width = cel.width;
            height = cel.height;
        } else if (cel.type === CelType.COMPRESSED_IMAGE && cel.compressedData && cel.width && cel.height) {
            // ZLIB compressed image data (standard format)
            imageData = AsepriteParser.decompressImageData(cel.compressedData);
            width = cel.width;
            height = cel.height;
        } else {
            return;
        }

        // Convert pixel data and render to canvas
        const canvasImageData = ctx.createImageData(width, height);
        this.convertPixelData(imageData, canvasImageData.data, this.asepriteFile.header.colorDepth);
        ctx.putImageData(canvasImageData, cel.x, cel.y);
    }

    /**
     * Convert ASE pixel data to canvas RGBA format
     * Handles different color depths as per spec: Indexed, Grayscale, RGBA
     */
    private convertPixelData(sourceData: Uint8Array, targetData: Uint8ClampedArray, colorDepth: number): void {
        const palette = this.asepriteFile.globalPalette;

        switch (colorDepth) {
            case ColorDepth.RGBA:
                // Direct RGBA copy (4 bytes per pixel: R,G,B,A)
                for (let i = 0; i < sourceData.length; i++) {
                    targetData[i] = sourceData[i];
                }
                break;

            case ColorDepth.GRAYSCALE:
                // Grayscale format: 2 bytes per pixel (Value, Alpha)
                for (let i = 0; i < sourceData.length; i += 2) {
                    const pixelIndex = i / 2;
                    const value = sourceData[i];
                    const alpha = sourceData[i + 1];

                    targetData[pixelIndex * 4] = value;
                    targetData[pixelIndex * 4 + 1] = value;
                    targetData[pixelIndex * 4 + 2] = value;
                    targetData[pixelIndex * 4 + 3] = alpha;
                }
                break;

            case ColorDepth.INDEXED:
                // Indexed format: 1 byte per pixel (palette index)
                if (!palette) {
                    throw new Error("No palette found for indexed color sprite");
                }

                for (let i = 0; i < sourceData.length; i++) {
                    const colorIndex = sourceData[i];
                    const paletteEntry = palette.entries[colorIndex - palette.firstColorIndex];

                    if (paletteEntry) {
                        targetData[i * 4] = paletteEntry.red;
                        targetData[i * 4 + 1] = paletteEntry.green;
                        targetData[i * 4 + 2] = paletteEntry.blue;
                        targetData[i * 4 + 3] = paletteEntry.alpha;
                    } else {
                        // Transparent pixel for invalid palette index
                        targetData[i * 4] = 0;
                        targetData[i * 4 + 1] = 0;
                        targetData[i * 4 + 2] = 0;
                        targetData[i * 4 + 3] = 0;
                    }
                }
                break;

            default:
                throw new Error(`Unsupported color depth: ${colorDepth}`);
        }
    }

    /**
     * Convert ASE blend mode to Canvas2D composite operation
     * Maps blend modes from spec to supported Canvas operations
     */
    private getBlendModeString(blendMode: number): GlobalCompositeOperation {
        switch (blendMode) {
            case BlendMode.NORMAL:
                return "source-over";
            case BlendMode.MULTIPLY:
                return "multiply";
            case BlendMode.SCREEN:
                return "screen";
            case BlendMode.OVERLAY:
                return "overlay";
            case BlendMode.DARKEN:
                return "darken";
            case BlendMode.LIGHTEN:
                return "lighten";
            case BlendMode.COLOR_DODGE:
                return "color-dodge";
            case BlendMode.COLOR_BURN:
                return "color-burn";
            case BlendMode.HARD_LIGHT:
                return "hard-light";
            case BlendMode.SOFT_LIGHT:
                return "soft-light";
            case BlendMode.DIFFERENCE:
                return "difference";
            case BlendMode.EXCLUSION:
                return "exclusion";
            default:
                // Unsupported blend modes fall back to normal
                return "source-over";
        }
    }

    /**
     * Draw grid overlay based on ASE header grid settings
     * Grid position and size are defined in the sprite header
     * Default Aseprite grid is 16x16 pixels, but can be customized
     */
    private drawGrid(scale: number): void {
        const { gridX, gridY, gridWidth, gridHeight, width, height } = this.asepriteFile.header;

        this.ctx.save();
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"; // Semi-transparent white
        this.ctx.lineWidth = 1;

        // Draw vertical grid lines
        for (let x = gridX; x < width; x += gridWidth) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * scale, 0);
            this.ctx.lineTo(x * scale, height * scale);
            this.ctx.stroke();
        }

        // Draw horizontal grid lines
        for (let y = gridY; y < height; y += gridHeight) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * scale);
            this.ctx.lineTo(width * scale, y * scale);
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    /**
     * Start sprite animation with optional tag selection
     * If no tag specified, plays through all frames
     * Resets animation state and begins playback loop
     */
    startAnimation(tagName?: string): void {
        this.currentTag = this.findTag(tagName);
        this.currentFrameIndex = this.currentTag ? this.currentTag.fromFrame : 0;
        this.tagFrameIndex = 0;
        this.playingForward = true; // For ping-pong animations
        this.lastFrameTime = performance.now();

        // Cancel any existing animation
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        // Start the animation loop
        this.animationId = requestAnimationFrame(() => this.animationLoop());
    }

    /**
     * Stop sprite animation and clean up animation frame request
     * Leaves the current frame displayed at its current position
     */
    stopAnimation(): void {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    /**
     * Main animation loop using requestAnimationFrame for smooth playback
     * Handles frame timing based on individual frame durations or global speed
     * Automatically stops if frame index becomes invalid
     */
    private animationLoop(): void {
        const currentTime = performance.now();
        const frame = this.asepriteFile.frames[this.currentFrameIndex];

        if (!frame) {
            // Invalid frame index - stop animation
            this.stopAnimation();
            return;
        }

        // Use frame duration or fall back to deprecated global speed (spec: File Format Changes #1)
        const frameDuration = frame.header.frameDuration || this.asepriteFile.header.speed;

        if (currentTime - this.lastFrameTime >= frameDuration) {
            this.advanceFrame();
            this.lastFrameTime = currentTime;
        }

        // Schedule next frame
        this.animationId = requestAnimationFrame(() => this.animationLoop());
    }

    /**
     * Advance to next frame based on animation tag settings
     * Implements all loop directions from spec: Forward, Reverse, Ping-pong variants
     */
    private advanceFrame(): void {
        if (!this.currentTag) {
            // No tag selected - loop through all frames
            this.currentFrameIndex = (this.currentFrameIndex + 1) % this.asepriteFile.frames.length;
            return;
        }

        const { fromFrame, toFrame, loopAnimationDirection } = this.currentTag;
        const frameCount = toFrame - fromFrame + 1;

        switch (loopAnimationDirection) {
            case LoopDirection.FORWARD:
                this.tagFrameIndex = (this.tagFrameIndex + 1) % frameCount;
                this.currentFrameIndex = fromFrame + this.tagFrameIndex;
                break;
            case LoopDirection.REVERSE:
                this.tagFrameIndex = (this.tagFrameIndex - 1 + frameCount) % frameCount;
                this.currentFrameIndex = fromFrame + this.tagFrameIndex;
                break;
            case LoopDirection.PING_PONG:
            case LoopDirection.PING_PONG_REVERSE:
                // Ping-pong: play forward then reverse
                if (this.playingForward) {
                    this.tagFrameIndex++;
                    if (this.tagFrameIndex >= frameCount - 1) {
                        this.playingForward = false;
                    }
                } else {
                    this.tagFrameIndex--;
                    if (this.tagFrameIndex <= 0) {
                        this.playingForward = true;
                    }
                }
                this.currentFrameIndex = fromFrame + this.tagFrameIndex;
                break;
        }
    }

    /**
     * Find animation tag by name across all frames
     * Tags are typically defined in the first frame but can appear in any frame
     * Returns the first matching tag found
     */
    private findTag(tagName?: string): TagChunk | undefined {
        if (!tagName) return undefined;

        // Search through all frames for the named tag
        for (const frame of this.asepriteFile.frames) {
            if (frame.tags) {
                const tag = frame.tags.find(t => t.name === tagName);
                if (tag) return tag;
            }
        }
        return undefined;
    }

    getCurrentFrame(): number {
        return this.currentFrameIndex;
    }

    getTotalFrames(): number {
        return this.asepriteFile.frames.length;
    }

    /**
     * Get all animation tags defined in the sprite
     * Collects tags from all frames (typically found in first frame)
     * Returns array of unique tag definitions
     */
    getTags(): TagChunk[] {
        const tags: TagChunk[] = [];
        for (const frame of this.asepriteFile.frames) {
            if (frame.tags) {
                tags.push(...frame.tags);
            }
        }
        return tags;
    }

    /**
     * Clean up renderer resources and stop any active animations
     * Should be called when the renderer is no longer needed
     */
    dispose(): void {
        this.stopAnimation();
    }
}
