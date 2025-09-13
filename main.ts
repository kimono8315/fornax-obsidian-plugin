// main.ts - Complete Fornax Plugin (Consolidated)
import { Plugin, PluginSettingTab, Setting, WorkspaceLeaf, TFile, App, ItemView, Notice } from 'obsidian';

// ===============================================
// INTERFACES AND TYPES
// ===============================================

interface FornaxSettings {
	workingFileSuffix: string;
	autoSave: boolean;
	telescopeMode: 'overlay' | 'sidebar';
}

export interface SentenceEdit {
	id: string;
	original: string;
	alternatives: string[];
	paragraphIndex: number;
	sentenceIndex: number;
}

type ZoomLevel = 'document' | 'paragraphs' | 'sentences';

// ===============================================
// CONSTANTS
// ===============================================

const DEFAULT_SETTINGS: FornaxSettings = {
	workingFileSuffix: '-working',
	autoSave: true,
	telescopeMode: 'overlay'
};

export const VIEW_TYPE_FORNAX = 'fornax-telescope';

// ===============================================
// FORNAX ENGINE CLASS
// (Will be: fornax-engine.ts)
// ===============================================

export class FornaxEngine {
	constructor(private app: App, private settings: FornaxSettings) {}

	async toggleTelescopeMode(file: TFile) {
		new Notice('Fornax telescope mode activated!');
	}

	async parseDocument(content: string): Promise<{
		paragraphs: string[];
		sentences: string[][];
		edits: SentenceEdit[];
	}> {
		// Split into paragraphs
		const paragraphs = content.split('\n\n').filter(p => p.trim());
		
		// Split paragraphs into sentences
		const sentences = paragraphs.map(para => 
			para.split(/[.!?]+/).filter(s => s.trim()).map(s => s.trim() + '.')
		);

		// Parse existing edits (from comments or working file)
		const edits = await this.parseExistingEdits(content);

		return { paragraphs, sentences, edits };
	}

	private async parseExistingEdits(content: string): Promise<SentenceEdit[]> {
		// Parse markdown comments for stored alternatives
		const commentRegex = /<!--\s*FORNAX_EDIT:(.+?)\s*-->/g;
		const edits: SentenceEdit[] = [];
		
		let match;
		while ((match = commentRegex.exec(content)) !== null) {
			try {
				const editData = JSON.parse(match[1]);
				edits.push(editData);
			} catch (e) {
				console.warn('Failed to parse Fornax edit:', match[1]);
			}
		}
		
		return edits;
	}

	async saveEdit(file: TFile, edit: SentenceEdit) {
		// Save edit as markdown comment
		const content = await this.app.vault.read(file);
		const comment = `<!-- FORNAX_EDIT:${JSON.stringify(edit)} -->`;
		
		// Insert comment after the relevant sentence
		// Implementation details...
	}

	async getWorkingFile(originalFile: TFile): Promise<TFile | null> {
		const workingPath = originalFile.path.replace(
			'.md', 
			`${this.settings.workingFileSuffix}.md`
		);
		
		return this.app.vault.getAbstractFileByPath(workingPath) as TFile;
	}
}

// ===============================================
// TELESCOPE OVERLAY CLASS
// (Will be: telescope-overlay.ts)
// ===============================================

export class TelescopeOverlay {
	private container: HTMLElement;
	private contentEl: HTMLElement;
	private controlsEl: HTMLElement;
	private currentZoom: ZoomLevel = 'document';
	private currentDocument: any = null;
	private plugin: FornaxPlugin;

	constructor(container: HTMLElement, plugin: FornaxPlugin) {
		this.container = container;
		this.plugin = plugin;
		this.createInterface();
	}

	private createInterface() {
		// Add CSS for the interface
		this.addStyles();

		// Main telescope container
		this.container.addClass('fornax-telescope');

		// Zoom controls at the top
		this.controlsEl = this.container.createEl('div', { cls: 'fornax-zoom-controls' });
		this.createZoomControls();

		// Content area
		this.contentEl = this.container.createEl('div', { cls: 'fornax-content' });
		this.contentEl.createEl('div', { 
			cls: 'fornax-placeholder',
			text: 'Open a markdown document to begin telescopic editing'
		});
	}

