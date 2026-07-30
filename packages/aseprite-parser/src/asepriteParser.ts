import * as zlib from "zlib";
import {
    AsepriteFile,
    AsepriteFrame,
    AsepriteHeader,
    CelChunk,
    CelType,
    ChunkHeader,
    ChunkType,
    ColorDepth,
    ColorProfileChunk,
    ExternalFileEntry,
    ExternalFilesChunk,
    FrameHeader,
    LayerChunk,
    PaletteChunk,
    PaletteEntry,
    SliceChunk,
    SliceKey,
    TagChunk,
    TilesetChunk,
    UserDataChunk,
} from "./asepriteTypes";

/**
 * Binary reader for ASE file format
 * Handles Intel (little-endian) byte order as specified in ASE format
 */
export class BinaryReader {
    private buffer: Buffer;
    private offset: number = 0;

    constructor(buffer: Buffer) {
        this.buffer = buffer;
    }

    /** Read BYTE: 8-bit unsigned integer */
    readByte(): number {
        const value = this.buffer.readUInt8(this.offset);
        this.offset += 1;
        return value;
    }

    /** Read WORD: 16-bit unsigned integer (little-endian) */
    readWord(): number {
        const value = this.buffer.readUInt16LE(this.offset);
        this.offset += 2;
        return value;
    }

    /** Read SHORT: 16-bit signed integer (little-endian) */
    readShort(): number {
        const value = this.buffer.readInt16LE(this.offset);
        this.offset += 2;
        return value;
    }

    /** Read DWORD: 32-bit unsigned integer (little-endian) */
    readDWord(): number {
        const value = this.buffer.readUInt32LE(this.offset);
        this.offset += 4;
        return value;
    }

    /** Read LONG: 32-bit signed integer (little-endian) */
    readLong(): number {
        const value = this.buffer.readInt32LE(this.offset);
        this.offset += 4;
        return value;
    }

    /** Read FIXED: 32-bit fixed point (16.16) value */
    readFixed(): number {
        const value = this.buffer.readInt32LE(this.offset);
        this.offset += 4;
        return value / 65536.0; // Convert from 16.16 fixed point
    }

    /** Read FLOAT: 32-bit single-precision floating point */
    readFloat(): number {
        const value = this.buffer.readFloatLE(this.offset);
        this.offset += 4;
        return value;
    }

    /** Read DOUBLE: 64-bit double-precision floating point */
    readDouble(): number {
        const value = this.buffer.readDoubleLE(this.offset);
        this.offset += 8;
        return value;
    }

    /** Read QWORD: 64-bit unsigned integer */
    readQWord(): bigint {
        const value = this.buffer.readBigUInt64LE(this.offset);
        this.offset += 8;
        return value;
    }

    /** Read LONG64: 64-bit signed integer */
    readLong64(): bigint {
        const value = this.buffer.readBigInt64LE(this.offset);
        this.offset += 8;
        return value;
    }

    /** Read BYTE[n]: n bytes as Uint8Array */
    readBytes(count: number): Uint8Array {
        const bytes = this.buffer.subarray(this.offset, this.offset + count);
        this.offset += count;
        return new Uint8Array(bytes);
    }

    /** Read STRING: WORD length + UTF-8 bytes (no null terminator) */
    readString(): string {
        const length = this.readWord();
        const bytes = this.readBytes(length);
        return Buffer.from(bytes).toString("utf8");
    }

    /** Read UUID: 16 bytes representing a Universally Unique Identifier */
    readUUID(): Uint8Array {
        return this.readBytes(16);
    }

    skip(bytes: number): void {
        this.offset += bytes;
    }

    getOffset(): number {
        return this.offset;
    }

    setOffset(offset: number): void {
        this.offset = offset;
    }

    hasMoreData(): boolean {
        return this.offset < this.buffer.length;
    }

    getRemainingBytes(): number {
        return this.buffer.length - this.offset;
    }
}

/**
 * Main parser for Aseprite (.ase/.aseprite) files
 * Implements the complete ASE file format specification
 */
