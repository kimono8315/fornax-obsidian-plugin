// main.ts - Complete Fornax Plugin (Consolidated)
import { Plugin, PluginSettingTab, Setting, WorkspaceLeaf, TFile, App, ItemView, Notice, Modal } from 'obsidian';

// ===============================================
// INTERFACES AND TYPES
// ===============================================

interface FornaxSettings {
	// Settings interface kept for future use
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
	// No settings currently needed
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
		rawParagraphs?: string[]; // Store raw paragraphs with comments for reconstruction
	}> {
		// Split into paragraphs by double line breaks
		const rawParagraphs = content.split('\n\n').filter(p => p.trim());
		
		// Process paragraphs to extract only visible sentences (filter out %% %% comments)
		const sentences = rawParagraphs.map(para => {
			const lines = para.split('\n');
			return lines.filter(line => {
				const trimmed = line.trim();
				// Keep only non-empty lines that aren't Obsidian comments
				return trimmed && !(trimmed.startsWith('%%') && trimmed.endsWith('%%'));
			});
		});

		// Reconstruct clean paragraphs from filtered sentences for UI display
		const paragraphs = sentences.map(sentenceArray => sentenceArray.join('\n'));

		// Parse existing edits (from %% %% comments)
		const edits = await this.parseExistingEdits(content);

		return { paragraphs, sentences, edits, rawParagraphs };
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
	currentDocument: any = null;
	plugin: FornaxPlugin;
	isInternalUpdate: boolean = false;

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

	}

	async loadDocument(file: TFile) {
		// Skip reload if this is from our own internal update
		if (this.isInternalUpdate) {
			this.isInternalUpdate = false;
			return;
		}
		
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

	renderCurrentZoom() {
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

		const handleMouseUp = async (e: MouseEvent) => {
			if (!isDragging || !draggedElement) return;
			
			// Find the drop target
			const dropInfo = this.findDropTarget(e, draggedElement, type);
			
			isDragging = false;
			draggedElement.removeClass('dragging');
			draggedElement.style.transform = '';
			document.body.style.cursor = '';
			
			// Clear drop target highlights
			this.clearDropTargets(type);
			
			// Perform the insertion if we have a valid drop target
			if (dropInfo && dropInfo.target !== draggedElement) {
				await this.insertElement(draggedElement, dropInfo.target, dropInfo.position, type);
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
				// Determine position for visual feedback
				const middleY = rect.top + rect.height / 2;
				const position = mouseY < middleY ? 'before' : 'after';
				
				target.addClass('fornax-drop-target');
				target.addClass(`fornax-drop-${position}`);
			}
		});
	}

	private findDropTarget(e: MouseEvent, draggedElement: HTMLElement, type: 'paragraph' | 'sentence'): { target: HTMLElement, position: 'before' | 'after' } | null {
		const targets = this.contentEl.querySelectorAll(
			type === 'paragraph' ? '.fornax-paragraph-block' : '.fornax-sentence-block'
		);
		
		for (let i = 0; i < targets.length; i++) {
			const target = targets[i];
			if (target === draggedElement) continue;
			
			const rect = target.getBoundingClientRect();
			const mouseY = e.clientY;
			
			if (mouseY >= rect.top && mouseY <= rect.bottom) {
				// Determine if we're inserting before or after based on mouse position within the element
				const middleY = rect.top + rect.height / 2;
				const position = mouseY < middleY ? 'before' : 'after';
				
				return { target: target as HTMLElement, position };
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
			target.removeClass('fornax-drop-before');
			target.removeClass('fornax-drop-after');
		});
	}

	private async insertElement(draggedElement: HTMLElement, dropTarget: HTMLElement, position: 'before' | 'after', type: 'paragraph' | 'sentence') {
		if (type === 'paragraph') {
			const draggedIndex = parseInt(draggedElement.getAttribute('data-para-index') || '0');
			const dropIndex = parseInt(dropTarget.getAttribute('data-para-index') || '0');
			
			// Remove the dragged paragraph and its sentences from their current positions
			const draggedParagraph = this.currentDocument.paragraphs.splice(draggedIndex, 1)[0];
			const draggedSentences = this.currentDocument.sentences.splice(draggedIndex, 1)[0];
			
			// IMPORTANT: Also move the raw paragraph to preserve sentence blocks with comments
			let draggedRawParagraph;
			if (this.currentDocument.rawParagraphs) {
				draggedRawParagraph = this.currentDocument.rawParagraphs.splice(draggedIndex, 1)[0];
			}
			
			// Calculate the insertion index
			let insertIndex = dropIndex;
			
			// Adjust for the removal if dragged was before the drop target
			if (draggedIndex < dropIndex) {
				insertIndex = dropIndex - 1;
			}
			
			// Adjust for before/after position
			if (position === 'after') {
				insertIndex += 1;
			}
			
			// Insert at the new position
			this.currentDocument.paragraphs.splice(insertIndex, 0, draggedParagraph);
			this.currentDocument.sentences.splice(insertIndex, 0, draggedSentences);
			
			// Also insert the raw paragraph with comments
			if (this.currentDocument.rawParagraphs && draggedRawParagraph) {
				this.currentDocument.rawParagraphs.splice(insertIndex, 0, draggedRawParagraph);
			}
			
		} else {
			// Moving sentence blocks between paragraphs
			const draggedParaIndex = parseInt(draggedElement.getAttribute('data-para-index') || '0');
			const draggedSentIndex = parseInt(draggedElement.getAttribute('data-sent-index') || '0');
			const dropParaIndex = parseInt(dropTarget.getAttribute('data-para-index') || '0');
			const dropSentIndex = parseInt(dropTarget.getAttribute('data-sent-index') || '0');
			
			// Extract the entire sentence block (sentence + comments) from raw paragraphs
			if (this.currentDocument.rawParagraphs) {
				if (draggedParaIndex === dropParaIndex) {
					// Moving within the same paragraph - handle as single operation
					const paragraph = this.currentDocument.rawParagraphs[draggedParaIndex];
					const updatedParagraph = this.moveSentenceBlockWithinParagraph(
						paragraph, 
						draggedSentIndex, 
						dropSentIndex, 
						position
					);
					this.currentDocument.rawParagraphs[draggedParaIndex] = updatedParagraph;
				} else {
					// Moving between different paragraphs
					const sourceParagraph = this.currentDocument.rawParagraphs[draggedParaIndex];
					const targetParagraph = this.currentDocument.rawParagraphs[dropParaIndex];
					
					const extractedBlock = this.extractSentenceBlock(sourceParagraph, draggedSentIndex);
					const updatedSourceParagraph = this.removeSentenceBlock(sourceParagraph, draggedSentIndex);
					const updatedTargetParagraph = this.insertSentenceBlock(targetParagraph, dropSentIndex, extractedBlock, position);
					
					// Update the raw paragraphs
					this.currentDocument.rawParagraphs[draggedParaIndex] = updatedSourceParagraph;
					this.currentDocument.rawParagraphs[dropParaIndex] = updatedTargetParagraph;
				}
				
				// Re-parse the updated content to sync clean data structures
				this.syncFromRawParagraphs();
			} else {
				// Fallback: simple sentence moving without comment preservation
				const draggedSentence = this.currentDocument.sentences[draggedParaIndex].splice(draggedSentIndex, 1)[0];
				
				let insertIndex = dropSentIndex;
				if (draggedParaIndex === dropParaIndex && draggedSentIndex < dropSentIndex) {
					insertIndex = dropSentIndex - 1;
				}
				if (position === 'after') {
					insertIndex += 1;
				}
				
				this.currentDocument.sentences[dropParaIndex].splice(insertIndex, 0, draggedSentence);
				this.updateParagraphsFromSentences();
			}
		}
		
		// Save changes to the actual file
		await this.saveChangesToFile();
		
		// Re-render the current view to reflect the changes
		this.renderCurrentZoom();
	}

	private updateParagraphsFromSentences() {
		// Reconstruct paragraphs from sentences after sentence-level edits
		this.currentDocument.paragraphs = this.currentDocument.sentences.map((sentenceArray: string[]) => 
			sentenceArray.join(' ')
		);
	}

	private extractSentenceBlock(paragraph: string, sentenceIndex: number): string[] {
		// Extract a sentence and all its comments as a block
		const lines = paragraph.split('\n');
		let sentenceLineIndex = -1;
		let nonCommentLineCount = 0;
		
		// Find the sentence line
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line && !(line.startsWith('%%') && line.endsWith('%%'))) {
				if (nonCommentLineCount === sentenceIndex) {
					sentenceLineIndex = i;
					break;
				}
				nonCommentLineCount++;
			}
		}
		
		if (sentenceLineIndex === -1) return [];
		
		// Extract the sentence and its following comments
		const block = [lines[sentenceLineIndex]];
		
		for (let i = sentenceLineIndex + 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line.startsWith('%%') && line.endsWith('%%')) {
				block.push(lines[i]);
			} else if (line) {
				// Hit next sentence, stop
				break;
			} else {
				// Empty line, include it
				block.push(lines[i]);
			}
		}
		
		return block;
	}

	private removeSentenceBlock(paragraph: string, sentenceIndex: number): string {
		// Remove a sentence block from a paragraph
		const lines = paragraph.split('\n');
		let sentenceLineIndex = -1;
		let nonCommentLineCount = 0;
		
		// Find the sentence line
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line && !(line.startsWith('%%') && line.endsWith('%%'))) {
				if (nonCommentLineCount === sentenceIndex) {
					sentenceLineIndex = i;
					break;
				}
				nonCommentLineCount++;
			}
		}
		
		if (sentenceLineIndex === -1) return paragraph;
		
		// Remove the sentence and its following comments
		const newLines = [...lines];
		let removeCount = 1; // Start with the sentence itself
		
		for (let i = sentenceLineIndex + 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line.startsWith('%%') && line.endsWith('%%')) {
				removeCount++;
			} else if (line) {
				// Hit next sentence, stop
				break;
			} else {
				// Empty line, include in removal
				removeCount++;
			}
		}
		
		newLines.splice(sentenceLineIndex, removeCount);
		return newLines.join('\n');
	}

	private insertSentenceBlock(paragraph: string, targetSentenceIndex: number, block: string[], position: 'before' | 'after'): string {
		// Insert a sentence block into a paragraph
		const lines = paragraph.split('\n');
		let insertLineIndex = 0;
		let nonCommentLineCount = 0;
		
		// Find the target sentence line
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line && !(line.startsWith('%%') && line.endsWith('%%'))) {
				if (nonCommentLineCount === targetSentenceIndex) {
					insertLineIndex = i;
					
					// If position is 'after', find the end of this sentence block
					if (position === 'after') {
						let j = i + 1;
						// Skip past all comments belonging to this sentence
						while (j < lines.length) {
							const nextLine = lines[j].trim();
							if (nextLine.startsWith('%%') && nextLine.endsWith('%%')) {
								j++;
							} else if (nextLine) {
								// Hit next sentence, stop here
								break;
							} else {
								// Empty line, skip it
								j++;
							}
						}
						insertLineIndex = j;
					}
					break;
				}
				nonCommentLineCount++;
			}
		}
		
		// Insert the block
		const newLines = [...lines];
		newLines.splice(insertLineIndex, 0, ...block);
		return newLines.join('\n');
	}

	private syncFromRawParagraphs() {
		// Re-parse the raw paragraphs to sync clean data structures
		if (!this.currentDocument.rawParagraphs) return;
		
		const sentences = this.currentDocument.rawParagraphs.map((para: string) => {
			const lines = para.split('\n');
			return lines.filter((line: string) => {
				const trimmed = line.trim();
				return trimmed && !(trimmed.startsWith('%%') && trimmed.endsWith('%%'));
			});
		});

		const paragraphs = sentences.map((sentenceArray: string[]) => sentenceArray.join('\n'));
		
		this.currentDocument.sentences = sentences;
		this.currentDocument.paragraphs = paragraphs;
	}

	private moveSentenceBlockWithinParagraph(
		paragraph: string, 
		fromIndex: number, 
		toIndex: number, 
		position: 'before' | 'after'
	): string {
		// Handle moving a sentence block within the same paragraph without duplication
		const lines = paragraph.split('\n');
		
		// Extract the sentence block to move
		const extractedBlock = this.extractSentenceBlock(paragraph, fromIndex);
		if (extractedBlock.length === 0) return paragraph;
		
		// Remove the original block
		const withoutSource = this.removeSentenceBlock(paragraph, fromIndex);
		
		// Adjust target index if the source was before the target
		let adjustedToIndex = toIndex;
		if (fromIndex < toIndex) {
			adjustedToIndex = toIndex - 1;
		}
		
		// Insert at the adjusted position
		return this.insertSentenceBlock(withoutSource, adjustedToIndex, extractedBlock, position);
	}

	async saveChangesToFile() {
		// Get the current file from the plugin
		const currentFile = this.plugin.app.workspace.getActiveFile();
		if (!currentFile) return;

		// Reconstruct the markdown content
		const newContent = this.reconstructMarkdown();
		
		// Mark this as an internal update to prevent reload
		this.isInternalUpdate = true;
		
		// Save to file
		await this.plugin.app.vault.modify(currentFile, newContent);
	}

	reconstructMarkdown(): string {
		// Use raw paragraphs if available to preserve comments, otherwise fall back to clean reconstruction
		if (this.currentDocument.rawParagraphs) {
			return this.currentDocument.rawParagraphs.join('\n\n');
		}
		
		// Fallback: reconstruct from clean sentences (for backwards compatibility)
		const paragraphsWithLines = this.currentDocument.sentences.map((sentenceArray: string[]) => {
			return sentenceArray.join('\n');
		});
		
		return paragraphsWithLines.join('\n\n');
	}

	private openSentenceEditor(paraIndex: number, sentIndex: number, sentence: string) {
		// Create modal for sentence editing
		const modal = new SentenceEditModal(this.plugin.app, sentence, paraIndex, sentIndex, this);
		modal.open();
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

				.fornax-zoom-btn {
					padding: 8px 16px;
					border: 1px solid var(--background-modifier-border);
					background: var(--background-primary);
					color: var(--text-normal);
					border-radius: 6px;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.fornax-zoom-btn:hover {
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

				.fornax-drop-before {
					border-top: 3px solid var(--interactive-accent) !important;
				}

				.fornax-drop-after {
					border-bottom: 3px solid var(--interactive-accent) !important;
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
// SENTENCE EDIT MODAL CLASS
// (Will be: sentence-edit-modal.ts)
// ===============================================

class SentenceEditModal extends Modal {
	private originalSentence: string;
	private paraIndex: number;
	private sentIndex: number;
	private overlay: TelescopeOverlay;
	private alternatives: string[] = [];
	private currentAltIndex: number = -1; // -1 means original
	private alternativesContainer: HTMLElement;

	constructor(app: App, sentence: string, paraIndex: number, sentIndex: number, overlay: TelescopeOverlay) {
		super(app);
		this.originalSentence = sentence;
		this.paraIndex = paraIndex;
		this.sentIndex = sentIndex;
		this.overlay = overlay;
	}

	async onOpen() {
		const { contentEl } = this;

		// Load existing alternatives first
		await this.loadExistingAlternatives();

		contentEl.createEl('h2', { text: 'Edit Sentence' });

		// Original sentence display
		const originalContainer = contentEl.createEl('div', { cls: 'fornax-sentence-original' });
		originalContainer.createEl('h3', { text: 'Original:' });
		const originalText = originalContainer.createEl('div', { 
			cls: 'fornax-original-text',
			text: this.originalSentence 
		});

		// Current editing area
		const editContainer = contentEl.createEl('div', { cls: 'fornax-sentence-edit' });
		editContainer.createEl('h3', { text: 'New Alternative:' });
		
		const textArea = editContainer.createEl('textarea', { 
			cls: 'fornax-sentence-input',
			attr: { 
				placeholder: 'Write an alternative version of this sentence...',
				rows: '3'
			}
		});

		const addBtn = editContainer.createEl('button', { 
			cls: 'fornax-add-alternative',
			text: '+ Add Alternative' 
		});

		addBtn.onclick = () => {
			const newAlt = textArea.value.trim();
			if (newAlt && newAlt !== this.originalSentence) {
				this.alternatives.push(newAlt);
				this.renderAlternatives();
				textArea.value = '';
			}
		};

		// Alternatives display
		this.alternativesContainer = contentEl.createEl('div', { cls: 'fornax-alternatives' });
		this.alternativesContainer.createEl('h3', { text: 'Alternatives:' });
		this.renderAlternatives();

		// Action buttons
		const buttonContainer = contentEl.createEl('div', { cls: 'fornax-modal-buttons' });
		
		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => this.close();

		const saveBtn = buttonContainer.createEl('button', { 
			cls: 'mod-cta',
			text: 'Save Selection' 
		});
		saveBtn.onclick = () => this.saveAndApply();

		const commitBtn = buttonContainer.createEl('button', { 
			cls: 'fornax-commit-btn',
			text: 'Commit (Final)' 
		});
		commitBtn.onclick = () => this.commitSelectedAlternative();

		// Add CSS for the modal
		this.addModalStyles();
	}

	private async loadExistingAlternatives() {
		// Load alternatives from %% %% comments in the document
		const currentFile = this.overlay.plugin.app.workspace.getActiveFile();
		if (!currentFile) {
			console.log('No current file');
			return;
		}

		const content = await this.overlay.plugin.app.vault.read(currentFile);
		
		console.log('Loading alternatives for sentence:', this.originalSentence);
		console.log('Para/Sent index:', this.paraIndex, this.sentIndex);
		
		// Find the sentence location in the document and look for %% %% comments below it
		const paragraphs = content.split('\n\n');
		if (this.paraIndex < paragraphs.length) {
			const paragraph = paragraphs[this.paraIndex];
			const lines = paragraph.split('\n');
			
			// Find alternatives after our sentence
			let sentenceLineIndex = -1;
			let nonCommentLineCount = 0;
			
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i].trim();
				if (line && !(line.startsWith('%%') && line.endsWith('%%'))) {
					if (nonCommentLineCount === this.sentIndex) {
						sentenceLineIndex = i;
						break;
					}
					nonCommentLineCount++;
				}
			}
			
			if (sentenceLineIndex !== -1) {
				// Look for alternatives and original immediately following the sentence
				this.alternatives = [];
				let selectedIndex = -1;
				let foundOriginal = null;
				
				// Check if the current top sentence is actually a selected alternative
				// by looking for ORIGINAL comment below it
				const currentSentence = lines[sentenceLineIndex].trim();
				
				for (let i = sentenceLineIndex + 1; i < lines.length; i++) {
					const line = lines[i].trim();
					if (line.startsWith('%%') && line.endsWith('%%')) {
						const commentContent = line.slice(2, -2).trim();
						if (commentContent.startsWith('SELECTED:')) {
							selectedIndex = parseInt(commentContent.split(':')[1]);
						} else if (commentContent.startsWith('ORIGINAL:')) {
							foundOriginal = commentContent.slice(9).trim(); // Remove "ORIGINAL: "
						} else {
							this.alternatives.push(commentContent);
						}
					} else if (line) {
						// Hit next sentence, stop looking
						break;
					}
				}
				
				// If we found an ORIGINAL comment, that means the current sentence is a selected alternative
				if (foundOriginal) {
					// The true original is in the comment, current sentence is the selected alternative
					this.originalSentence = foundOriginal;
					// Add the currently visible sentence to alternatives if it's not already there
					if (!this.alternatives.includes(currentSentence)) {
						this.alternatives.unshift(currentSentence); // Add to beginning
						// Adjust selected index since we added at beginning
						if (selectedIndex >= 0) {
							selectedIndex = 0; // The visible sentence is now index 0
						}
					}
				}
				// If no ORIGINAL found, the current sentence IS the original
				
				this.currentAltIndex = selectedIndex;
				console.log('True original sentence:', this.originalSentence);
				console.log('Loaded alternatives:', this.alternatives);
				console.log('Selected index:', this.currentAltIndex);
			}
		}
	}

	private renderAlternatives() {
		// Clear existing alternatives display
		const existingAlts = this.alternativesContainer.querySelectorAll('.fornax-alternative-item');
		existingAlts.forEach(alt => alt.remove());

		// Add original as first option
		this.addAlternativeItem(this.originalSentence, -1, true);

		// Add each alternative
		this.alternatives.forEach((alt, index) => {
			this.addAlternativeItem(alt, index, false);
		});
	}

	private addAlternativeItem(text: string, index: number, isOriginal: boolean) {
		const altItem = this.alternativesContainer.createEl('div', { 
			cls: `fornax-alternative-item ${this.currentAltIndex === index ? 'active' : ''}` 
		});

		const radio = altItem.createEl('input', { 
			type: 'radio',
			attr: { name: 'sentence-alternative', value: index.toString() }
		});
		
		if (this.currentAltIndex === index) {
			radio.checked = true;
		}

		radio.onchange = () => {
			this.currentAltIndex = index;
			this.renderAlternatives();
		};

		const textSpan = altItem.createEl('span', { 
			cls: 'fornax-alt-text',
			text: isOriginal ? `${text} (original)` : text 
		});

		if (!isOriginal) {
			const deleteBtn = altItem.createEl('button', { 
				cls: 'fornax-delete-alt',
				text: '×' 
			});
			deleteBtn.onclick = (e) => {
				e.stopPropagation();
				this.alternatives.splice(index, 1);
				if (this.currentAltIndex === index) {
					this.currentAltIndex = -1; // Reset to original
				} else if (this.currentAltIndex > index) {
					this.currentAltIndex--; // Adjust index
				}
				this.renderAlternatives();
			};
		}
	}

	private async saveAndApply() {
		// DON'T update the actual sentence content - keep original as original
		// Only save which alternative is selected as a comment
		// The UI will show the selected alternative, but the file keeps the original

		console.log('Saving selection (not replacing original)');
		console.log('Selected index:', this.currentAltIndex);

		// Save alternatives and selection to %% %% comments
		await this.saveDocumentWithAlternatives();
		
		// Re-render to show the visual selection (but original stays in file)
		this.overlay.renderCurrentZoom();

		this.close();
	}

	private async commitSelectedAlternative() {
		// This permanently replaces the original with the selected alternative
		// and removes all the %% %% comments
		
		let finalSentence: string;
		if (this.currentAltIndex === -1) {
			finalSentence = this.originalSentence;
		} else {
			finalSentence = this.alternatives[this.currentAltIndex];
		}

		console.log('Committing final sentence:', finalSentence);

		// Update the actual sentence in the data model
		this.overlay.currentDocument.sentences[this.paraIndex][this.sentIndex] = finalSentence;

		// Remove all alternatives and commit the final version to file
		await this.commitToFile(finalSentence);
		
		this.overlay.renderCurrentZoom();
		this.close();
	}

	private async commitToFile(finalSentence: string) {
		const currentFile = this.overlay.plugin.app.workspace.getActiveFile();
		if (!currentFile) return;

		const content = await this.overlay.plugin.app.vault.read(currentFile);
		let paragraphs = content.split('\n\n');
		
		if (this.paraIndex < paragraphs.length) {
			let paragraph = paragraphs[this.paraIndex];
			let lines = paragraph.split('\n');
			
			// Remove all alternatives and replace the original sentence
			let sentenceLineIndex = -1;
			let nonCommentLineCount = 0;
			let cleanLines: string[] = [];
			
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i].trim();
				if (line && !(line.startsWith('%%') && line.endsWith('%%'))) {
					if (nonCommentLineCount === this.sentIndex) {
						cleanLines.push(finalSentence); // Replace with final sentence
					} else {
						cleanLines.push(lines[i]);
					}
					nonCommentLineCount++;
				}
			}
			
			paragraphs[this.paraIndex] = cleanLines.join('\n');
		}
		
		const finalContent = paragraphs.join('\n\n');
		
		console.log('Committing to file...');
		
		this.overlay.isInternalUpdate = true;
		await this.overlay.plugin.app.vault.modify(currentFile, finalContent);
		
		console.log('Commit completed');
	}

	private async saveDocumentWithAlternatives() {
		const currentFile = this.overlay.plugin.app.workspace.getActiveFile();
		if (!currentFile) {
			console.log('No current file for saving');
			return;
		}

		console.log('Saving document with alternatives...');
		console.log('Alternatives to save:', this.alternatives);
		console.log('Selected index:', this.currentAltIndex);

		const content = await this.overlay.plugin.app.vault.read(currentFile);
		let paragraphs = content.split('\n\n');
		
		if (this.paraIndex < paragraphs.length) {
			let paragraph = paragraphs[this.paraIndex];
			let lines = paragraph.split('\n');
			
			// Find the sentence line and remove any existing alternatives
			let sentenceLineIndex = -1;
			let nonCommentLineCount = 0;
			let cleanLines: string[] = [];
			
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i].trim();
				if (line && !(line.startsWith('%%') && line.endsWith('%%'))) {
					cleanLines.push(lines[i]);
					if (nonCommentLineCount === this.sentIndex) {
						sentenceLineIndex = cleanLines.length - 1;
					}
					nonCommentLineCount++;
				}
			}
			
			// Rebuild paragraph with selected alternative on top
			let newLines: string[] = [];
			
			for (let i = 0; i < cleanLines.length; i++) {
				// Handle our target sentence differently
				if (i === sentenceLineIndex) {
					// If an alternative is selected, put it on top and move original to comment
					if (this.currentAltIndex >= 0 && this.currentAltIndex < this.alternatives.length) {
						// Selected alternative becomes the visible sentence
						newLines.push(this.alternatives[this.currentAltIndex]);
						// Original becomes a comment
						newLines.push(`%% ORIGINAL: ${this.originalSentence} %%`);
						// Add other alternatives as comments
						this.alternatives.forEach((alt, index) => {
							if (index !== this.currentAltIndex) {
								newLines.push(`%% ${alt} %%`);
							}
						});
						// Add selected marker
						newLines.push(`%% SELECTED:${this.currentAltIndex} %%`);
					} else {
						// Original is selected (currentAltIndex === -1)
						// Put original back on top, no ORIGINAL comment needed
						newLines.push(this.originalSentence);
						// Add all alternatives as comments
						this.alternatives.forEach(alt => {
							newLines.push(`%% ${alt} %%`);
						});
						// No SELECTED marker when original is selected
					}
				} else {
					// Regular sentence, keep as is
					newLines.push(cleanLines[i]);
				}
			}
			
			paragraphs[this.paraIndex] = newLines.join('\n');
		}
		
		const finalContent = paragraphs.join('\n\n');
		
		console.log('Saving to file...');
		
		// Save the updated content
		this.overlay.isInternalUpdate = true;
		await this.overlay.plugin.app.vault.modify(currentFile, finalContent);
		
		console.log('Save completed');
	}

	private async saveAlternatives() {
		const currentFile = this.overlay.plugin.app.workspace.getActiveFile();
		if (!currentFile) {
			console.log('No current file for saving');
			return;
		}

		console.log('Saving alternatives...');
		console.log('Alternatives to save:', this.alternatives);
		console.log('Selected index:', this.currentAltIndex);

		const content = await this.overlay.plugin.app.vault.read(currentFile);
		const editId = `${this.paraIndex}-${this.sentIndex}`;
		
		// Create the alternatives data
		const alternativesData = {
			alternatives: this.alternatives,
			selected: this.currentAltIndex,
			original: this.originalSentence
		};
		
		const commentText = `<!-- FORNAX_ALTERNATIVES:${editId}:${JSON.stringify(alternativesData)} -->`;
		console.log('Comment to add:', commentText);
		
		// Remove any existing alternatives comment for this sentence
		const existingCommentRegex = new RegExp(`<!--\\s*FORNAX_ALTERNATIVES:${editId}:.*?\\s*-->`, 'g');
		let newContent = content.replace(existingCommentRegex, '');
		
		console.log('Content length before:', content.length);
		console.log('Content length after removing existing:', newContent.length);
		
		// Add the new comment at the end of the document
		newContent += '\n' + commentText;
		
		console.log('Final content length:', newContent.length);
		console.log('Saving to file...');
		
		// Save the updated content
		this.overlay.isInternalUpdate = true;
		await this.overlay.plugin.app.vault.modify(currentFile, newContent);
		
		console.log('Save completed');
	}

	private addModalStyles() {
		if (!document.getElementById('fornax-modal-styles')) {
			const style = document.createElement('style');
			style.id = 'fornax-modal-styles';
			style.textContent = `
				.fornax-sentence-original {
					margin-bottom: 16px;
					padding: 12px;
					background: var(--background-secondary);
					border-radius: 6px;
				}

				.fornax-original-text {
					font-style: italic;
					color: var(--text-muted);
					margin-top: 8px;
				}

				.fornax-sentence-edit {
					margin-bottom: 16px;
				}

				.fornax-sentence-input {
					width: 100%;
					min-height: 60px;
					margin: 8px 0;
					padding: 8px;
					border: 1px solid var(--background-modifier-border);
					border-radius: 4px;
					font-family: var(--font-text);
					resize: vertical;
				}

				.fornax-add-alternative {
					background: var(--interactive-accent);
					color: var(--text-on-accent);
					border: none;
					padding: 8px 16px;
					border-radius: 4px;
					cursor: pointer;
				}

				.fornax-alternatives {
					margin-bottom: 16px;
				}

				.fornax-alternative-item {
					display: flex;
					align-items: center;
					gap: 8px;
					padding: 8px;
					margin: 4px 0;
					border-radius: 4px;
					border: 1px solid transparent;
				}

				.fornax-alternative-item.active {
					background: var(--interactive-accent-hover);
					border-color: var(--interactive-accent);
				}

				.fornax-alt-text {
					flex: 1;
					line-height: 1.4;
				}

				.fornax-delete-alt {
					background: var(--background-modifier-error);
					color: var(--text-on-accent);
					border: none;
					border-radius: 50%;
					width: 20px;
					height: 20px;
					cursor: pointer;
					font-size: 14px;
					line-height: 1;
				}

				.fornax-modal-buttons {
					display: flex;
					gap: 8px;
					justify-content: flex-end;
					margin-top: 20px;
				}

				.fornax-modal-buttons button {
					padding: 8px 16px;
					border-radius: 4px;
					border: 1px solid var(--background-modifier-border);
					background: var(--background-primary);
					color: var(--text-normal);
					cursor: pointer;
				}

				.fornax-modal-buttons button.mod-cta {
					background: var(--interactive-accent);
					color: var(--text-on-accent);
					border-color: var(--interactive-accent);
				}

				.fornax-modal-buttons button.fornax-commit-btn {
					background: var(--color-orange);
					color: var(--text-on-accent);
					border-color: var(--color-orange);
					font-weight: bold;
				}
			`;
			document.head.appendChild(style);
		}
	}

	onClose() {
		const style = document.getElementById('fornax-modal-styles');
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
		
		// Create placeholder text for when settings are added in the future
		const placeholder = containerEl.createEl('p', { 
			cls: 'setting-item-description',
			text: 'No settings are currently available. Future configuration options will appear here.'
		});
		placeholder.style.fontStyle = 'italic';
		placeholder.style.color = 'var(--text-muted)';
		placeholder.style.textAlign = 'center';
		placeholder.style.marginTop = '40px';
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