	private createZoomControls() {
		const zoomLevels: { level: ZoomLevel; label: string; icon: string }[] = [
			{ level: 'document', label: 'Document', icon: '📄' },
			{ level: 'paragraphs', label: 'Paragraphs', icon: '📝' },
			{ level: 'sentences', label: 'Sentences', icon: '✏️' }
		];

		zoomLevels.forEach(({ level, label, icon }) => {
			const btn = this.controlsEl.createEl('button', { 
				cls: `fornax-zoom-btn ${level === this.currentZoom ? 'active' : ''}`,
				text: `${icon} ${label}`
			});
			
			btn.onclick = () => this.setZoomLevel(level);
		});

		// Add edit mode toggle
		const editBtn = this.controlsEl.createEl('button', { 
			cls: 'fornax-edit-btn',
			text: '🔧 Edit Mode'
		});
		editBtn.onclick = () => this.toggleEditMode();
	}

	async loadDocument(file: TFile) {
		const content = await this.plugin.app.vault.read(file);
		this.currentDocument = await this.plugin.engine.parseDocument(content);
		this.renderCurrentZoom();
	}

	private setZoomLevel(level: ZoomLevel) {
		this.currentZoom = level;
		
		// Update button states
		this.controlsEl.querySelectorAll('.fornax-zoom-btn').forEach(btn => {
			btn.removeClass('active');
		});
		this.controlsEl.querySelector(`button:nth-child(${
			level === 'document' ? 1 : level === 'paragraphs' ? 2 : 3
		})`)?.addClass('active');

		this.renderCurrentZoom();
	}

	private renderCurrentZoom() {
		if (!this.currentDocument) return;

		this.contentEl.empty();
		
		switch (this.currentZoom) {
			case 'document':
				this.renderDocumentView();
				break;
			case 'paragraphs':
				this.renderParagraphView();
				break;
			case 'sentences':
				this.renderSentenceView();
				break;
		}
	}

	private renderDocumentView() {
		const docView = this.contentEl.createEl('div', { cls: 'fornax-document-view' });
		
		// Document overview with paragraph count and structure
		const overview = docView.createEl('div', { cls: 'fornax-overview' });
		overview.createEl('h3', { text: 'Document Structure' });
		
		const stats = overview.createEl('div', { cls: 'fornax-stats' });
		stats.createEl('span', { 
			cls: 'stat',
			text: `${this.currentDocument.paragraphs.length} paragraphs`
		});
		
		const totalSentences = this.currentDocument.sentences.reduce((sum: number, para: string[]) => sum + para.length, 0);
		stats.createEl('span', { 
			cls: 'stat',
			text: `${totalSentences} sentences`
		});

		// Mini paragraph previews
		const miniPreviews = docView.createEl('div', { cls: 'fornax-mini-paragraphs' });
		this.currentDocument.paragraphs.forEach((para: string, i: number) => {
			const miniPara = miniPreviews.createEl('div', { 
				cls: 'fornax-mini-paragraph',
				text: para.slice(0, 100) + (para.length > 100 ? '...' : '')
			});
			
			miniPara.onclick = () => {
				this.setZoomLevel('paragraphs');
				// TODO: Scroll to specific paragraph
			};
		});
	}