export class AsepriteParser {
    /**
     * Parse an ASE file from binary data
     * Follows spec: Read header, then parse each frame sequentially
     */
    static parse(buffer: Buffer): AsepriteFile {
        const reader = new BinaryReader(buffer);

        const header = this.parseHeader(reader);
        const frames: AsepriteFrame[] = [];

        for (let i = 0; i < header.frames; i++) {
            frames.push(this.parseFrame(reader, header));
        }

        // According to ASE spec, layers are defined in first frame and apply globally
        // Ensure all frames have access to the layer definitions from frame 0
        const globalLayers = frames[0]?.layers || [];
        for (let i = 1; i < frames.length; i++) {
            if (frames[i].layers.length === 0) {
                frames[i].layers = globalLayers;
            }
        }

        return {
            header,
            frames,
            globalPalette: this.findGlobalPalette(frames),
        };
    }

    /**
     * Parse 128-byte ASE header
     * Validates magic number and extracts sprite properties
     */
    private static parseHeader(reader: BinaryReader): AsepriteHeader {
        const fileSize = reader.readDWord();
        const magicNumber = reader.readWord();

        if (magicNumber !== 0xa5e0) {
            throw new Error(`Invalid Aseprite file: magic number is 0x${magicNumber.toString(16)}, expected 0xA5E0`);
        }

        const frames = reader.readWord();
        const width = reader.readWord();
        const height = reader.readWord();
        const colorDepth = reader.readWord();
        const flags = reader.readDWord();
        const speed = reader.readWord();

        reader.skip(8); // Two DWORDs set to 0 (reserved)

        const transparentIndex = reader.readByte();
        reader.skip(3); // Ignore these bytes as per spec

        const numberOfColors = reader.readWord();
        const pixelWidth = reader.readByte();
        const pixelHeight = reader.readByte();
        const gridX = reader.readShort();
        const gridY = reader.readShort();
        const gridWidth = reader.readWord();
        const gridHeight = reader.readWord();

        reader.skip(84); // Reserved for future use (total header = 128 bytes)

        return {
            fileSize,
            magicNumber,
            frames,
            width,
            height,
            colorDepth,
            flags,
            speed,
            transparentIndex,
            numberOfColors,
            pixelWidth,
            pixelHeight,
            gridX,
            gridY,
            gridWidth,
            gridHeight,
        };
    }

