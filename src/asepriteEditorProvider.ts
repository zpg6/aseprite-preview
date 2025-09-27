import * as vscode from "vscode";
import * as path from "path";
import { AsepriteParser, AsepriteFile } from "@aseprite-preview/parser";
import { AsepriteRenderer, RenderOptions } from "@aseprite-preview/renderer";

/**
 * VSCode custom editor provider for Aseprite files
 * Handles .ase and .aseprite file viewing with animation support
 */
export class AsepriteEditorProvider implements vscode.CustomReadonlyEditorProvider {
    /**
     * Register the custom editor provider with VSCode
     * Sets up webview options for proper resource handling
     */
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new AsepriteEditorProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            AsepriteEditorProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true, // Preserve state when hidden
                },
                supportsMultipleEditorsPerDocument: false, // One editor per file
            }
        );
        return providerRegistration;
    }

    private static readonly viewType = "aseprite-preview.asepriteEditor";

    constructor(private readonly context: vscode.ExtensionContext) {}

    /**
     * Create and parse Aseprite document from file URI
     * Handles file loading and ASE format parsing
     */
    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        _token: vscode.CancellationToken
    ): Promise<AsepriteDocument> {
        const document = await AsepriteDocument.create(uri, openContext.backupId);
        return document;
    }

    /**
     * Set up webview for Aseprite file display
     * Configures HTML content and message handling
     */
    async resolveCustomEditor(
        document: AsepriteDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true, // Required for interactive viewer
        };

        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document);

        // Handle messages from the webview
        webviewPanel.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case "ready":
                        // Webview is ready - send parsed Aseprite data
                        webviewPanel.webview.postMessage({
                            type: "asepriteData",
                            data: this.serializeAsepriteFile(document.asepriteFile),
                        });
                        break;
                    case "toggleAnimation":
                        // Handle animation toggle from webview
                        vscode.commands.executeCommand("aseprite-preview.toggleAnimation");
                        break;
                    case "exportPng":
                        // Handle PNG export from webview
                        this.handlePngExport(message.data, document);
                        break;
                    case "showError":
                        // Handle error messages from webview
                        vscode.window.showErrorMessage(message.message);
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );
    }

    private getHtmlForWebview(webview: vscode.Webview, document: AsepriteDocument): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "media", "asepriteViewer.js")
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "media", "asepriteViewer.css")
        );

        const nonce = this.getNonce();

        return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
      <link href="${styleUri}" rel="stylesheet">
      <title>Aseprite Preview</title>
    </head>
    <body>
      <div class="container">
        <div class="toolbar">
          <div class="controls">
            <button id="playPause" class="control-btn play-btn" title="Play/Pause Animation">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
            <button id="stop" class="control-btn stop-btn" title="Stop Animation">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12"/>
              </svg>
            </button>
            <span class="frame-info">
              Frame: <span id="currentFrame">1</span> / <span id="totalFrames">1</span>
            </span>
            <button id="exportPng" class="control-btn export-btn" title="Export as PNG">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/>
              </svg>
            </button>
          </div>
          <div class="settings">
            <label>
              Scale: 
              <select id="scaleSelect">
                <option value="1">1x</option>
                <option value="2" selected>2x</option>
                <option value="4">4x</option>
                <option value="8">8x</option>
                <option value="16">16x</option>
              </select>
            </label>
            <label>
              <input type="checkbox" id="showGrid"> Show Grid
            </label>
            <label>
              <input type="checkbox" id="pixelPerfect"> Pixel Perfect
            </label>
            <label>
              Background: 
              <select id="backgroundSelect">
                <option value="transparent" selected>Transparent</option>
                <option value="white">White</option>
                <option value="black">Black</option>
                <option value="checkerboard">Checkerboard</option>
              </select>
            </label>
          </div>
        </div>
        <div class="canvas-container" id="canvasContainer">
          <canvas id="asepriteCanvas"></canvas>
        </div>
        <div class="info-panel">
          <div class="sprite-info">
            <h3>Sprite Information</h3>
            <div class="info-grid">
              <span>Size:</span> <span id="spriteSize">-</span>
              <span>Color Depth:</span> <span id="colorDepth">-</span>
              <span>Frames:</span> <span id="frameCount">-</span>
              <span>Duration:</span> <span id="totalDuration">-</span>
            </div>
          </div>
          <div class="tags-panel" id="tagsPanel" style="display: none;">
            <h3>Animation Tags</h3>
            <div id="tagsList"></div>
          </div>
        </div>
      </div>
      <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
    }

    private getNonce(): string {
        let text = "";
        const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Handle PNG export request from webview
     * Saves the exported PNG data to a file chosen by the user
     */
    private async handlePngExport(
        exportData: { pngData: string; filename: string },
        document: AsepriteDocument
    ): Promise<void> {
        try {
            // Convert base64 data to buffer
            const base64Data = exportData.pngData.replace(/^data:image\/png;base64,/, "");
            const buffer = Buffer.from(base64Data, "base64");

            // Get the original file's directory and name
            const originalUri = document.uri;
            const originalName = path.basename(originalUri.fsPath, path.extname(originalUri.fsPath));

            // Show save dialog
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.joinPath(
                    vscode.Uri.file(path.dirname(originalUri.fsPath)),
                    `${originalName}.png`
                ),
                filters: {
                    "PNG Images": ["png"],
                },
            });

            if (saveUri) {
                // Write the PNG file
                await vscode.workspace.fs.writeFile(saveUri, buffer);
                vscode.window.showInformationMessage(`PNG exported successfully: ${path.basename(saveUri.fsPath)}`);
            }
        } catch (error) {
            console.error("Error exporting PNG:", error);
            vscode.window.showErrorMessage(`Failed to export PNG: ${error}`);
        }
    }

    /**
     * Convert AsepriteFile to JSON-serializable format for webview
     * Pre-processes compressed data to avoid ZLIB dependency in webview
     */
    private serializeAsepriteFile(asepriteFile: AsepriteFile): unknown {
        return {
            header: asepriteFile.header,
            frames: asepriteFile.frames.map(frame => ({
                header: frame.header,
                layers: frame.layers,
                cels: frame.cels.map(cel => {
                    let processedImageData: number[] | undefined;

                    // Decompress image data on extension side to avoid webview complexity
                    if (cel.compressedData && cel.width && cel.height) {
                        try {
                            const decompressed = AsepriteParser.decompressImageData(cel.compressedData);
                            processedImageData = Array.from(decompressed);
                        } catch (error) {
                            console.error("Failed to decompress cel data:", error);
                            processedImageData = cel.rawPixelData ? Array.from(cel.rawPixelData) : undefined;
                        }
                    } else if (cel.rawPixelData) {
                        processedImageData = Array.from(cel.rawPixelData);
                    }

                    return {
                        ...cel,
                        // Remove binary data and provide processed arrays for webview
                        compressedData: undefined,
                        rawPixelData: undefined,
                        processedImageData,
                    };
                }),
                palette: frame.palette
                    ? {
                          ...frame.palette,
                          entries: frame.palette.entries.map(entry => ({
                              ...entry,
                          })),
                      }
                    : undefined,
                tags: frame.tags,
                userData: frame.userData,
                slices: frame.slices,
                tileset: frame.tileset
                    ? {
                          ...frame.tileset,
                          compressedImageData: frame.tileset.compressedImageData
                              ? Array.from(frame.tileset.compressedImageData)
                              : undefined,
                      }
                    : undefined,
                colorProfile: frame.colorProfile
                    ? {
                          ...frame.colorProfile,
                          iccProfileData: frame.colorProfile.iccProfileData
                              ? Array.from(frame.colorProfile.iccProfileData)
                              : undefined,
                      }
                    : undefined,
                externalFiles: frame.externalFiles,
            })),
            globalPalette: asepriteFile.globalPalette
                ? {
                      ...asepriteFile.globalPalette,
                      entries: asepriteFile.globalPalette.entries.map(entry => ({
                          ...entry,
                      })),
                  }
                : undefined,
        };
    }
}

