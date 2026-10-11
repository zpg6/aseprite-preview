# Changelog

## Unreleased

### Added

- Layers panel: every layer listed, indented under its group, with a checkbox to show or hide it in the preview. The boxes start from the visibility saved in the file and never change the file. All / None / Reset buttons, and Alt+click to show one layer alone

### Changed

### Fixed

- Linked cels draw instead of leaving the layer blank on that frame
- A hidden group hides the layers inside it
- Export as PNG draws only the visible layers, with their opacity and blend mode, as the preview does

### Removed

## [0.0.5] - 2025-09-27

### Fixed

- Animation playback must access layers from first frame

## [0.0.4] - 2025-09-27

### Changed

- Default to pixel rendering
- Default to 4x scale

## [0.0.3] - 2025-09-27

### Added

- Core packages made reusable with pnpm workspace structure
- Unbuild for bundling packages

## [0.0.2] - 2025-09-27

### Added

- Export as PNG functionality

## [0.0.1] - 2025-09-27

### Added

- Initial release of Aseprite Preview extension
- CI/CD workflow to build extension
- Basic Aseprite file preview functionality
- Support for .aseprite and .ase files