    /**
     * Parse a single frame with its chunks
     * Frame format: header (16 bytes) + chunks
     */
    private static parseFrame(reader: BinaryReader, header: AsepriteHeader): AsepriteFrame {
        const frameHeader = this.parseFrameHeader(reader);
        const frameStartOffset = reader.getOffset();
        const frameEndOffset = frameStartOffset + frameHeader.bytesInFrame - 16; // Subtract frame header size

        const layers: LayerChunk[] = [];
        const cels: CelChunk[] = [];
        let palette: PaletteChunk | undefined;
        let oldPalette: PaletteChunk | undefined;
        const tags: TagChunk[] = [];
        const userData: UserDataChunk[] = [];
        const slices: SliceChunk[] = [];
        let tileset: TilesetChunk | undefined;
        let colorProfile: ColorProfileChunk | undefined;
        let externalFiles: ExternalFilesChunk | undefined;

        // Use new field if available (spec: if oldChunksCount is 0xFFFF or 0, use newChunksCount)
        const chunksCount = frameHeader.newChunksCount || frameHeader.oldChunksCount;

        for (let i = 0; i < chunksCount && reader.getOffset() < frameEndOffset; i++) {
            const chunkHeader = this.parseChunkHeader(reader);
            const chunkStartOffset = reader.getOffset();
            const chunkEndOffset = chunkStartOffset + chunkHeader.size - 6; // Subtract chunk header size (6 bytes)

            try {
                switch (chunkHeader.type) {
                    case ChunkType.LAYER:
                        layers.push(this.parseLayerChunk(reader, header));
                        break;
                    case ChunkType.CEL:
                        cels.push(this.parseCelChunk(reader, header));
                        break;
                    case ChunkType.PALETTE:
                        palette = this.parsePaletteChunk(reader);
                        break;
                    case ChunkType.TAGS:
                        tags.push(...this.parseTagsChunk(reader));
                        break;
                    case ChunkType.USER_DATA:
                        userData.push(this.parseUserDataChunk(reader));
                        break;
                    case ChunkType.SLICE:
                        slices.push(this.parseSliceChunk(reader));
                        break;
                    case ChunkType.TILESET:
                        tileset = this.parseTilesetChunk(reader);
                        break;
                    case ChunkType.COLOR_PROFILE:
                        colorProfile = this.parseColorProfileChunk(reader);
                        break;
                    case ChunkType.EXTERNAL_FILES:
                        externalFiles = this.parseExternalFilesChunk(reader);
                        break;
                    case ChunkType.OLD_PALETTE_04:
                    case ChunkType.OLD_PALETTE_11:
                        // Fallback only: Aseprite >= 1.3.5 writes just this chunk when the
                        // palette has no alpha and <= 256 colors, so it can be the only one.
                        oldPalette = this.parseOldPaletteChunk(
                            reader,
                            chunkHeader.type === ChunkType.OLD_PALETTE_11
                        );
                        break;
                    default:
                        // Skip unknown chunks to maintain forward compatibility
                        reader.setOffset(chunkEndOffset);
                        break;
                }
            } catch (error) {
                console.warn(`Error parsing chunk type 0x${chunkHeader.type.toString(16)}:`, error);
                reader.setOffset(chunkEndOffset);
            }

            // Ensure we're at the correct position for the next chunk (chunk size includes header)
            reader.setOffset(chunkEndOffset);
        }

        return {
            header: frameHeader,
            layers,
            cels,
            palette: palette ?? oldPalette,
            tags: tags.length > 0 ? tags : undefined,
            userData: userData.length > 0 ? userData : undefined,
            slices: slices.length > 0 ? slices : undefined,
            tileset,
            colorProfile,
            externalFiles,
        };
    }

    /**
     * Parse 16-byte frame header
     * Validates frame magic number and extracts chunk count
     */
    private static parseFrameHeader(reader: BinaryReader): FrameHeader {
        const bytesInFrame = reader.readDWord();
        const magicNumber = reader.readWord();

        if (magicNumber !== 0xf1fa) {
            throw new Error(`Invalid frame magic number: 0x${magicNumber.toString(16)}, expected 0xF1FA`);
        }

        const oldChunksCount = reader.readWord();
        const frameDuration = reader.readWord();
        reader.skip(2); // Reserved for future use
        const newChunksCount = reader.readDWord();

        return {
            bytesInFrame,
            magicNumber,
            oldChunksCount,
            frameDuration,
            newChunksCount,
        };
    }

    /**
     * Parse 6-byte chunk header
     * Size includes the header itself (minimum 6 bytes)
     */
    private static parseChunkHeader(reader: BinaryReader): ChunkHeader {
        const size = reader.readDWord();
        const type = reader.readWord();
        return { size, type };
    }

    /**
     * Parse Layer Chunk (0x2004)
     * Defines layer properties and hierarchy (see spec NOTE.1 for child levels)
     */
    private static parseLayerChunk(reader: BinaryReader, header: AsepriteHeader): LayerChunk {
        const flags = reader.readWord();
        const type = reader.readWord();
        const childLevel = reader.readWord();
        reader.skip(4); // Default width/height (ignored as per spec)
        const blendMode = reader.readWord();
        const opacity = reader.readByte();
        reader.skip(3); // Reserved for future use
        const name = reader.readString();

        let tilesetIndex: number | undefined;
        if (type === 2) {
            // Tilemap layer type requires tileset index
            tilesetIndex = reader.readDWord();
        }

        let uuid: Uint8Array | undefined;
        if (header.flags & 4) {
            // Layer has UUID if header flags bit 4 is set
            uuid = reader.readUUID();
        }

        return {
            flags,
            type,
            childLevel,
            blendMode,
            opacity,
            name,
            tilesetIndex,
            uuid,
        };
    }

