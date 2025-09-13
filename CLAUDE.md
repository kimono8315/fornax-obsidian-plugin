# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fornax is an Obsidian plugin that provides "telescopic writing" functionality - allowing writers to zoom between document structure, paragraphs, and sentences with drag-and-drop editing and sentence alternatives.

## Common Development Commands

- `npm run dev` - Start development build with watch mode using esbuild
- `npm run build` - Production build with TypeScript type checking and esbuild bundling
- `npm run version` - Bump version and update manifest.json and versions.json

## Code Architecture

### Current State
The plugin is currently implemented as a single consolidated `main.ts` file containing all components. This was done for easier debugging during development. The file contains clearly marked sections that should be split into separate modules later.

### Core Components

1. **FornaxEngine** - Core business logic for document parsing and edit management
   - Parses markdown documents into paragraphs and sentences
   - Handles sentence edit storage (via markdown comments or working files)
   - Manages working file creation with `-working` suffix

2. **TelescopeOverlay** - Main UI component providing the telescopic interface
   - Three zoom levels: Document view, Paragraph view, Sentence view
   - Drag-and-drop functionality for reordering paragraphs and sentences
   - Custom CSS styling integrated into Obsidian's theme system

3. **FornaxView** - Obsidian ItemView implementation
   - Registers as custom view type `VIEW_TYPE_FORNAX`
   - Handles file changes and updates telescope interface
   - Integrates with Obsidian's workspace system

4. **Settings** - Plugin configuration
   - Working file suffix (default: `-working`)
   - Auto-save toggle
   - Telescope mode (overlay vs sidebar)

### Key Features

- **Telescopic Editing**: Zoom between document/paragraph/sentence levels
- **Drag & Drop**: Reorder paragraphs and sentences with visual feedback
- **Sentence Alternatives**: Edit and compare different versions of sentences
- **Working Files**: Optional separate files for storing edit alternatives
- **Markdown Integration**: Edits stored as HTML comments in markdown

### Plugin Integration Points

- Custom ribbon icon for activating Fornax view
- Command palette integration (`toggle-fornax-mode`)
- Settings tab in Obsidian preferences
- Right sidebar panel integration
- Active file tracking and auto-updates

### Development Notes

- Uses esbuild for fast bundling during development
- TypeScript with strict configuration
- ESLint configured for code quality
- CSS styles use Obsidian's CSS variables for theme compatibility
- All external dependencies (Obsidian API, CodeMirror) are marked as external in build config

### Current Development Status

The plugin has basic functionality working but drag-and-drop interactions are being debugged. Test with clicking "DRAG ME" buttons in paragraph view to verify event handling before implementing full drag behavior.