	private renderParagraphView() {
		const paraView = this.contentEl.createEl('div', { cls: 'fornax-paragraph-view' });
		
		console.log('Rendering paragraph view with', this.currentDocument.paragraphs.length, 'paragraphs');
		
		// Draggable paragraph blocks
		for (let i = 0; i < this.currentDocument.paragraphs.length; i++) {
			const para = this.currentDocument.paragraphs[i];
			console.log('Creating paragraph', i);
			
			const paraBlock = paraView.createEl('div', { 
				cls: 'fornax-paragraph-block',
				attr: { 'data-para-index': i.toString() }
			});
			
			// Drag handle
			const dragHandle = paraBlock.createEl('div', { 
				cls: 'fornax-drag-handle', 
				text: '::'
			});
			console.log('Created drag handle:', dragHandle);
			
			// Paragraph content
			const content = paraBlock.createEl('div', { 
				cls: 'fornax-paragraph-content',
				text: para
			});
			
			// Sentence count badge
			paraBlock.createEl('div', { 
				cls: 'fornax-sentence-count',
				text: `${this.currentDocument.sentences[i].length} sentences`
			});

			// Click to zoom into sentences
			content.onclick = () => {
				this.setZoomLevel('sentences');
			};

			console.log('About to call makeDraggable for paragraph', i);
			
			this.makeDraggable(paraBlock, 'paragraph');
		}
	}

	private renderSentenceView() {
		const sentView = this.contentEl.createEl('div', { cls: 'fornax-sentence-view' });
		
		this.currentDocument.sentences.forEach((sentences: string[], paraIndex: number) => {
			// Paragraph header
			const paraHeader = sentView.createEl('div', { 
				cls: 'fornax-paragraph-header',
				text: `Paragraph ${paraIndex + 1}`
			});

			// Sentence blocks within this paragraph
			const sentenceContainer = sentView.createEl('div', { cls: 'fornax-sentence-container' });
			
			sentences.forEach((sentence: string, sentIndex: number) => {
				const sentBlock = sentenceContainer.createEl('div', { 
					cls: 'fornax-sentence-block',
					attr: { 
						'data-para-index': paraIndex.toString(),
						'data-sent-index': sentIndex.toString()
					}
				});
				
				// Drag handle
				sentBlock.createEl('div', { cls: 'fornax-drag-handle', text: '::' });
				
				// Sentence content (editable)
				const content = sentBlock.createEl('div', { 
					cls: 'fornax-sentence-content',
					text: sentence
				});

				// Edit button
				const editBtn = sentBlock.createEl('button', { 
					cls: 'fornax-edit-sentence-btn',
					text: '✏️'
				});
				
				editBtn.onclick = () => this.openSentenceEditor(paraIndex, sentIndex, sentence);

				this.makeDraggable(sentBlock, 'sentence');
			});
		});
	}

	private makeDraggable(element: HTMLElement, type: 'paragraph' | 'sentence') {
		let isDragging = false;
		let startY = 0;
		let startTop = 0;
		let draggedElement: HTMLElement | null = null;

		const handle = element.querySelector('.fornax-drag-handle') as HTMLElement;
		
		const handleMouseDown = (e: MouseEvent) => {
			isDragging = true;
			draggedElement = element;
			startY = e.clientY;
			startTop = element.offsetTop;
			element.addClass('dragging');
			document.body.style.cursor = 'grabbing';
			
			// Prevent text selection while dragging
			e.preventDefault();
		};

		const handleMouseMove = (e: MouseEvent) => {
			if (!isDragging || !draggedElement) return;
			
			const deltaY = e.clientY - startY;
			draggedElement.style.transform = `translateY(${deltaY}px)`;
			
			// Highlight potential drop targets
			this.updateDropTargets(e, draggedElement, type);
		};

		const handleMouseUp = (e: MouseEvent) => {
			if (!isDragging || !draggedElement) return;
			
			// Find the drop target
			const dropTarget = this.findDropTarget(e, draggedElement, type);
			
			isDragging = false;
			draggedElement.removeClass('dragging');
			draggedElement.style.transform = '';
			document.body.style.cursor = '';
			
			// Clear drop target highlights
			this.clearDropTargets(type);
			
			// Perform the swap if we have a valid drop target
			if (dropTarget && dropTarget !== draggedElement) {
				this.swapElements(draggedElement, dropTarget, type);
			}
			
			draggedElement = null;
		};

		// Use addEventListener instead of direct assignment to avoid conflicts
		handle.addEventListener('mousedown', handleMouseDown);
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	}

