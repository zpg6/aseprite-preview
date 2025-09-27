/**
 * ASE file header structure (128 bytes total)
 * Uses Intel (little-endian) byte order as per spec
 */
export interface AsepriteHeader {
    /** File size in bytes (DWORD) */
    fileSize: number;
    /** Magic number (0xA5E0) for file format identification (WORD) */
    magicNumber: number;
    /** Number of frames in the sprite (WORD) */
    frames: number;
    /** Sprite width in pixels (WORD) */
    width: number;
    /** Sprite height in pixels (WORD) */
    height: number;
    /** Color depth: 8=Indexed, 16=Grayscale, 32=RGBA (WORD) */
    colorDepth: number;
    /**
     * Header flags (DWORD):
     * 1 = Layer opacity has valid value
     * 2 = Layer blend mode/opacity is valid for groups
     * 4 = Layers have an UUID
     */
    flags: number;
    /**
     * DEPRECATED: Speed in milliseconds between frames (WORD)
     * Use frame duration field from each frame header instead
     */
    speed: number;
    /** Palette entry index representing transparent color for non-background layers (BYTE) */
    transparentIndex: number;
    /** Number of colors (0 means 256 for old sprites) (WORD) */
    numberOfColors: number;
    /** Pixel width for aspect ratio (pixel ratio = width/height) (BYTE) */
    pixelWidth: number;
    /** Pixel height for aspect ratio (BYTE) */
    pixelHeight: number;
    /** X position of the grid (SHORT) */
    gridX: number;
    /** Y position of the grid (SHORT) */
    gridY: number;
    /** Grid width (0 if no grid, default 16x16) (WORD) */
    gridWidth: number;
    /** Grid height (0 if no grid) (WORD) */
    gridHeight: number;
}

/**
 * Frame header structure (16 bytes)
 * Each frame contains this header followed by chunk data
 */
export interface FrameHeader {
    /** Total bytes in this frame including header (DWORD) */
    bytesInFrame: number;
    /** Frame magic number (always 0xF1FA) (WORD) */
    magicNumber: number;
    /** Legacy chunk count field (WORD). If 0xFFFF, use newChunksCount */
    oldChunksCount: number;
    /** Frame duration in milliseconds (WORD) */
    frameDuration: number;
    /** Actual chunk count (DWORD). Use this if oldChunksCount is 0 */
    newChunksCount: number;
}

/**
 * Chunk header structure (6 bytes minimum)
 * Precedes all chunk data in frames
 */
export interface ChunkHeader {
    /** Chunk size including this header (DWORD, minimum 6 bytes) */
    size: number;
    /** Chunk type identifier (WORD) - see ChunkType enum */
    type: number;
}

/**
 * Layer Chunk (0x2004) - defines layer properties
 * Appears in first frame to establish layer hierarchy
 */
export interface LayerChunk {
    /**
     * Layer flags (WORD):
     * 1 = Visible, 2 = Editable, 4 = Lock movement, 8 = Background,
     * 16 = Prefer linked cels, 32 = Group collapsed, 64 = Reference layer
     */
    flags: number;
    /** Layer type (WORD): 0=Normal, 1=Group, 2=Tilemap */
    type: number;
    /** Child level for layer hierarchy (WORD) - see spec NOTE.1 */
    childLevel: number;
    /** Blend mode (WORD) - see BlendMode enum for values */
    blendMode: number;
    /** Layer opacity 0-255 (BYTE) */
    opacity: number;
    /** Layer name (STRING) */
    name: string;
    /** Tileset index (DWORD) - only present for tilemap layers */
    tilesetIndex?: number;
    /** Layer UUID (16 bytes) - only if header flags bit 4 is set */
    uuid?: Uint8Array;
}

/**
 * Cel Chunk (0x2005) - specifies where to place a cel in a layer/frame
 * Contains actual image or tilemap data
 */