    /**
     * Parse Cel Chunk (0x2005)
     * Determines where to place cel in specified layer/frame
     * Layer index follows spec NOTE.2 for layer ordering
     */
    private static parseCelChunk(reader: BinaryReader, header: AsepriteHeader): CelChunk {
        const layerIndex = reader.readWord();
        const x = reader.readShort();
        const y = reader.readShort();
        const opacity = reader.readByte();
        const type = reader.readWord();
        const zIndex = reader.readShort();
        reader.skip(5); // Reserved for future use

        const cel: CelChunk = {
            layerIndex,
            x,
            y,
            opacity,
            type,
            zIndex,
        };

        switch (type) {
            case CelType.RAW_IMAGE:
                // Raw Image Data (unused in practice, compressed preferred)
                cel.width = reader.readWord();
                cel.height = reader.readWord();
                cel.rawPixelData = reader.readBytes(cel.width * cel.height * this.getBytesPerPixel(header.colorDepth));
                break;

            case CelType.LINKED_CEL:
                // References another frame's cel data
                cel.linkedFrame = reader.readWord();
                break;

            case CelType.COMPRESSED_IMAGE:
                // ZLIB compressed image data (spec NOTE.3)
                cel.width = reader.readWord();
                cel.height = reader.readWord();
                const compressedSize = reader.getRemainingBytes();
                cel.compressedData = reader.readBytes(compressedSize);
                break;

            case CelType.COMPRESSED_TILEMAP:
                // ZLIB compressed tilemap with flip masks
                cel.widthInTiles = reader.readWord();
                cel.heightInTiles = reader.readWord();
                cel.bitsPerTile = reader.readWord(); // Always 32-bit currently
                cel.tileIdMask = reader.readDWord(); // e.g. 0x1fffffff for 32-bit tiles
                cel.xFlipMask = reader.readDWord();
                cel.yFlipMask = reader.readDWord();
                cel.diagonalFlipMask = reader.readDWord(); // Swap X/Y axis
                reader.skip(10); // Reserved bytes
                const tilemapCompressedSize = reader.getRemainingBytes();
                cel.compressedData = reader.readBytes(tilemapCompressedSize);
                break;
        }

        return cel;
    }

    /**
     * Parse Palette Chunk (0x2019) - current palette format
     * Replaces old palette chunks (0x0004, 0x0011) which should be ignored
     */
    private static parsePaletteChunk(reader: BinaryReader): PaletteChunk {
        const newPaletteSize = reader.readDWord();
        const firstColorIndex = reader.readDWord();
        const lastColorIndex = reader.readDWord();
        reader.skip(8); // Reserved for future use

        const entries: PaletteEntry[] = [];
        const entryCount = lastColorIndex - firstColorIndex + 1;

        for (let i = 0; i < entryCount; i++) {
            const flags = reader.readWord();
            const red = reader.readByte();
            const green = reader.readByte();
            const blue = reader.readByte();
            const alpha = reader.readByte();

            let name: string | undefined;
            if (flags & 1) {
                // Has name flag is set
                name = reader.readString();
            }

            entries.push({
                flags,
                red,
                green,
                blue,
                alpha,
                name,
            });
        }

        return {
            newPaletteSize,
            firstColorIndex,
            lastColorIndex,
            entries,
        };
    }

    /**
     * Parse old palette chunks (0x0004 / 0x0011) into the modern PaletteChunk shape.
     * 0x0011 stores 6-bit components (0-63); 0x0004 stores 8-bit (0-255).
     */
    private static parseOldPaletteChunk(reader: BinaryReader, sixBit: boolean): PaletteChunk {
        const packetCount = reader.readWord();
        const entries: PaletteEntry[] = [];
        let index = 0;

        for (let p = 0; p < packetCount; p++) {
            index += reader.readByte();
            const colorCount = reader.readByte() || 256;

            while (entries.length < index) {
                entries.push({ flags: 0, red: 0, green: 0, blue: 0, alpha: 255 });
            }

            for (let c = 0; c < colorCount; c++) {
                let red = reader.readByte();
                let green = reader.readByte();
                let blue = reader.readByte();

                if (sixBit) {
                    red = (red << 2) | (red >> 4);
                    green = (green << 2) | (green >> 4);
                    blue = (blue << 2) | (blue >> 4);
                }

                entries[index] = { flags: 0, red, green, blue, alpha: 255 };
                index++;
            }
        }

        return {
            newPaletteSize: entries.length,
            firstColorIndex: 0,
            lastColorIndex: Math.max(0, entries.length - 1),
            entries,
        };
    }