	private updateDropTargets(e: MouseEvent, draggedElement: HTMLElement, type: 'paragraph' | 'sentence') {
		// Clear existing highlights
		this.clearDropTargets(type);
		
		// Find all potential drop targets
		const targets = this.contentEl.querySelectorAll(
			type === 'paragraph' ? '.fornax-paragraph-block' : '.fornax-sentence-block'
		);
		
		targets.forEach(target => {
			if (target === draggedElement) return;
			
			const rect = target.getBoundingClientRect();
			const mouseY = e.clientY;
			
			// Check if mouse is over this target
			if (mouseY >= rect.top && mouseY <= rect.bottom) {
				target.addClass('fornax-drop-target');
			}
		});
	}

	private findDropTarget(e: MouseEvent, draggedElement: HTMLElement, type: 'paragraph' | 'sentence'): HTMLElement | null {
		const targets = this.contentEl.querySelectorAll(
			type === 'paragraph' ? '.fornax-paragraph-block' : '.fornax-sentence-block'
		);
		
		for (const target of targets) {
			if (target === draggedElement) continue;
			
			const rect = target.getBoundingClientRect();
			const mouseY = e.clientY;
			
			if (mouseY >= rect.top && mouseY <= rect.bottom) {
				return target as HTMLElement;
			}
		}
		
		return null;
	}

	private clearDropTargets(type: 'paragraph' | 'sentence') {
		const targets = this.contentEl.querySelectorAll(
			type === 'paragraph' ? '.fornax-paragraph-block' : '.fornax-sentence-block'
		);
		
		targets.forEach(target => {
			target.removeClass('fornax-drop-target');
		});
	}

	private swapElements(draggedElement: HTMLElement, dropTarget: HTMLElement, type: 'paragraph' | 'sentence') {
		if (type === 'paragraph') {
			const draggedIndex = parseInt(draggedElement.getAttribute('data-para-index') || '0');
			const dropIndex = parseInt(dropTarget.getAttribute('data-para-index') || '0');
			
			// Swap paragraphs in the data model
			const temp = this.currentDocument.paragraphs[draggedIndex];
			this.currentDocument.paragraphs[draggedIndex] = this.currentDocument.paragraphs[dropIndex];
			this.currentDocument.paragraphs[dropIndex] = temp;
			
			// Also swap sentences arrays
			const tempSentences = this.currentDocument.sentences[draggedIndex];
			this.currentDocument.sentences[draggedIndex] = this.currentDocument.sentences[dropIndex];
			this.currentDocument.sentences[dropIndex] = tempSentences;
			
		} else {
			const draggedParaIndex = parseInt(draggedElement.getAttribute('data-para-index') || '0');
			const draggedSentIndex = parseInt(draggedElement.getAttribute('data-sent-index') || '0');
			const dropParaIndex = parseInt(dropTarget.getAttribute('data-para-index') || '0');
			const dropSentIndex = parseInt(dropTarget.getAttribute('data-sent-index') || '0');
			
			// Swap sentences in the data model
			const temp = this.currentDocument.sentences[draggedParaIndex][draggedSentIndex];
			this.currentDocument.sentences[draggedParaIndex][draggedSentIndex] = 
				this.currentDocument.sentences[dropParaIndex][dropSentIndex];
			this.currentDocument.sentences[dropParaIndex][dropSentIndex] = temp;
		}
		
		// Re-render the current view to reflect the changes
		this.renderCurrentZoom();
	}

	private openSentenceEditor(paraIndex: number, sentIndex: number, sentence: string) {
		// TODO: Open the sentence editing dialogue
		console.log(`Opening editor for: ${sentence}`);
	}

	private toggleEditMode() {
		// TODO: Toggle between read and edit modes
		console.log('Toggling edit mode');
	}