export interface CelChunk {
    /** Layer index this cel belongs to (WORD) - see spec NOTE.2 */
    layerIndex: number;
    /** X position of cel in sprite (SHORT) */
    x: number;
    /** Y position of cel in sprite (SHORT) */
    y: number;
    /** Cel opacity level 0-255 (BYTE) */
    opacity: number;
    /** Cel type (WORD): 0=Raw, 1=Linked, 2=Compressed Image, 3=Compressed Tilemap */
    type: number;
    /** Z-Index for layer ordering (SHORT) - see spec NOTE.5 for sorting algorithm */
    zIndex: number;
    /** Image width in pixels (WORD) - for image cel types */
    width?: number;
    /** Image height in pixels (WORD) - for image cel types */
    height?: number;
    /** Raw pixel data (PIXEL[]) - for cel type 0 */
    rawPixelData?: Uint8Array;
    /** Frame position to link with (WORD) - for cel type 1 */
    linkedFrame?: number;
    /** ZLIB compressed image data - for cel types 2 and 3 */
    compressedData?: Uint8Array;
    /** Width in number of tiles (WORD) - for tilemap cels */
    widthInTiles?: number;
    /** Height in number of tiles (WORD) - for tilemap cels */
    heightInTiles?: number;
    /** Bits per tile (WORD) - currently always 32-bit */
    bitsPerTile?: number;
    /** Bitmask for tile ID (DWORD) - e.g. 0x1fffffff for 32-bit tiles */
    tileIdMask?: number;
    /** Bitmask for X flip (DWORD) */
    xFlipMask?: number;
    /** Bitmask for Y flip (DWORD) */
    yFlipMask?: number;
    /** Bitmask for diagonal flip/swap X/Y axis (DWORD) */
    diagonalFlipMask?: number;
}

/**
 * Individual palette color entry
 * Each entry represents one color in the palette
 */
export interface PaletteEntry {
    /** Entry flags (WORD): 1 = Has name */
    flags: number;
    /** Red component 0-255 (BYTE) */
    red: number;
    /** Green component 0-255 (BYTE) */
    green: number;
    /** Blue component 0-255 (BYTE) */
    blue: number;
    /** Alpha component 0-255 (BYTE) */
    alpha: number;
    /** Color name (STRING) - only if flags bit 1 is set */
    name?: string;
}

/**
 * Palette Chunk (0x2019) - defines sprite color palette
 * Replaces old palette chunks (0x0004, 0x0011)
 */
export interface PaletteChunk {
    /** Total palette size/number of entries (DWORD) */
    newPaletteSize: number;
    /** First color index to change (DWORD) */
    firstColorIndex: number;
    /** Last color index to change (DWORD) */
    lastColorIndex: number;
    /** Array of palette color entries */
    entries: PaletteEntry[];
}

/**
 * Tag Chunk (0x2018) - defines animation tags/sequences
 * Multiple user data chunks can follow for each tag
 */
export interface TagChunk {
    /** Starting frame of animation tag (WORD) */
    fromFrame: number;
    /** Ending frame of animation tag (WORD) */
    toFrame: number;
    /** Loop direction (BYTE): 0=Forward, 1=Reverse, 2=Ping-pong, 3=Ping-pong Reverse */
    loopAnimationDirection: number;
    /** Repeat count (WORD): 0=infinite, 1=once, N=N times */
    repeat: number;
    /** Tag color (3 BYTES) - deprecated, use user data color instead */
    color: { r: number; g: number; b: number };
    /** Tag name (STRING) */
    name: string;
}

/**
 * User Data Chunk (0x2020) - associates user data with last read chunk/object
 * Can contain text, color, and/or custom properties
 */
export interface UserDataChunk {
    /** Flags (DWORD): 1=Has text, 2=Has color, 4=Has properties */
    flags: number;
    /** User text (STRING) - if flags bit 1 is set */
    text?: string;
    /** User color RGBA (4 BYTES) - if flags bit 2 is set */
    color?: { r: number; g: number; b: number; a: number };
    /** Custom properties map - if flags bit 4 is set */
    properties?: Map<string, unknown>;
}

/**
 * Slice key defines slice bounds for a specific frame
 * Part of slice animation system
 */
export interface SliceKey {
    /** Frame number this slice key is valid from (DWORD) */
    frameNumber: number;
    /** Slice X origin in sprite coordinates (LONG) */
    x: number;
    /** Slice Y origin in sprite coordinates (LONG) */
    y: number;
    /** Slice width (DWORD, can be 0 if hidden) */
    width: number;
    /** Slice height (DWORD) */
    height: number;
    /** 9-patch center X position relative to slice bounds (LONG) */
    centerX?: number;
    /** 9-patch center Y position relative to slice bounds (LONG) */
    centerY?: number;
    /** 9-patch center width (DWORD) */
    centerWidth?: number;
    /** 9-patch center height (DWORD) */
    centerHeight?: number;
    /** Pivot X position relative to slice origin (LONG) */
    pivotX?: number;
    /** Pivot Y position relative to slice origin (LONG) */
    pivotY?: number;
}