/**
 * Document wrapper for Aseprite files
 * Handles file loading and maintains parsed ASE data
 */
class AsepriteDocument implements vscode.CustomDocument {
    /**
     * Create document from file URI with optional backup support
     */
    static async create(uri: vscode.Uri, backupId: string | undefined): Promise<AsepriteDocument> {
        const dataFile = backupId ? vscode.Uri.parse(backupId) : uri;
        const fileData = await AsepriteDocument.readFile(dataFile);
        return new AsepriteDocument(uri, fileData);
    }

    /**
     * Read file data from URI
     * Handles untitled files and workspace file system
     */
    private static async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        if (uri.scheme === "untitled") {
            return new Uint8Array(); // Empty data for untitled files
        }
        return new Uint8Array(await vscode.workspace.fs.readFile(uri));
    }

    private readonly _uri: vscode.Uri;
    private _asepriteFile: AsepriteFile;

    /**
     * Private constructor - use create() method instead
     * Parses ASE file data using AsepriteParser
     */
    private constructor(uri: vscode.Uri, initialContent: Uint8Array) {
        this._uri = uri;
        try {
            this._asepriteFile = AsepriteParser.parse(Buffer.from(initialContent));
        } catch (error) {
            throw new Error(`Failed to parse Aseprite file: ${error}`);
        }
    }

    public get uri(): vscode.Uri {
        return this._uri;
    }

    public get asepriteFile(): AsepriteFile {
        return this._asepriteFile;
    }

    dispose(): void {
        // Clean up resources if needed
    }
}