	private addStyles() {
		// Add CSS styles for the telescope interface
		if (!document.getElementById('fornax-styles')) {
			const style = document.createElement('style');
			style.id = 'fornax-styles';
			style.textContent = `
				.fornax-telescope {
					height: 100%;
					display: flex;
					flex-direction: column;
					font-family: var(--font-interface);
				}

				.fornax-zoom-controls {
					display: flex;
					gap: 8px;
					padding: 16px;
					background: var(--background-secondary);
					border-bottom: 1px solid var(--background-modifier-border);
				}

				.fornax-zoom-btn, .fornax-edit-btn {
					padding: 8px 16px;
					border: 1px solid var(--background-modifier-border);
					background: var(--background-primary);
					color: var(--text-normal);
					border-radius: 6px;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.fornax-zoom-btn:hover, .fornax-edit-btn:hover {
					background: var(--background-secondary);
				}

				.fornax-zoom-btn.active {
					background: var(--interactive-accent);
					color: var(--text-on-accent);
					border-color: var(--interactive-accent);
				}

				.fornax-content {
					flex: 1;
					overflow-y: auto;
					padding: 16px;
				}

				.fornax-placeholder {
					text-align: center;
					color: var(--text-muted);
					margin-top: 40px;
				}

				.fornax-paragraph-block, .fornax-sentence-block {
					position: relative;
					margin: 12px 0 12px 32px;
					padding: 16px;
					background: var(--background-primary);
					border: 1px solid var(--background-modifier-border);
					border-radius: 8px;
					transition: all 0.2s ease;
				}

				.fornax-paragraph-block:hover, .fornax-sentence-block:hover {
					border-color: var(--interactive-accent);
					box-shadow: 0 2px 8px var(--background-modifier-box-shadow);
				}

				.fornax-drag-handle {
					position: absolute;
					left: -20px;
					top: 50%;
					transform: translateY(-50%);
					color: var(--text-muted);
					cursor: grab;
					font-size: 16px;
					opacity: 0.6;
					padding: 4px;
					z-index: 10;
					font-weight: bold;
					user-select: none;
				}

				.fornax-paragraph-block:hover .fornax-drag-handle,
				.fornax-sentence-block:hover .fornax-drag-handle {
					opacity: 1;
				}

				.fornax-drag-handle:active {
					cursor: grabbing;
				}

				.fornax-paragraph-content, .fornax-sentence-content {
					cursor: pointer;
					line-height: 1.6;
				}

				.fornax-sentence-count {
					position: absolute;
					top: 8px;
					right: 8px;
					font-size: 11px;
					color: var(--text-muted);
					background: var(--background-secondary);
					padding: 2px 6px;
					border-radius: 10px;
				}

				.fornax-edit-sentence-btn {
					position: absolute;
					top: 8px;
					right: 8px;
					background: none;
					border: none;
					cursor: pointer;
					opacity: 0;
					transition: opacity 0.2s ease;
				}

				.fornax-sentence-block:hover .fornax-edit-sentence-btn {
					opacity: 1;
				}

				.fornax-paragraph-header {
					font-weight: 600;
					color: var(--text-accent);
					margin: 20px 0 12px 0;
					padding: 8px 0;
					border-bottom: 1px solid var(--background-modifier-border);
				}

				.fornax-overview {
					margin-bottom: 24px;
				}

				.fornax-stats {
					display: flex;
					gap: 16px;
					margin: 12px 0;
				}

				.stat {
					padding: 4px 12px;
					background: var(--background-secondary);
					border-radius: 16px;
					font-size: 13px;
					color: var(--text-muted);
				}

				.fornax-mini-paragraphs {
					display: grid;
					gap: 12px;
				}

				.fornax-mini-paragraph {
					padding: 12px;
					background: var(--background-secondary);
					border-radius: 6px;
					cursor: pointer;
					transition: all 0.2s ease;
					font-size: 14px;
					line-height: 1.4;
				}

				.fornax-mini-paragraph:hover {
					background: var(--background-primary);
					border: 1px solid var(--interactive-accent);
				}

				.fornax-placeholder {
					opacity: 0.3 !important;
					background: var(--interactive-accent) !important;
					border: 2px dashed var(--interactive-accent) !important;
				}

				.dragging {
					z-index: 1000;
					box-shadow: 0 4px 16px var(--background-modifier-box-shadow) !important;
					transform: rotate(2deg);
				}

				.fornax-drop-target {
					border-color: var(--interactive-accent) !important;
					background: var(--interactive-accent-hover) !important;
					transform: scale(1.02);
				}
			`;
			document.head.appendChild(style);
		}
	}