/**
 * Slice Chunk (0x2022) - defines UI slices for 9-patch scaling
 * Contains multiple slice keys for animation
 */
export interface SliceChunk {
    /** Slice flags (DWORD): 1=9-patches slice, 2=Has pivot information */
    flags: number;
    /** Slice name (STRING) */
    name: string;
    /** Array of slice keys defining bounds over time */
    keys: SliceKey[];
}

/**
 * Tileset Chunk (0x2023) - defines tileset for tilemap layers
 * Can reference external files or contain embedded tile data
 */
export interface TilesetChunk {
    /** Tileset ID (DWORD) */
    id: number;
    /**
     * Tileset flags (DWORD):
     * 1 = Link to external file, 2 = Tiles inside file, 4 = Tile ID=0 is empty,
     * 8 = Auto X flip matching, 16 = Auto Y flip, 32 = Auto diagonal flip
     */
    flags: number;
    /** Number of tiles in tileset (DWORD) */
    numberOfTiles: number;
    /** Individual tile width in pixels (WORD) */
    tileWidth: number;
    /** Individual tile height in pixels (WORD) */
    tileHeight: number;
    /** Base index for UI display (SHORT) - usually 1 for 1-based indexing */
    baseIndex: number;
    /** Tileset name (STRING) */
    name: string;
    /** External file ID reference (DWORD) - if flags bit 1 is set */
    externalFileId?: number;
    /** Tileset ID in external file (DWORD) - if flags bit 1 is set */
    externalTilesetId?: number;
    /** ZLIB compressed tileset image data - if flags bit 2 is set */
    compressedImageData?: Uint8Array;
}

/**
 * Color Profile Chunk (0x2007) - defines color profile for RGB/grayscale
 * Specifies color space and gamma correction
 */
export interface ColorProfileChunk {
    /** Profile type (WORD): 0=none, 1=sRGB, 2=embedded ICC */
    type: number;
    /** Profile flags (WORD): 1=use special fixed gamma */
    flags: number;
    /** Fixed gamma value (FIXED 16.16) - 1.0=linear, sRGB uses complex gamma curve */
    fixedGamma: number;
    /** ICC profile data (BYTE[]) - if type is 2 */
    iccProfileData?: Uint8Array;
}

/**
 * External file entry for referencing external resources
 * Used by tilesets, palettes, or extensions
 */
export interface ExternalFileEntry {
    /** Entry ID referenced by other chunks (DWORD) */
    id: number;
    /** File type (BYTE): 0=palette, 1=tileset, 2=extension properties, 3=tile management */
    type: number;
    /** External file name or extension ID like 'publisher/ExtensionName' (STRING) */
    fileName: string;
}

/**
 * External Files Chunk (0x2008) - lists external files linked to this sprite
 * Appears in first frame, references external palettes/tilesets/extensions
 */
export interface ExternalFilesChunk {
    /** Array of external file entries */
    entries: ExternalFileEntry[];
}

/**
 * Complete frame structure containing header and all chunk data
 * Represents one frame in the sprite animation
 */
export interface AsepriteFrame {
    /** Frame header with timing and chunk count info */
    header: FrameHeader;
    /** Layer definitions (typically only in first frame) */
    layers: LayerChunk[];
    /** Cel data for this frame */
    cels: CelChunk[];
    /** Palette data (if present in this frame) */
    palette?: PaletteChunk;
    /** Animation tags (if present in this frame) */
    tags?: TagChunk[];
    /** User data associated with chunks in this frame */
    userData?: UserDataChunk[];
    /** UI slices (if present in this frame) */
    slices?: SliceChunk[];
    /** Tileset definition (if present in this frame) */
    tileset?: TilesetChunk;
    /** Color profile (if present in this frame) */
    colorProfile?: ColorProfileChunk;
    /** External file references (typically only in first frame) */
    externalFiles?: ExternalFilesChunk;
}

/**
 * Complete Aseprite file structure
 * Root object containing all sprite data
 */
