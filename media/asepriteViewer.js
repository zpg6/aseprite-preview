(function () {
    const vscode = acquireVsCodeApi();

    let asepriteData = null;
    let renderer = null;
    let isPlaying = false;
    let currentFrame = 0;
    let currentTag = null;
    let animationId = null;

    // DOM elements
    const canvas = document.getElementById("asepriteCanvas");
    const playPauseBtn = document.getElementById("playPause");
    const stopBtn = document.getElementById("stop");
    const exportPngBtn = document.getElementById("exportPng");
    const scaleSelect = document.getElementById("scaleSelect");
    const showGridCheckbox = document.getElementById("showGrid");
    const pixelPerfectCheckbox = document.getElementById("pixelPerfect");
    const backgroundSelect = document.getElementById("backgroundSelect");
    const canvasContainer = document.getElementById("canvasContainer");
    const currentFrameSpan = document.getElementById("currentFrame");
    const totalFramesSpan = document.getElementById("totalFrames");
    const spriteSizeSpan = document.getElementById("spriteSize");
    const colorDepthSpan = document.getElementById("colorDepth");
    const frameCountSpan = document.getElementById("frameCount");
    const totalDurationSpan = document.getElementById("totalDuration");
    const tagsPanel = document.getElementById("tagsPanel");
    const tagsList = document.getElementById("tagsList");

    // Initialize
    document.addEventListener("DOMContentLoaded", () => {
        vscode.postMessage({ type: "ready" });
        setupEventListeners();
    });

    function setupEventListeners() {
        playPauseBtn.addEventListener("click", togglePlayback);
        stopBtn.addEventListener("click", stopPlayback);
        exportPngBtn.addEventListener("click", exportCurrentFrameAsPng);
        scaleSelect.addEventListener("change", updateRender);
        showGridCheckbox.addEventListener("change", updateRender);
        pixelPerfectCheckbox.addEventListener("change", updatePixelPerfect);
        backgroundSelect.addEventListener("change", updateBackground);

        canvas.addEventListener("click", e => {
            if (asepriteData && asepriteData.frames.length > 1) {
                // Click to advance frame manually when paused
                if (!isPlaying) {
                    currentFrame = (currentFrame + 1) % asepriteData.frames.length;
                    updateRender();
                }
            }
        });
    }

    // Handle messages from the extension
    window.addEventListener("message", event => {
        const message = event.data;
        switch (message.type) {
            case "asepriteData":
                handleAsepriteData(message.data);
                break;
        }
    });

    function handleAsepriteData(data) {
        asepriteData = data;

        // Convert arrays back to Uint8Arrays
        if (asepriteData.frames) {
            asepriteData.frames.forEach(frame => {
                frame.cels.forEach(cel => {
                    if (cel.processedImageData) {
                        cel.processedImageData = new Uint8Array(cel.processedImageData);
                    }
                });

                if (frame.tileset && frame.tileset.compressedImageData) {
                    frame.tileset.compressedImageData = new Uint8Array(frame.tileset.compressedImageData);
                }

                if (frame.colorProfile && frame.colorProfile.iccProfileData) {
                    frame.colorProfile.iccProfileData = new Uint8Array(frame.colorProfile.iccProfileData);
                }
            });
        }

        initializeViewer();
    }

    function initializeViewer() {
        if (!asepriteData) return;

        const header = asepriteData.header;

        // Update UI with sprite information
        spriteSizeSpan.textContent = `${header.width} × ${header.height}`;
        colorDepthSpan.textContent = getColorDepthName(header.colorDepth);
        frameCountSpan.textContent = header.frames.toString();
        totalFramesSpan.textContent = header.frames.toString();

        // Calculate total duration
        let totalDuration = 0;
        asepriteData.frames.forEach(frame => {
            totalDuration += frame.header.frameDuration || header.speed;
        });
        totalDurationSpan.textContent = `${totalDuration}ms`;

        // Setup tags
        setupTags();

        // Initialize renderer
        renderer = new AsepriteRenderer(canvas, asepriteData);

        // Set initial pixel perfect state
        updatePixelPerfect();

        // Initial render
        updateRender();
        updateBackground();
    }

    function getColorDepthName(colorDepth) {
        switch (colorDepth) {
            case 8:
                return "Indexed (8-bit)";
            case 16:
                return "Grayscale (16-bit)";
            case 32:
                return "RGBA (32-bit)";
            default:
                return `${colorDepth}-bit`;
        }
    }

    function setupTags() {
        const allTags = [];

        // Collect all unique tags
        asepriteData.frames.forEach(frame => {
            if (frame.tags) {
                frame.tags.forEach(tag => {
                    if (!allTags.find(t => t.name === tag.name)) {
                        allTags.push(tag);
                    }
                });
            }
        });

        if (allTags.length > 0) {
            tagsPanel.style.display = "block";
            tagsList.innerHTML = "";

            allTags.forEach(tag => {
                const tagElement = document.createElement("div");
                tagElement.className = "tag-item";
                tagElement.innerHTML = `
          <div class="tag-color" style="background-color: rgb(${tag.color.r}, ${tag.color.g}, ${tag.color.b})"></div>
          <div class="tag-name">${tag.name}</div>
          <div class="tag-frames">${tag.fromFrame}-${tag.toFrame}</div>
        `;

                tagElement.addEventListener("click", () => {
                    selectTag(tag);
                });

                tagsList.appendChild(tagElement);
            });
        }
    }

    function selectTag(tag) {
        currentTag = tag;
        currentFrame = tag.fromFrame;

        // Update active tag in UI
        document.querySelectorAll(".tag-item").forEach(item => {
            item.classList.remove("active");
        });
        event.currentTarget.classList.add("active");

        updateRender();
    }

    function updateRender() {
        if (!renderer || !asepriteData) return;

        const options = {
            scale: parseInt(scaleSelect.value),
            showGrid: showGridCheckbox.checked,
            backgroundColor: getBackgroundColor(),
            currentFrame: currentFrame,
            pixelPerfect: pixelPerfectCheckbox.checked,
        };

        renderer.render(options);
        currentFrameSpan.textContent = (currentFrame + 1).toString();
    }

    function updatePixelPerfect() {
        if (pixelPerfectCheckbox.checked) {
            // Pixel Perfect is ON - add pixelated class for crisp pixel art
            canvas.classList.add("pixelated");
        } else {
            // Pixel Perfect is OFF - remove pixelated class for smooth rendering
            canvas.classList.remove("pixelated");
        }
        updateRender();
    }

    function getBackgroundColor() {
        switch (backgroundSelect.value) {
            case "white":
                return "#ffffff";
            case "black":
                return "#000000";
            case "transparent":
                return "transparent";
            default:
                return "transparent";
        }
    }

    function updateBackground() {
        canvasContainer.className = "canvas-container";
        if (backgroundSelect.value === "checkerboard") {
            canvasContainer.classList.add("checkerboard");
        } else if (backgroundSelect.value === "white") {
            canvasContainer.classList.add("white");
        } else if (backgroundSelect.value === "black") {
            canvasContainer.classList.add("black");
        }
    }

    function togglePlayback() {
        if (!asepriteData || asepriteData.frames.length <= 1) return;

        if (isPlaying) {
            pauseAnimation();
        } else {
            startAnimation();
        }
    }

    function startAnimation() {
        if (!asepriteData || asepriteData.frames.length <= 1) return;

        isPlaying = true;
        playPauseBtn.classList.add("playing");
        playPauseBtn.title = "Pause Animation";

        animationLoop();
    }

    function pauseAnimation() {
        isPlaying = false;
        playPauseBtn.classList.remove("playing");
        playPauseBtn.title = "Play Animation";

        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    function stopPlayback() {
        pauseAnimation();
        currentFrame = currentTag ? currentTag.fromFrame : 0;
        updateRender();
    }

    let lastFrameTime = 0;

    function animationLoop(timestamp) {
        if (!isPlaying) return;

        const frame = asepriteData.frames[currentFrame];
        const frameDuration = frame.header.frameDuration || asepriteData.header.speed;

        if (timestamp - lastFrameTime >= frameDuration) {
            advanceFrame();
            updateRender();
            lastFrameTime = timestamp;
        }

        animationId = requestAnimationFrame(animationLoop);
    }

    function advanceFrame() {
        if (currentTag) {
            // Animate within tag bounds
            const frameCount = currentTag.toFrame - currentTag.fromFrame + 1;
            const tagFrameIndex = currentFrame - currentTag.fromFrame;
            const nextTagFrameIndex = (tagFrameIndex + 1) % frameCount;
            currentFrame = currentTag.fromFrame + nextTagFrameIndex;
        } else {
            // Animate all frames
            currentFrame = (currentFrame + 1) % asepriteData.frames.length;
        }
    }

    function exportCurrentFrameAsPng() {
        if (!renderer || !asepriteData) {
            vscode.postMessage({
                type: "showError",
                message: "No sprite data available for export",
            });
            return;
        }

        try {
            // Get current scale from UI
            const currentScale = parseInt(scaleSelect.value);

            // Create a clean export canvas without grid or UI elements
            const exportCanvas = document.createElement("canvas");
            const exportCtx = exportCanvas.getContext("2d");
            const header = asepriteData.header;

            // Set canvas size to scaled dimensions
            exportCanvas.width = header.width * currentScale;
            exportCanvas.height = header.height * currentScale;
            exportCtx.imageSmoothingEnabled = !pixelPerfectCheckbox.checked;

            // Clear with transparent background
            exportCtx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);

            // Get current frame
            const frame = asepriteData.frames[currentFrame];
            if (!frame) {
                throw new Error("Invalid frame for export");
            }

            // Render the current frame to export canvas at the selected scale
            frame.cels.forEach(cel => {
                renderCelToCanvas(cel, exportCtx, currentScale);
            });

            // Convert canvas to PNG data
            exportCanvas.toBlob(blob => {
                if (!blob) {
                    throw new Error("Failed to generate PNG data");
                }

                const reader = new FileReader();
                reader.onload = function () {
                    // Generate filename with scale information
                    const frameNumber = String(currentFrame + 1).padStart(3, "0");
                    const tagSuffix = currentTag ? `_${currentTag.name}` : "";
                    const scaleSuffix = currentScale > 1 ? `_${currentScale}x` : "";
                    const filename = `frame_${frameNumber}${tagSuffix}${scaleSuffix}.png`;

                    // Send PNG data to extension
                    vscode.postMessage({
                        type: "exportPng",
                        data: {
                            pngData: reader.result,
                            filename: filename,
                        },
                    });
                };
                reader.readAsDataURL(blob);
            }, "image/png");
        } catch (error) {
            console.error("Export error:", error);
            vscode.postMessage({
                type: "showError",
                message: `Export failed: ${error.message}`,
            });
        }
    }

    function renderCelToCanvas(cel, ctx, scale) {
        if (!cel.width || !cel.height || !cel.processedImageData) return;

        const imageData = cel.processedImageData;

        // Create ImageData object
        const canvasImageData = ctx.createImageData(cel.width, cel.height);

        // Convert pixel data based on color depth
        convertPixelDataForExport(imageData, canvasImageData.data, asepriteData.header.colorDepth);

        // Create a temporary canvas to draw the cel
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = cel.width;
        tempCanvas.height = cel.height;
        const tempCtx = tempCanvas.getContext("2d");
        tempCtx.imageSmoothingEnabled = false;

        // Put the image data on the temporary canvas
        tempCtx.putImageData(canvasImageData, 0, 0);

        // Draw the scaled cel to the target canvas
        ctx.drawImage(
            tempCanvas,
            0,
            0,
            cel.width,
            cel.height,
            cel.x * scale,
            cel.y * scale,
            cel.width * scale,
            cel.height * scale
        );
    }

    function convertPixelDataForExport(sourceData, targetData, colorDepth) {
        const palette = asepriteData.globalPalette;

        switch (colorDepth) {
            case 32: // RGBA
                for (let i = 0; i < sourceData.length; i++) {
                    targetData[i] = sourceData[i];
                }
                break;

            case 16: // Grayscale
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

            case 8: // Indexed
                if (!palette) {
                    console.error("No palette found for indexed color sprite");
                    return;
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
                        targetData[i * 4] = 0;
                        targetData[i * 4 + 1] = 0;
                        targetData[i * 4 + 2] = 0;
                        targetData[i * 4 + 3] = 0;
                    }
                }
                break;

            default:
                console.error(`Unsupported color depth: ${colorDepth}`);
        }
    }

    // Enhanced AsepriteRenderer using logic from packages/renderer
    class AsepriteRenderer {
        constructor(canvas, asepriteFile) {
            this.canvas = canvas;
            this.ctx = canvas.getContext("2d");
            this.asepriteFile = asepriteFile;
            this.ctx.imageSmoothingEnabled = false;
        }

        render(options) {
            const { scale, showGrid, currentFrame, pixelPerfect, backgroundColor = "transparent" } = options;
            const header = this.asepriteFile.header;

            // Set canvas size
            const scaledWidth = header.width * scale;
            const scaledHeight = header.height * scale;
            this.canvas.width = scaledWidth;
            this.canvas.height = scaledHeight;

            // Update context settings
            this.ctx.imageSmoothingEnabled = !pixelPerfect;

            // Clear canvas with background
            if (backgroundColor !== "transparent") {
                this.ctx.fillStyle = backgroundColor;
                this.ctx.fillRect(0, 0, scaledWidth, scaledHeight);
            } else {
                this.ctx.clearRect(0, 0, scaledWidth, scaledHeight);
            }

            // Get the frame to render
            const frame = this.asepriteFile.frames[currentFrame];
            if (!frame) return;

            // Collect and sort layers properly (using packages/renderer logic)
            const layerRenderInfos = this.collectLayerRenderInfo(frame);
            layerRenderInfos.sort((a, b) => {
                const orderA = a.layerIndex + a.zIndex;
                const orderB = b.layerIndex + b.zIndex;
                return orderA !== orderB ? orderA - orderB : a.zIndex - b.zIndex;
            });

            // Render each layer with proper compositing
            for (const renderInfo of layerRenderInfos) {
                if (renderInfo.visible) {
                    this.renderLayer(frame, renderInfo, scale);
                }
            }

            // Draw grid if enabled
            if (showGrid && header.gridWidth > 0 && header.gridHeight > 0) {
                this.drawGrid(scale);
            }
        }

        collectLayerRenderInfo(frame) {
            const renderInfos = [];
            const layerMap = new Map();

            // Use layers from first frame as they define the global layer layout
            // According to ASE spec: "In the first frame should be a set of layer chunks to determine the entire layers layout"
            const globalLayers = this.asepriteFile.frames[0].layers;
            globalLayers.forEach((layer, index) => {
                layerMap.set(index, layer);
            });

            for (const cel of frame.cels) {
                const layer = layerMap.get(cel.layerIndex);
                if (!layer || layer.type === 1) continue; // Skip group layers

                const visible = (layer.flags & 1) !== 0;
                const opacity = (cel.opacity / 255) * (layer.opacity / 255);

                renderInfos.push({
                    layer,
                    layerIndex: cel.layerIndex,
                    visible,
                    opacity,
                    zIndex: cel.zIndex || 0,
                });
            }

            return renderInfos;
        }

        renderLayer(frame, renderInfo, scale) {
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

        renderCel(cel, ctx) {
            if (!cel.width || !cel.height || !cel.processedImageData) return;

            const canvasImageData = ctx.createImageData(cel.width, cel.height);
            this.convertPixelData(cel.processedImageData, canvasImageData.data, this.asepriteFile.header.colorDepth);
            ctx.putImageData(canvasImageData, cel.x, cel.y);
        }

        convertPixelData(sourceData, targetData, colorDepth) {
            const palette = this.asepriteFile.globalPalette;

            switch (colorDepth) {
                case 32: // RGBA
                    for (let i = 0; i < sourceData.length; i++) {
                        targetData[i] = sourceData[i];
                    }
                    break;

                case 16: // Grayscale
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

                case 8: // Indexed
                    if (!palette) {
                        console.error("No palette found for indexed color sprite");
                        return;
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
                            targetData[i * 4] = 0;
                            targetData[i * 4 + 1] = 0;
                            targetData[i * 4 + 2] = 0;
                            targetData[i * 4 + 3] = 0;
                        }
                    }
                    break;

                default:
                    console.error(`Unsupported color depth: ${colorDepth}`);
            }
        }

        getBlendModeString(blendMode) {
            switch (blendMode) {
                case 0:
                    return "source-over"; // NORMAL
                case 1:
                    return "multiply"; // MULTIPLY
                case 2:
                    return "screen"; // SCREEN
                case 3:
                    return "overlay"; // OVERLAY
                case 4:
                    return "darken"; // DARKEN
                case 5:
                    return "lighten"; // LIGHTEN
                case 6:
                    return "color-dodge"; // COLOR_DODGE
                case 7:
                    return "color-burn"; // COLOR_BURN
                case 8:
                    return "hard-light"; // HARD_LIGHT
                case 9:
                    return "soft-light"; // SOFT_LIGHT
                case 10:
                    return "difference"; // DIFFERENCE
                case 11:
                    return "exclusion"; // EXCLUSION
                default:
                    return "source-over";
            }
        }

        drawGrid(scale) {
            const { gridX, gridY, gridWidth, gridHeight, width, height } = this.asepriteFile.header;

            this.ctx.save();
            this.ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
            this.ctx.lineWidth = 1;

            // Draw vertical lines
            for (let x = gridX; x < width; x += gridWidth) {
                this.ctx.beginPath();
                this.ctx.moveTo(x * scale, 0);
                this.ctx.lineTo(x * scale, height * scale);
                this.ctx.stroke();
            }

            // Draw horizontal lines
            for (let y = gridY; y < height; y += gridHeight) {
                this.ctx.beginPath();
                this.ctx.moveTo(0, y * scale);
                this.ctx.lineTo(width * scale, y * scale);
                this.ctx.stroke();
            }

            this.ctx.restore();
        }
    }
})();