	destroy() {
		// Cleanup
		const style = document.getElementById('fornax-styles');
		if (style) style.remove();
	}
}

// ===============================================
// FORNAX VIEW CLASS
// (Will be: fornax-view.ts)
// ===============================================

export class FornaxView extends ItemView {
	private overlay: TelescopeOverlay | null = null;
	private currentFile: TFile | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: FornaxPlugin) {
		super(leaf);
	}

	getViewType() {
		return VIEW_TYPE_FORNAX;
	}

	getDisplayText() {
		return 'Fornax Telescope';
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		
		// Create the telescopic interface
		const telescopeContainer = container.createEl('div', { 
			cls: 'fornax-telescope-container'
		});

		// Initialize overlay
		this.overlay = new TelescopeOverlay(telescopeContainer, this.plugin);
		
		// Listen for active file changes
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.updateActiveFile();
			})
		);

		await this.updateActiveFile();
	}

	private async updateActiveFile() {
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile && activeFile.extension === 'md') {
			this.currentFile = activeFile;
			if (this.overlay) {
				await this.overlay.loadDocument(activeFile);
			}
		}
	}

	async onClose() {
		this.overlay?.destroy();
	}
}

// ===============================================
// SETTINGS TAB CLASS
// (Will be: settings.ts)
// ===============================================

class FornaxSettingTab extends PluginSettingTab {
	plugin: FornaxPlugin;

	constructor(app: App, plugin: FornaxPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Fornax Settings' });

		new Setting(containerEl)
			.setName('Working file suffix')
			.setDesc('Suffix for working files (e.g., "-working" creates "essay-working.md")')
			.addText(text => text
				.setPlaceholder('-working')
				.setValue(this.plugin.settings.workingFileSuffix)
				.onChange(async (value) => {
					this.plugin.settings.workingFileSuffix = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-save edits')
			.setDesc('Automatically save sentence alternatives as you type')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSave)
				.onChange(async (value) => {
					this.plugin.settings.autoSave = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Telescope mode')
			.setDesc('How to display the telescopic interface')
			.addDropdown(dropdown => dropdown
				.addOption('overlay', 'Overlay on editor')
				.addOption('sidebar', 'Sidebar panel')
				.setValue(this.plugin.settings.telescopeMode)
				.onChange(async (value) => {
					this.plugin.settings.telescopeMode = value as 'overlay' | 'sidebar';
					await this.plugin.saveSettings();
				}));
	}
}

// ===============================================
// MAIN PLUGIN CLASS
// ===============================================

export default class FornaxPlugin extends Plugin {
	settings: FornaxSettings;
	engine: FornaxEngine;

	async onload() {
		await this.loadSettings();
		
		// Initialize the Fornax engine
		this.engine = new FornaxEngine(this.app, this.settings);

		// Register the custom view
		this.registerView(
			VIEW_TYPE_FORNAX,
			(leaf) => new FornaxView(leaf, this)
		);

		// Add ribbon icon
		this.addRibbonIcon('telescope', 'Open Fornax', () => {
			this.activateFornaxView();
		});

		// Add command to toggle Fornax mode
		this.addCommand({
			id: 'toggle-fornax-mode',
			name: 'Toggle Telescopic Writing Mode',
			callback: () => {
				this.toggleFornaxMode();
			}
		});

		// Add settings tab
		this.addSettingTab(new FornaxSettingTab(this.app, this));
	}

	async activateFornaxView() {
		const { workspace } = this.app;
		
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_FORNAX);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			await leaf.setViewState({ type: VIEW_TYPE_FORNAX, active: true });
		}

		workspace.revealLeaf(leaf);
	}

	async toggleFornaxMode() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		// Toggle the telescopic overlay for the current file
		await this.engine.toggleTelescopeMode(activeFile);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