export interface AsepriteFile {
    /** File header with sprite dimensions and global settings */
    header: AsepriteHeader;
    /** Array of all frames in the sprite */
    frames: AsepriteFrame[];
    /** Global palette extracted from first frame with palette data */
    globalPalette?: PaletteChunk;
}

/**
 * Chunk type identifiers as defined in the ASE specification
 * Used to identify different types of data within frames
 */
export enum ChunkType {
    /** Old palette chunk (0x0004) - ignore if new palette (0x2019) exists */
    OLD_PALETTE_04 = 0x0004,
    /** Old palette chunk (0x0011) - ignore if new palette (0x2019) exists */
    OLD_PALETTE_11 = 0x0011,
    /** Layer chunk (0x2004) - defines layer properties */
    LAYER = 0x2004,
    /** Cel chunk (0x2005) - contains image/tilemap data */
    CEL = 0x2005,
    /** Cel extra chunk (0x2006) - adds extra cel information */
    CEL_EXTRA = 0x2006,
    /** Color profile chunk (0x2007) - defines color space */
    COLOR_PROFILE = 0x2007,
    /** External files chunk (0x2008) - references external resources */
    EXTERNAL_FILES = 0x2008,
    /** Mask chunk (0x2016) - DEPRECATED */
    MASK = 0x2016,
    /** Path chunk (0x2017) - never used in practice */
    PATH = 0x2017,
    /** Tags chunk (0x2018) - defines animation sequences */
    TAGS = 0x2018,
    /** Palette chunk (0x2019) - current palette format */
    PALETTE = 0x2019,
    /** User data chunk (0x2020) - custom data for last chunk */
    USER_DATA = 0x2020,
    /** Slice chunk (0x2022) - UI slice definitions */
    SLICE = 0x2022,
    /** Tileset chunk (0x2023) - tileset for tilemap layers */
    TILESET = 0x2023,
}

/**
 * Color depth values as specified in ASE format
 * Determines pixel format and bytes per pixel
 */
export enum ColorDepth {
    /** Indexed color mode - 1 byte per pixel, requires palette */
    INDEXED = 8,
    /** Grayscale mode - 2 bytes per pixel (value + alpha) */
    GRAYSCALE = 16,
    /** RGBA color mode - 4 bytes per pixel (red, green, blue, alpha) */
    RGBA = 32,
}

/**
 * Layer type values for LayerChunk.type field
 * Determines how layer content is interpreted
 */
export enum LayerType {
    /** Normal image layer containing pixel data */
    NORMAL = 0,
    /** Group layer for organizing other layers */
    GROUP = 1,
    /** Tilemap layer using tileset references */
    TILEMAP = 2,
}

/**
 * Cel type values for CelChunk.type field
 * Determines how cel data is stored and interpreted
 */
export enum CelType {
    /** Raw image data (unused, compressed preferred) */
    RAW_IMAGE = 0,
    /** Linked to another frame's cel */
    LINKED_CEL = 1,
    /** ZLIB compressed image data */
    COMPRESSED_IMAGE = 2,
    /** ZLIB compressed tilemap data */
    COMPRESSED_TILEMAP = 3,
}

/**
 * Blend mode values for LayerChunk.blendMode field
 * Determines how layer pixels blend with layers below
 */
export enum BlendMode {
    NORMAL = 0,
    MULTIPLY = 1,
    SCREEN = 2,
    OVERLAY = 3,
    DARKEN = 4,
    LIGHTEN = 5,
    COLOR_DODGE = 6,
    COLOR_BURN = 7,
    HARD_LIGHT = 8,
    SOFT_LIGHT = 9,
    DIFFERENCE = 10,
    EXCLUSION = 11,
    HUE = 12,
    SATURATION = 13,
    COLOR = 14,
    LUMINOSITY = 15,
    ADDITION = 16,
    SUBTRACT = 17,
    DIVIDE = 18,
}

/**
 * Animation loop direction values for TagChunk.loopAnimationDirection
 * Controls how animation sequences repeat
 */
export enum LoopDirection {
    /** Play frames forward in sequence */
    FORWARD = 0,
    /** Play frames in reverse order */
    REVERSE = 1,
    /** Play forward then reverse (ping-pong) */
    PING_PONG = 2,
    /** Play reverse then forward (ping-pong reverse) */
    PING_PONG_REVERSE = 3,
}
