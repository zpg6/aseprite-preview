import { defineBuildConfig } from "unbuild";
import { promises as fs } from "fs";
import { join } from "path";

export default defineBuildConfig({
    entries: ["./src/extension", "./src/asepriteEditorProvider"],

    // Output to out/ directory to match VS Code extension expectations
    outDir: "out",

    // Clean output directory before build
    clean: true,

    // Don't generate TypeScript declarations to avoid conflicts
    declaration: false,

    // Enable source maps for debugging
    sourcemap: true,

    // Disable warnings that would cause build failure
    failOnWarn: false,

    // Use stub mode to generate only what we need
    stub: false,

    // Configure rollup for Node.js/VS Code environment
    rollup: {
        // Only emit CommonJS
        emitCJS: true,

        // Disable code splitting to prevent shared chunks
        output: {
            manualChunks: undefined,
        },

        esbuild: {
            // Target Node.js 16 (VS Code requirement)
            target: "node16",

            // Keep function names for better debugging
            keepNames: true,

            // Use CommonJS format
            format: "cjs",
        },
    },

    // Post-build cleanup and file renaming
    hooks: {
        "build:done": async ctx => {
            const outDir = ctx.options.outDir || "out";

            // Rename .cjs files to .js for VS Code compatibility
            await fs.rename(join(outDir, "extension.cjs"), join(outDir, "extension.js"));
            await fs.rename(join(outDir, "asepriteEditorProvider.cjs"), join(outDir, "asepriteEditorProvider.js"));

            // Rename source maps
            await fs.rename(join(outDir, "extension.cjs.map"), join(outDir, "extension.js.map"));
            await fs.rename(
                join(outDir, "asepriteEditorProvider.cjs.map"),
                join(outDir, "asepriteEditorProvider.js.map")
            );

            // Clean up ESM files we don't need
            const cleanup = [
                join(outDir, "extension.mjs"),
                join(outDir, "extension.mjs.map"),
                join(outDir, "asepriteEditorProvider.mjs"),
                join(outDir, "asepriteEditorProvider.mjs.map"),
            ];

            for (const file of cleanup) {
                try {
                    await fs.unlink(file);
                } catch (err) {
                    // File might not exist, ignore
                }
            }

            // Clean up ESM files in shared directory
            try {
                const sharedDir = join(outDir, "shared");
                const sharedFiles = await fs.readdir(sharedDir);
                for (const file of sharedFiles) {
                    if (file.endsWith(".mjs") || file.endsWith(".mjs.map")) {
                        await fs.unlink(join(sharedDir, file));
                    }
                }
            } catch (err) {
                // Shared directory might not exist, ignore
            }

            console.log("✅ Post-build cleanup completed");
        },
    },
});