    /**
     * Parse Tags Chunk (0x2018) - animation tag definitions
     * Can be followed by user data chunks for each tag
     */
    private static parseTagsChunk(reader: BinaryReader): TagChunk[] {
        const numberOfTags = reader.readWord();
        reader.skip(8); // Reserved for future use

        const tags: TagChunk[] = [];

        for (let i = 0; i < numberOfTags; i++) {
            const fromFrame = reader.readWord();
            const toFrame = reader.readWord();
            const loopAnimationDirection = reader.readByte();
            const repeat = reader.readWord();
            reader.skip(6); // For future use

            const r = reader.readByte();
            const g = reader.readByte();
            const b = reader.readByte();
            reader.readByte(); // Extra byte (zero) as per spec

            const name = reader.readString();

            tags.push({
                fromFrame,
                toFrame,
                loopAnimationDirection,
                repeat,
                color: { r, g, b },
                name,
            });
        }

        return tags;
    }

    /**
     * Parse User Data Chunk (0x2020) - associates custom data with last read chunk
     * Can contain text, color, and/or complex property maps
     * Special cases: follows Tags (one per tag), Tileset (for tiles), or Sprite (first frame)
     */
    private static parseUserDataChunk(reader: BinaryReader): UserDataChunk {
        const flags = reader.readDWord();
        const userData: UserDataChunk = { flags };

        if (flags & 1) {
            // Has text flag
            userData.text = reader.readString();
        }

        if (flags & 2) {
            // Has color flag - RGBA format
            const r = reader.readByte();
            const g = reader.readByte();
            const b = reader.readByte();
            const a = reader.readByte();
            userData.color = { r, g, b, a };
        }

        if (flags & 4) {
            // Has properties flag - complex nested data structure
            const propertiesSize = reader.readDWord();
            const numberOfMaps = reader.readDWord();
            // TODO: Implement full properties parsing (supports various data types)
            reader.skip(propertiesSize - 8); // Skip properties data for now
        }

        return userData;
    }

    /**
     * Parse Slice Chunk (0x2022) - defines UI slices for 9-patch scaling
     * Contains multiple slice keys for animated slice bounds
     * Used for UI elements that need to scale while preserving corners/edges
     */
    private static parseSliceChunk(reader: BinaryReader): SliceChunk {
        const numberOfKeys = reader.readDWord();
        const flags = reader.readDWord();
        reader.skip(4); // Reserved
        const name = reader.readString();

        const keys: SliceKey[] = [];

        for (let i = 0; i < numberOfKeys; i++) {
            const frameNumber = reader.readDWord();
            const x = reader.readLong();
            const y = reader.readLong();
            const width = reader.readDWord(); // Can be 0 if slice is hidden
            const height = reader.readDWord();

            const key: SliceKey = {
                frameNumber,
                x,
                y,
                width,
                height,
            };

            if (flags & 1) {
                // 9-patches slice - defines scalable center region
                key.centerX = reader.readLong();
                key.centerY = reader.readLong();
                key.centerWidth = reader.readDWord();
                key.centerHeight = reader.readDWord();
            }

            if (flags & 2) {
                // Has pivot information - reference point for positioning
                key.pivotX = reader.readLong();
                key.pivotY = reader.readLong();
            }

            keys.push(key);
        }

        return {
            flags,
            name,
            keys,
        };
    }

