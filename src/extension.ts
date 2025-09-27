import * as vscode from "vscode";
import { AsepriteEditorProvider } from "./asepriteEditorProvider";

/**
 * Extension activation function
 * Registers custom editor provider and commands for Aseprite file support
 */
export function activate(context: vscode.ExtensionContext) {
    // Register custom editor provider for .ase/.aseprite files
    context.subscriptions.push(AsepriteEditorProvider.register(context));

    // Register extension commands
    context.subscriptions.push(
        vscode.commands.registerCommand("aseprite-preview.toggleAnimation", () => {
            // Animation toggle is handled by the webview interface
            vscode.window.showInformationMessage("Toggle Animation");
        })
    );

    console.log("Aseprite Preview extension activated");
}

/**
 * Extension deactivation function
 * Called when extension is disabled or VSCode shuts down
 */
export function deactivate() {
    console.log("Aseprite Preview extension deactivated");
}
