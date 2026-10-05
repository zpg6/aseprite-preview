import { test, expect } from "bun:test";
import * as zlib from "zlib";
import { AsepriteParser } from "../src/asepriteParser";

test("parser should be defined", () => {
    expect(AsepriteParser).toBeDefined();
});

/** A compressed-image cel chunk (0x2005, type 2) for an RGBA image of one repeated colour. */
function celChunk(layerIndex: number, width: number, height: number, rgba: number[], terminated: boolean): Buffer {
    const pixels = Buffer.alloc(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) pixels.set(rgba, i);

    // Z_SYNC_FLUSH ends on a byte boundary without the final block or the Adler-32 trailer,
    // which is what some non-Aseprite editors write.
    const compressed = zlib.deflateSync(pixels, terminated ? {} : { finishFlush: zlib.constants.Z_SYNC_FLUSH });

    const body = Buffer.alloc(20);
    body.writeUInt16LE(layerIndex, 0);
    body.writeUInt8(255, 6); // opacity
    body.writeUInt16LE(2, 7); // compressed image
    body.writeUInt16LE(width, 16);
    body.writeUInt16LE(height, 18);

    const header = Buffer.alloc(6);
    header.writeUInt32LE(6 + body.length + compressed.length, 0);
    header.writeUInt16LE(0x2005, 4);
    return Buffer.concat([header, body, compressed]);
}

/** A one-frame RGBA sprite holding the given chunks. */
function sprite(width: number, height: number, chunks: Buffer[]): Buffer {
    const frameBody = Buffer.concat(chunks);
    const frameHeader = Buffer.alloc(16);
    frameHeader.writeUInt32LE(16 + frameBody.length, 0);
    frameHeader.writeUInt16LE(0xf1fa, 4);
    frameHeader.writeUInt16LE(chunks.length, 6);
    frameHeader.writeUInt16LE(100, 8);
    frameHeader.writeUInt32LE(chunks.length, 12);

    const header = Buffer.alloc(128);
    header.writeUInt32LE(128 + 16 + frameBody.length, 0);
    header.writeUInt16LE(0xa5e0, 4);
    header.writeUInt16LE(1, 6);
    header.writeUInt16LE(width, 8);
    header.writeUInt16LE(height, 10);
    header.writeUInt16LE(32, 12);
    return Buffer.concat([header, frameHeader, frameBody]);
}

test("compressed cel data stops at the end of its own chunk", () => {
    const first = celChunk(0, 4, 4, [255, 0, 0, 255], true);
    const second = celChunk(1, 4, 4, [0, 0, 255, 255], true);
    const file = AsepriteParser.parse(sprite(4, 4, [first, second]));

    const cels = file.frames[0].cels;
    expect(cels.length).toBe(2);
    expect(cels[0].compressedData!.length).toBe(first.length - 26);
    expect(cels[1].compressedData!.length).toBe(second.length - 26);
});

test("cels whose zlib stream is not terminated still decompress", () => {
    const red = [255, 0, 0, 255];
    const blue = [0, 0, 255, 255];
    const file = AsepriteParser.parse(sprite(8, 8, [celChunk(0, 8, 8, red, false), celChunk(1, 8, 8, blue, false)]));

    const [first, second] = file.frames[0].cels.map(cel => AsepriteParser.decompressImageData(cel.compressedData!));
    expect(first.length).toBe(8 * 8 * 4);
    expect(second.length).toBe(8 * 8 * 4);
    expect(Array.from(first.subarray(0, 4))).toEqual(red);
    expect(Array.from(second.subarray(0, 4))).toEqual(blue);
});

test("a complete stream with a bad checksum is still rejected", () => {
    const compressed = zlib.deflateSync(Buffer.alloc(64, 7));
    compressed[compressed.length - 1] ^= 0xff;
    expect(() => AsepriteParser.decompressImageData(compressed)).toThrow();
});
