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
   - Parses hierarchical document structure (## and ### headings)
   - Handles sentence edit storage via %% %% comments
   - Filters out markdown headings from paragraph/sentence counts

2. **TelescopeOverlay** - Main UI component providing the telescopic interface
   - Three zoom levels: Document view, Paragraph view, Sentence view
   - Document view shows hierarchical section structure with ## and ### headings
   - Drag-and-drop functionality for reordering paragraphs and sentences
   - Custom CSS styling integrated into Obsidian's theme system

3. **FornaxView** - Obsidian ItemView implementation
   - Registers as custom view type `VIEW_TYPE_FORNAX`
   - Handles file changes and updates telescope interface
   - Integrates with Obsidian's workspace system

4. **Settings** - Plugin configuration
   - Displays README.md content in settings tab
   - Minimal configuration interface

### Key Features

- **Telescopic Editing**: Zoom between document/paragraph/sentence levels
- **Document Structure View**: Hierarchical display of ## and ### sections with nested "Russian doll" layout
- **Drag & Drop**: Reorder paragraphs and sentences with visual feedback
- **Sentence Alternatives**: Edit and compare different versions of sentences using %% %% comments
- **Paragraph Completion**: Mark paragraphs as complete with green visual indicators
- **Visual Status Indicators**: Yellow for paragraphs/sentences with alternatives, green for completed paragraphs
- **Line-based Parsing**: Sentences are parsed by lines, not punctuation
- **Heading Exclusion**: Markdown headings excluded from paragraph/sentence counts

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

The plugin has full telescopic writing functionality implemented:
- Document structure parsing with hierarchical sections works correctly
- Paragraph and sentence drag-and-drop functionality is operational
- Sentence alternatives system with %% %% comment storage is complete
- Paragraph completion marking system with visual indicators is functional
- All three zoom levels (Document, Paragraph, Sentence) are working

### Data Storage

- **Sentence alternatives**: Stored in %% %% comments within the markdown file
- **Paragraph completion**: Marked with `%% PARAGRAPH_COMPLETE %%` comments
- **Comments**: Invisible in Obsidian's reading view, preserved during operations
- **Raw vs Clean**: Maintains both raw paragraphs (with comments) and clean data for UI display

### Current Workflow

1. **Save Selection**: Try alternative sentences, stored as comments
2. **Commit (Final)**: Finalize sentence choice, remove alternatives
3. **Completion Toggle**: Mark paragraphs as complete/incomplete via checkbox button