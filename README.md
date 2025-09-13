# Fornax - Telescopic Writing Plugin for Obsidian

Fornax is an Obsidian plugin that supports "telescopic writing" - a writing methodology that involves zooming between different levels of focus to improve writing clarity and flow.

## What is Telescopic Writing?

Telescopic writing is a structured approach to writing that involves working at three distinct levels:

1. **Document Level**: Focus on overall structure and organization of ideas
2. **Paragraph Level**: Work on logical flow and connections between thoughts  
3. **Sentence Level**: Perfect individual sentences for clarity and impact

By consciously switching between these levels, writers can maintain both big-picture coherence and sentence-level precision. This approach helps prevent getting stuck in details while losing sight of the broader narrative, or conversely, working only at a high level without polishing the prose.

## How Fornax Helps

Fornax provides a dedicated interface for telescopic writing with three zoom levels that correspond to the writing methodology:

### Document View
- Shows hierarchical document structure with ## and ### headings
- Displays paragraph and sentence counts (excluding headings)
- Provides visual overview of document organization

### Paragraph View  
- Interactive paragraph blocks with drag-and-drop reordering
- Visual status indicators:
  - **Green**: Completed paragraphs marked as finalized
  - **Yellow**: Paragraphs containing sentence alternatives
- Click paragraphs to zoom into sentence-level editing

### Sentence View
- Line-by-line sentence editing (sentences are treated as lines, not punctuation-separated)
- Drag-and-drop sentence reordering within and between paragraphs
- Sentence alternatives system for trying different versions

## Key Features

- **Two-Stage Editing Process**: "Save Selection" to try alternatives, "Commit" to finalize
- **Non-Destructive Editing**: All alternatives stored as invisible %% %% comments
- **Visual Progress Tracking**: Green checkmarks for completed paragraphs
- **Seamless Integration**: Works with existing Obsidian workflows and markdown files
- **Document Structure**: Automatically parses and displays section hierarchy

## Installation

1. Download the plugin files
2. Place in your Obsidian vault's `.obsidian/plugins/fornax-obsidian-plugin/` directory
3. Enable the plugin in Obsidian's Community Plugins settings
4. Access via the ribbon icon or command palette (`Ctrl/Cmd + P` → "Toggle Fornax Mode")

## Usage

1. Open any markdown file in Obsidian
2. Click the Fornax ribbon icon to activate telescopic view
3. Use the zoom controls to switch between Document, Paragraph, and Sentence levels
4. Edit and reorganize content at each level as needed
5. Mark paragraphs complete when satisfied with their content

The plugin preserves all your edits in the original markdown file using invisible comment syntax that won't appear in reading view.