    /**
     * Parse Tileset Chunk (0x2023) - defines tileset for tilemap layers
     * Can reference external files or contain embedded tile image data
     * Supports auto-flip matching for X, Y, and diagonal transformations
     */
    private static parseTilesetChunk(reader: BinaryReader): TilesetChunk {
        const id = reader.readDWord();
        const flags = reader.readDWord();
        const numberOfTiles = reader.readDWord();
        const tileWidth = reader.readWord();
        const tileHeight = reader.readWord();
        const baseIndex = reader.readShort(); // UI display offset (usually 1 for 1-based indexing)
        reader.skip(14); // Reserved
        const name = reader.readString();

        let externalFileId: number | undefined;
        let externalTilesetId: number | undefined;
        if (flags & 1) {
            // Link to external file - references External Files chunk
            externalFileId = reader.readDWord();
            externalTilesetId = reader.readDWord();
        }

        let compressedImageData: Uint8Array | undefined;
        if (flags & 2) {
            // Tiles embedded in this file - ZLIB compressed image strip
            const dataLength = reader.readDWord();
            compressedImageData = reader.readBytes(dataLength);
        }

        return {
            id,
            flags,
            numberOfTiles,
            tileWidth,
            tileHeight,
            baseIndex,
            name,
            externalFileId,
            externalTilesetId,
            compressedImageData,
        };
    }

    /**
     * Parse Color Profile Chunk (0x2007) - defines color space and gamma correction
     * Supports sRGB, embedded ICC profiles, and custom gamma values
     * Critical for accurate color reproduction in different display contexts
     */
    private static parseColorProfileChunk(reader: BinaryReader): ColorProfileChunk {
        const type = reader.readWord(); // 0=none, 1=sRGB, 2=embedded ICC
        const flags = reader.readWord();
        const fixedGamma = reader.readFixed(); // 16.16 fixed point, 1.0=linear
        reader.skip(8); // Reserved

        let iccProfileData: Uint8Array | undefined;
        if (type === 2) {
            // Embedded ICC profile data for precise color management
            const dataLength = reader.readDWord();
            iccProfileData = reader.readBytes(dataLength);
        }

        return {
            type,
            flags,
            fixedGamma,
            iccProfileData,
        };
    }

    /**
     * Parse External Files Chunk (0x2008) - lists external resources linked to sprite
     * Appears in first frame, references external palettes, tilesets, or extensions
     * Extension IDs follow format 'publisher/ExtensionName' (spec NOTE.4)
     */
    private static parseExternalFilesChunk(reader: BinaryReader): ExternalFilesChunk {
        const numberOfEntries = reader.readDWord();
        reader.skip(8); // Reserved

        const entries: ExternalFileEntry[] = [];

        for (let i = 0; i < numberOfEntries; i++) {
            const id = reader.readDWord(); // Referenced by other chunks (tilesets, palettes)
            const type = reader.readByte(); // 0=palette, 1=tileset, 2=extension properties, 3=tile management
            reader.skip(7); // Reserved
            const fileName = reader.readString(); // File path or extension ID

            entries.push({
                id,
                type,
                fileName,
            });
        }

        return { entries };
    }

    /**
     * Calculate bytes per pixel based on color depth
     * As per spec: Indexed=1 byte, Grayscale=2 bytes (value+alpha), RGBA=4 bytes
     */
    private static getBytesPerPixel(colorDepth: number): number {
        switch (colorDepth) {
            case ColorDepth.INDEXED:
                return 1; // Index into palette
            case ColorDepth.GRAYSCALE:
                return 2; // Value + Alpha
            case ColorDepth.RGBA:
                return 4; // Red + Green + Blue + Alpha
            default:
                throw new Error(`Unsupported color depth: ${colorDepth}`);
        }
    }

    /**
     * Extract global palette from frames
     * Returns the first palette found (typically in the first frame)
     */
    private static findGlobalPalette(frames: AsepriteFrame[]): PaletteChunk | undefined {
        for (const frame of frames) {
            if (frame.palette) {
                return frame.palette;
            }
        }
        return undefined;
    }

    /**
     * Decompress ZLIB compressed image data (spec NOTE.3)
     * Used for compressed image and tilemap cel types
     * Data format matches raw format but compressed with ZLIB/DEFLATE
     */
    static decompressImageData(compressedData: Uint8Array): Uint8Array {
        try {
            return new Uint8Array(zlib.inflateSync(Buffer.from(compressedData)));
        } catch (error) {
            throw new Error(`Failed to decompress image data: ${error}`);
        }
    }
}
