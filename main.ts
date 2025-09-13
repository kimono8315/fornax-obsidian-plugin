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

export interface Section {
	heading: string;
	level: number; // 2 for ##, 3 for ###
	paragraphs: string[];
	startParagraphIndex: number;
	endParagraphIndex: number;
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
		sections?: Section[]; // Store section structure for document view
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

		// Parse section structure for document view
		const sections = this.parseSectionStructure(rawParagraphs);

		return { paragraphs, sentences, edits, rawParagraphs, sections };
	}

	private parseSectionStructure(rawParagraphs: string[]): Section[] {
		const sections: Section[] = [];
		let currentSection: Section | null = null;

		rawParagraphs.forEach((paragraph, index) => {
			const trimmed = paragraph.trim();

			// Check if this paragraph is a heading (ignore # level 1 headings - they're for titles)
			if (trimmed.startsWith('##') && !trimmed.startsWith('###')) {
				// ## Level 2 heading - start new section
				if (currentSection) {
					currentSection.endParagraphIndex = index - 1;
					sections.push(currentSection);
				}

				currentSection = {
					heading: trimmed.replace(/^##\s*/, ''),
					level: 2,
					paragraphs: [],
					startParagraphIndex: index,
					endParagraphIndex: index
				};
			} else if (trimmed.startsWith('###')) {
				// ### Level 3 heading - add to current section as a special paragraph
				if (currentSection) {
					currentSection.paragraphs.push(paragraph);
				}
			} else if (currentSection) {
				// Regular paragraph - add to current section
				currentSection.paragraphs.push(paragraph);
			}
			// If no current section and it's not a heading, it's content before any sections
		});

		// Don't forget the last section
		if (currentSection) {
			currentSection.endParagraphIndex = rawParagraphs.length - 1;
			sections.push(currentSection);
		}

		return sections;
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
	private targetScrollElement: string | null = null; // For auto-scrolling to specific elements

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

	private setZoomLevel(level: ZoomLevel, targetElement?: string) {
		this.currentZoom = level;
		this.targetScrollElement = targetElement || null;

		// Update button states
		this.controlsEl.querySelectorAll('.fornax-zoom-btn').forEach(btn => {
			btn.removeClass('active');
		});
		this.controlsEl.querySelector(`button:nth-child(${
			level === 'document' ? 1 : level === 'paragraphs' ? 2 : 3
		})`)?.addClass('active');

		this.renderCurrentZoom();
	}

	private scrollToTarget() {
		if (!this.targetScrollElement) return;

		// Give the DOM a moment to render, then scroll
		setTimeout(() => {
			const targetEl = this.contentEl.querySelector(this.targetScrollElement!);
			if (targetEl) {
				targetEl.scrollIntoView({
					behavior: 'smooth',
					block: 'start'
				});
			}
			this.targetScrollElement = null; // Clear after use
		}, 100);
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

		// Scroll to target element if specified
		this.scrollToTarget();
	}

	private renderDocumentView() {
		const docView = this.contentEl.createEl('div', { cls: 'fornax-document-view' });

		// Document overview with paragraph count and structure
		const overview = docView.createEl('div', { cls: 'fornax-overview' });
		overview.createEl('h3', { text: 'Document Structure' });

		const stats = overview.createEl('div', { cls: 'fornax-stats' });

		// Count only non-heading paragraphs for statistics
		const nonHeadingParagraphs = this.currentDocument.paragraphs.filter((para: string) => {
			return !para.trim().startsWith('#');
		});
		stats.createEl('span', {
			cls: 'stat',
			text: `${nonHeadingParagraphs.length} paragraphs`
		});

		// Count only non-heading sentences for statistics
		const totalSentences = this.currentDocument.sentences.reduce((sum: number, para: string[]) => {
			const nonHeadingSentences = para.filter((sentence: string) => !sentence.trim().startsWith('#'));
			return sum + nonHeadingSentences.length;
		}, 0);
		stats.createEl('span', {
			cls: 'stat',
			text: `${totalSentences} sentences`
		});

		// Section blocks
		if (this.currentDocument.sections && this.currentDocument.sections.length > 0) {
			const sectionsContainer = docView.createEl('div', { cls: 'fornax-sections-container' });
			this.renderSectionBlocks(sectionsContainer);
		} else {
			// Fallback: show mini paragraph previews if no sections found
			const miniPreviews = docView.createEl('div', { cls: 'fornax-mini-paragraphs' });
			this.currentDocument.paragraphs.forEach((para: string, i: number) => {
				const miniPara = miniPreviews.createEl('div', {
					cls: 'fornax-mini-paragraph',
					text: para.slice(0, 100) + (para.length > 100 ? '...' : '')
				});

				miniPara.onclick = () => {
					this.setZoomLevel('paragraphs', `[data-para-index="${i}"]`);
				};
			});
		}
	}

	private renderSectionBlocks(container: HTMLElement) {
		if (!this.currentDocument.sections) return;

		this.currentDocument.sections.forEach((section: Section, sectionIndex: number) => {
			const sectionBlock = container.createEl('div', {
				cls: 'fornax-section-block',
				attr: { 'data-section-index': sectionIndex.toString() }
			});

			// Section heading
			const sectionHeader = sectionBlock.createEl('div', { cls: 'fornax-section-header' });
			sectionHeader.createEl('h3', {
				cls: 'fornax-section-title',
				text: section.heading
			});

			// Section content - show preview of each paragraph
			const sectionContent = sectionBlock.createEl('div', { cls: 'fornax-section-content' });

			section.paragraphs.forEach((paragraph: string, paragraphIndex: number) => {
				const cleanParagraph = this.cleanParagraphForPreview(paragraph);

				// Check if this is a ### third-level heading
				if (paragraph.trim().startsWith('###')) {
					const subheading = sectionContent.createEl('div', {
						cls: 'fornax-third-level-heading',
						text: paragraph.trim().replace(/^###\s*/, '')
					});
				} else if (cleanParagraph.trim()) {
					// Regular paragraph - show first sentence
					const sentences = cleanParagraph.split('\n').filter(s => s.trim());
					if (sentences.length > 0) {
						const paragraphPreview = sectionContent.createEl('div', {
							cls: 'fornax-paragraph-preview',
							text: sentences[0].slice(0, 80) + (sentences[0].length > 80 ? '...' : '')
						});
					}
				}
			});

			// Click to zoom to paragraphs view and scroll to this section
			sectionBlock.onclick = () => {
				// Find the first paragraph of this section to scroll to
				const sectionStartIndex = section.startParagraphIndex;
				this.setZoomLevel('paragraphs', `[data-para-index="${sectionStartIndex}"]`);
			};
		});
	}

	private cleanParagraphForPreview(paragraph: string): string {
		// Remove %% %% comments for clean preview display
		const lines = paragraph.split('\n');
		return lines.filter(line => {
			const trimmed = line.trim();
			return trimmed && !(trimmed.startsWith('%%') && trimmed.endsWith('%%'));
		}).join('\n');
	}

	private renderParagraphView() {
		const paraView = this.contentEl.createEl('div', { cls: 'fornax-paragraph-view' });

		console.log('Rendering paragraph view with', this.currentDocument.paragraphs.length, 'paragraphs');

		// Render all paragraphs, including headings
		for (let i = 0; i < this.currentDocument.paragraphs.length; i++) {
			const para = this.currentDocument.paragraphs[i];
			console.log('Creating paragraph', i);

			const isHeading = para.trim().startsWith('#');

			if (isHeading) {
				// Render heading as non-movable block
				const headingBlock = paraView.createEl('div', {
					cls: 'fornax-heading-block',
					attr: { 'data-para-index': i.toString() }
				});

				// Heading content (no drag handle)
				headingBlock.createEl('div', {
					cls: 'fornax-heading-content',
					text: para.trim()
				});
			} else {
				// Check paragraph status for styling
				const hasComments = this.paragraphHasComments(i);
				const isComplete = this.paragraphIsComplete(i);

				// Determine CSS classes based on status
				// Priority: yellow (alternatives) overrides green (complete)
				let cssClasses = 'fornax-paragraph-block';
				if (hasComments) {
					cssClasses += ' fornax-has-alternatives';
				} else if (isComplete) {
					cssClasses += ' fornax-paragraph-complete';
				}

				const paraBlock = paraView.createEl('div', {
					cls: cssClasses,
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

				// Completion toggle button
				const completionBtn = paraBlock.createEl('button', {
					cls: 'fornax-completion-btn',
					text: isComplete ? '✅' : '☐'
				});
				completionBtn.title = isComplete ? 'Mark as incomplete' : 'Mark as complete';
				completionBtn.onclick = (e) => {
					e.stopPropagation(); // Prevent zoom action
					this.toggleParagraphCompletion(i);
				};

				// Click to zoom into sentences and scroll to this paragraph
				content.onclick = () => {
					const paragraphNumber = this.getParagraphDisplayNumber(i);
					if (paragraphNumber > 0) {
						this.setZoomLevel('sentences', `[data-paragraph-number="${paragraphNumber}"]`);
					} else {
						this.setZoomLevel('sentences');
					}
				};

				console.log('About to call makeDraggable for paragraph', i);

				this.makeDraggable(paraBlock, 'paragraph');
			}
		}
	}

	private getParagraphDisplayNumber(paragraphIndex: number): number {
		// Calculate the display number for this paragraph (excluding headings)
		const targetParagraph = this.currentDocument.paragraphs[paragraphIndex];
		if (targetParagraph.trim().startsWith('#')) {
			return 0; // Headings don't get paragraph numbers
		}

		let displayNumber = 0;
		for (let i = 0; i <= paragraphIndex; i++) {
			const paragraph = this.currentDocument.paragraphs[i];
			if (!paragraph.trim().startsWith('#')) {
				displayNumber++;
			}
		}
		return displayNumber;
	}

	private renderSentenceView() {
		const sentView = this.contentEl.createEl('div', { cls: 'fornax-sentence-view' });

		let paragraphCounter = 1;

		this.currentDocument.sentences.forEach((sentences: string[], paraIndex: number) => {
			// Check if this paragraph contains only headings
			const hasNonHeadingContent = sentences.some(sentence => !sentence.trim().startsWith('#'));

			if (hasNonHeadingContent) {
				// Only show paragraph header for paragraphs with actual content
				const paraHeader = sentView.createEl('div', {
					cls: 'fornax-paragraph-header',
					text: `Paragraph ${paragraphCounter}`,
					attr: { 'data-paragraph-number': paragraphCounter.toString() }
				});
				paragraphCounter++;
			}

			// Sentence blocks within this paragraph
			const sentenceContainer = sentView.createEl('div', { cls: 'fornax-sentence-container' });

			sentences.forEach((sentence: string, sentIndex: number) => {
				const isHeading = sentence.trim().startsWith('#');

				if (isHeading) {
					// Render heading as non-movable block (no paragraph header above it)
					const headingBlock = sentenceContainer.createEl('div', {
						cls: 'fornax-heading-block',
						attr: {
							'data-para-index': paraIndex.toString(),
							'data-sent-index': sentIndex.toString()
						}
					});

					// Heading content (no drag handle, no edit button)
					headingBlock.createEl('div', {
						cls: 'fornax-heading-content',
						text: sentence.trim()
					});
				} else {
					// Check if this sentence has alternatives
					const hasAlternatives = this.sentenceHasAlternatives(paraIndex, sentIndex);
					const alternativesData = this.getSentenceAlternatives(paraIndex, sentIndex);

					const sentBlock = sentenceContainer.createEl('div', {
						cls: `fornax-sentence-block ${hasAlternatives ? 'fornax-has-alternatives' : ''}`,
						attr: {
							'data-para-index': paraIndex.toString(),
							'data-sent-index': sentIndex.toString()
						}
					});

					// Drag handle
					sentBlock.createEl('div', { cls: 'fornax-drag-handle', text: '::' });

					// Main sentence row with current content and buttons
					const sentenceRow = sentBlock.createEl('div', { cls: 'fornax-sentence-row' });

					// Sentence content (current active sentence)
					const content = sentenceRow.createEl('div', {
						cls: 'fornax-sentence-content',
						text: sentence
					});

					// Add button (for adding new alternatives)
					const addBtn = sentenceRow.createEl('button', {
						cls: 'fornax-add-alternative-btn',
						text: '+'
					});

					addBtn.onclick = () => this.showAddAlternativeInput(sentBlock, paraIndex, sentIndex);

					// Save/check button (only if there are alternatives to commit)
					if (hasAlternatives) {
						const saveBtn = sentenceRow.createEl('button', {
							cls: 'fornax-save-final-btn',
							text: '✓'
						});

						saveBtn.onclick = () => this.commitSentenceChoice(paraIndex, sentIndex);
					}

					// Always show alternatives if they exist (no expand/collapse)
					if (hasAlternatives) {
						this.showSentenceAlternatives(sentBlock, paraIndex, sentIndex);
					}

					this.makeDraggable(sentBlock, 'sentence');
				}
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
				await this.insertElement(draggedElement, dropInfo.target, dropInfo.position, type, dropInfo.isHeading);
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

		// Find all potential drop targets (both content blocks and headings)
		const contentTargets = this.contentEl.querySelectorAll(
			type === 'paragraph' ? '.fornax-paragraph-block' : '.fornax-sentence-block'
		);
		const headingTargets = this.contentEl.querySelectorAll('.fornax-heading-block');
		const allTargets = [...Array.from(contentTargets), ...Array.from(headingTargets)];

		allTargets.forEach(target => {
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

	private findDropTarget(e: MouseEvent, draggedElement: HTMLElement, type: 'paragraph' | 'sentence'): { target: HTMLElement, position: 'before' | 'after', isHeading?: boolean } | null {
		// Find all potential drop targets (both content blocks and headings)
		const contentTargets = this.contentEl.querySelectorAll(
			type === 'paragraph' ? '.fornax-paragraph-block' : '.fornax-sentence-block'
		);
		const headingTargets = this.contentEl.querySelectorAll('.fornax-heading-block');
		const allTargets = [...Array.from(contentTargets), ...Array.from(headingTargets)];

		for (let i = 0; i < allTargets.length; i++) {
			const target = allTargets[i] as HTMLElement;
			if (target === draggedElement) continue;

			const rect = target.getBoundingClientRect();
			const mouseY = e.clientY;

			if (mouseY >= rect.top && mouseY <= rect.bottom) {
				// Determine if we're inserting before or after based on mouse position within the element
				const middleY = rect.top + rect.height / 2;
				const position = mouseY < middleY ? 'before' : 'after';
				const isHeading = target.classList.contains('fornax-heading-block');

				return { target, position, isHeading };
			}
		}

		return null;
	}

	private clearDropTargets(type: 'paragraph' | 'sentence') {
		// Clear highlights from both content blocks and headings
		const contentTargets = this.contentEl.querySelectorAll(
			type === 'paragraph' ? '.fornax-paragraph-block' : '.fornax-sentence-block'
		);
		const headingTargets = this.contentEl.querySelectorAll('.fornax-heading-block');
		const allTargets = [...Array.from(contentTargets), ...Array.from(headingTargets)];

		allTargets.forEach(target => {
			target.removeClass('fornax-drop-target');
			target.removeClass('fornax-drop-before');
			target.removeClass('fornax-drop-after');
		});
	}

	private async insertElement(draggedElement: HTMLElement, dropTarget: HTMLElement, position: 'before' | 'after', type: 'paragraph' | 'sentence', isHeadingTarget: boolean = false) {
		if (type === 'paragraph') {
			const draggedIndex = parseInt(draggedElement.getAttribute('data-para-index') || '0');
			let dropIndex = parseInt(dropTarget.getAttribute('data-para-index') || '0');

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

			// Special handling for heading targets
			if (isHeadingTarget) {
				// When dropping relative to a heading, we need to be more careful about positioning
				if (position === 'before') {
					// Insert before the heading - no adjustment needed
					insertIndex = dropIndex;
				} else {
					// Insert after the heading - position after the heading
					insertIndex = dropIndex + 1;
				}
			} else {
				// Regular paragraph target handling
				// Adjust for the removal if dragged was before the drop target
				if (draggedIndex < dropIndex) {
					insertIndex = dropIndex - 1;
				}

				// Adjust for before/after position
				if (position === 'after') {
					insertIndex += 1;
				}
			}

			// Adjust for removal shift if needed
			if (!isHeadingTarget && draggedIndex < dropIndex) {
				insertIndex = Math.max(0, insertIndex);
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
			let dropParaIndex = parseInt(dropTarget.getAttribute('data-para-index') || '0');
			let dropSentIndex = parseInt(dropTarget.getAttribute('data-sent-index') || '0');

			// Special handling for heading targets in sentence view
			if (isHeadingTarget && position === 'after') {
				// When dropping AFTER a heading, we want to create a new paragraph
				// Extract the complete sentence block (including all alternatives/comments)
				const draggedSentence = this.currentDocument.sentences[draggedParaIndex][draggedSentIndex];
				let draggedSentenceBlock = [draggedSentence]; // Default to just the sentence

				// Extract the complete sentence block from raw paragraphs (including comments)
				if (this.currentDocument.rawParagraphs) {
					const extractedBlock = this.extractSentenceBlock(this.currentDocument.rawParagraphs[draggedParaIndex], draggedSentIndex);
					if (extractedBlock.length > 0) {
						draggedSentenceBlock = extractedBlock;
					}

					// Remove the complete block from source paragraph
					const updatedSourceParagraph = this.removeSentenceBlock(this.currentDocument.rawParagraphs[draggedParaIndex], draggedSentIndex);
					this.currentDocument.rawParagraphs[draggedParaIndex] = updatedSourceParagraph;
				}

				// Remove from sentences array
				this.currentDocument.sentences[draggedParaIndex].splice(draggedSentIndex, 1);

				// Create a new paragraph after the target heading's paragraph
				const insertParaIndex = dropParaIndex + 1;

				// Insert new paragraph with the complete sentence block
				this.currentDocument.sentences.splice(insertParaIndex, 0, [draggedSentence]);

				// Insert new paragraph in raw paragraphs array with complete block
				if (this.currentDocument.rawParagraphs) {
					const newRawParagraph = draggedSentenceBlock.join('\n');
					this.currentDocument.rawParagraphs.splice(insertParaIndex, 0, newRawParagraph);
				}

				// Update clean paragraphs array
				this.currentDocument.paragraphs.splice(insertParaIndex, 0, draggedSentence);

				// Re-sync the data structures to ensure consistency
				this.syncFromRawParagraphs();

				// Save and re-render
				await this.saveChangesToFile();
				this.renderCurrentZoom();
				return; // Exit early, we've handled this case
			} else if (isHeadingTarget) {
				// Before heading - normal insertion logic
				if (position === 'before') {
					dropSentIndex = dropSentIndex;
				}
			}
			
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

	private sentenceHasAlternatives(paraIndex: number, sentIndex: number): boolean {
		// Check if a sentence has alternatives stored in comments
		if (!this.currentDocument.rawParagraphs || paraIndex >= this.currentDocument.rawParagraphs.length) {
			return false;
		}

		const paragraph = this.currentDocument.rawParagraphs[paraIndex];
		const lines = paragraph.split('\n');
		let sentenceLineIndex = -1;
		let nonCommentLineCount = 0;

		// Find the sentence line
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line && !(line.startsWith('%%') && line.endsWith('%%'))) {
				if (nonCommentLineCount === sentIndex) {
					sentenceLineIndex = i;
					break;
				}
				nonCommentLineCount++;
			}
		}

		if (sentenceLineIndex === -1) return false;

		// Check for alternatives immediately following the sentence
		for (let i = sentenceLineIndex + 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line.startsWith('%%') && line.endsWith('%%')) {
				const commentContent = line.slice(2, -2).trim();
				// If we find any comment that's not just SELECTED, there are alternatives
				if (!commentContent.startsWith('SELECTED:')) {
					return true;
				}
			} else if (line) {
				// Hit next sentence, stop looking
				break;
			}
		}

		return false;
	}

	private getSentenceAlternatives(paraIndex: number, sentIndex: number): { alternatives: string[], selectedIndex: number, original: string } {
		// Get sentence alternatives with selection information
		if (!this.currentDocument.rawParagraphs || paraIndex >= this.currentDocument.rawParagraphs.length) {
			return { alternatives: [], selectedIndex: -1, original: '' };
		}

		const paragraph = this.currentDocument.rawParagraphs[paraIndex];
		const lines = paragraph.split('\n');
		let sentenceLineIndex = -1;
		let nonCommentLineCount = 0;

		// Find the sentence line
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line && !(line.startsWith('%%') && line.endsWith('%%'))) {
				if (nonCommentLineCount === sentIndex) {
					sentenceLineIndex = i;
					break;
				}
				nonCommentLineCount++;
			}
		}

		if (sentenceLineIndex === -1) {
			return { alternatives: [], selectedIndex: -1, original: '' };
		}

		const alternatives: string[] = [];
		let selectedIndex = -1;
		let foundOriginal = '';
		const currentSentence = lines[sentenceLineIndex].trim();

		// Look for alternatives and original immediately following the sentence
		for (let i = sentenceLineIndex + 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line.startsWith('%%') && line.endsWith('%%')) {
				const commentContent = line.slice(2, -2).trim();
				if (commentContent.startsWith('SELECTED:')) {
					selectedIndex = parseInt(commentContent.split(':')[1]);
				} else if (commentContent.startsWith('ORIGINAL:')) {
					foundOriginal = commentContent.slice(9).trim(); // Remove "ORIGINAL: "
				} else {
					alternatives.push(commentContent);
				}
			} else if (line) {
				// Hit next sentence, stop looking
				break;
			}
		}

		// If we found an original, the current sentence is a selected alternative
		const original = foundOriginal || currentSentence;

		return { alternatives, selectedIndex, original };
	}

	private paragraphHasComments(paraIndex: number): boolean {
		// Check if a paragraph contains any %% %% comments (excluding PARAGRAPH_COMPLETE)
		if (!this.currentDocument.rawParagraphs || paraIndex >= this.currentDocument.rawParagraphs.length) {
			return false;
		}

		const paragraph = this.currentDocument.rawParagraphs[paraIndex];
		const lines = paragraph.split('\n');
		
		// Look for any %% %% comment lines that are NOT PARAGRAPH_COMPLETE
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith('%%') && trimmed.endsWith('%%')) {
				const commentContent = trimmed.slice(2, -2).trim();
				// Ignore PARAGRAPH_COMPLETE comments, only count alternatives
				if (commentContent !== 'PARAGRAPH_COMPLETE') {
					return true;
				}
			}
		}
		
		return false;
	}

	private paragraphIsComplete(paraIndex: number): boolean {
		// Check if a paragraph is marked as complete with PARAGRAPH_COMPLETE comment
		if (!this.currentDocument.rawParagraphs || paraIndex >= this.currentDocument.rawParagraphs.length) {
			return false;
		}

		const paragraph = this.currentDocument.rawParagraphs[paraIndex];
		const lines = paragraph.split('\n');
		
		// Look for PARAGRAPH_COMPLETE comment anywhere in the paragraph
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith('%%') && trimmed.endsWith('%%')) {
				const commentContent = trimmed.slice(2, -2).trim();
				if (commentContent === 'PARAGRAPH_COMPLETE') {
					return true;
				}
			}
		}
		
		return false;
	}

	private async toggleParagraphCompletion(paraIndex: number) {
		// Toggle the completion status of a paragraph
		if (!this.currentDocument.rawParagraphs || paraIndex >= this.currentDocument.rawParagraphs.length) {
			return;
		}

		// Check if this paragraph has alternatives - if so, block completion and remove any existing completion markers
		const hasAlternatives = this.paragraphHasComments(paraIndex);
		
		const paragraph = this.currentDocument.rawParagraphs[paraIndex];
		const lines = paragraph.split('\n');
		let hasCompletionComment = false;
		let newLines: string[] = [];

		// Remove existing PARAGRAPH_COMPLETE comment if found
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith('%%') && trimmed.endsWith('%%')) {
				const commentContent = trimmed.slice(2, -2).trim();
				if (commentContent === 'PARAGRAPH_COMPLETE') {
					hasCompletionComment = true;
					continue; // Skip this line (remove it)
				}
			}
			newLines.push(line);
		}

		// If paragraph has alternatives, don't allow completion (only remove existing markers)
		if (hasAlternatives) {
			// Don't add completion marker, just remove any existing ones
		} else {
			// If wasn't complete and no alternatives, add completion comment at the beginning
			if (!hasCompletionComment) {
				newLines.unshift('%% PARAGRAPH_COMPLETE %%');
			}
		}

		// Update the raw paragraph
		this.currentDocument.rawParagraphs[paraIndex] = newLines.join('\n');
		
		// Re-sync the clean data structures
		this.syncFromRawParagraphs();
		
		// Save changes to file
		await this.saveChangesToFile();
		
		// Re-render to show the change
		this.renderCurrentZoom();
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
			return this.ensureProperHeadingSpacing(this.currentDocument.rawParagraphs.join('\n\n'));
		}

		// Fallback: reconstruct from clean sentences (for backwards compatibility)
		const paragraphsWithLines = this.currentDocument.sentences.map((sentenceArray: string[]) => {
			return sentenceArray.join('\n');
		});

		return this.ensureProperHeadingSpacing(paragraphsWithLines.join('\n\n'));
	}

	private ensureProperHeadingSpacing(content: string): string {
		// Ensure proper spacing around headings - headings should have blank lines before and after
		return content
			// Fix spacing before headings: ensure there's a blank line before any heading that follows content
			.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2')
			// Fix spacing after headings: ensure there's a blank line after any heading that's followed by content
			.replace(/(#{1,6}\s[^\n]*)\n([^#\n])/g, '$1\n\n$2')
			// Clean up multiple consecutive blank lines (more than 2 newlines becomes exactly 2)
			.replace(/\n{3,}/g, '\n\n');
	}

	private openSentenceEditor(paraIndex: number, sentIndex: number, sentence: string) {
		// Create modal for sentence editing
		const modal = new SentenceEditModal(this.plugin.app, sentence, paraIndex, sentIndex, this);
		modal.open();
	}


	private showSentenceAlternatives(sentBlock: HTMLElement, paraIndex: number, sentIndex: number) {
		const alternativesData = this.getSentenceAlternatives(paraIndex, sentIndex);
		const { alternatives, selectedIndex, original } = alternativesData;

		// Create alternatives container
		const alternativesContainer = sentBlock.createEl('div', { cls: 'fornax-alternatives-container' });

		// Show original sentence first (if different from current)
		const currentSentence = this.currentDocument.sentences[paraIndex][sentIndex];
		if (original && original !== currentSentence) {
			const originalItem = this.createAlternativeItem(alternativesContainer, original, paraIndex, sentIndex, -1, selectedIndex === -1);
			originalItem.addClass('fornax-original-sentence');
		}

		// Show all alternatives
		alternatives.forEach((alternative, altIndex) => {
			this.createAlternativeItem(alternativesContainer, alternative, paraIndex, sentIndex, altIndex, selectedIndex === altIndex);
		});
	}

	private createAlternativeItem(container: HTMLElement, text: string, paraIndex: number, sentIndex: number, altIndex: number, isSelected: boolean): HTMLElement {
		const item = container.createEl('div', { cls: 'fornax-alternative-item' });

		// Radio button for selection
		const radio = item.createEl('input', {
			type: 'radio',
			cls: 'fornax-alternative-radio',
			attr: {
				name: `sentence-${paraIndex}-${sentIndex}`,
				value: altIndex.toString()
			}
		});

		if (isSelected) {
			radio.checked = true;
		}

		radio.onchange = () => this.selectSentenceAlternative(paraIndex, sentIndex, altIndex);

		// Alternative text
		const textEl = item.createEl('div', {
			cls: 'fornax-alternative-text',
			text: text
		});

		// Delete button (except for original)
		if (altIndex >= 0) {
			const deleteBtn = item.createEl('button', {
				cls: 'fornax-delete-alternative-btn',
				text: '×'
			});

			deleteBtn.onclick = () => this.deleteAlternative(paraIndex, sentIndex, altIndex);
		}

		return item;
	}

	private showAddAlternativeInput(sentBlock: HTMLElement, paraIndex: number, sentIndex: number) {
		// Check if input already exists
		const existingInput = sentBlock.querySelector('.fornax-add-input');
		if (existingInput) return;

		const sentenceRow = sentBlock.querySelector('.fornax-sentence-row');
		const inputContainer = sentBlock.createEl('div', { cls: 'fornax-add-input' });

		const textArea = inputContainer.createEl('textarea', {
			cls: 'fornax-alternative-input',
			attr: { placeholder: 'Enter new alternative...' }
		});

		const buttonContainer = inputContainer.createEl('div', { cls: 'fornax-input-buttons' });

		const saveBtn = buttonContainer.createEl('button', {
			cls: 'fornax-save-alternative-btn',
			text: 'Save'
		});

		const cancelBtn = buttonContainer.createEl('button', {
			cls: 'fornax-cancel-alternative-btn',
			text: 'Cancel'
		});

		saveBtn.onclick = () => this.saveNewAlternative(paraIndex, sentIndex, textArea.value, sentBlock);
		cancelBtn.onclick = () => inputContainer.remove();

		textArea.focus();
	}

	private async commitSentenceChoice(paraIndex: number, sentIndex: number) {
		// Finalize the current sentence choice and remove all alternative comments
		if (!this.currentDocument.rawParagraphs) return;

		const paragraph = this.currentDocument.rawParagraphs[paraIndex];
		const lines = paragraph.split('\n');
		let sentenceLineIndex = -1;
		let nonCommentLineCount = 0;

		// Find the sentence line
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line && !(line.startsWith('%%') && line.endsWith('%%'))) {
				if (nonCommentLineCount === sentIndex) {
					sentenceLineIndex = i;
					break;
				}
				nonCommentLineCount++;
			}
		}

		if (sentenceLineIndex === -1) return;

		// Remove all alternative comments following this sentence
		const indicesToRemove: number[] = [];
		for (let i = sentenceLineIndex + 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line.startsWith('%%') && line.endsWith('%%')) {
				const commentContent = line.slice(2, -2).trim();
				// Remove ORIGINAL, SELECTED, and alternative comments
				if (commentContent.startsWith('ORIGINAL:') ||
					commentContent.startsWith('SELECTED:') ||
					(!commentContent.startsWith('PARAGRAPH_COMPLETE') && commentContent !== 'PARAGRAPH_COMPLETE')) {
					indicesToRemove.push(i);
				}
			} else if (line) {
				// Hit next sentence, stop looking
				break;
			}
		}

		// Remove comments in reverse order to maintain indices
		for (let i = indicesToRemove.length - 1; i >= 0; i--) {
			lines.splice(indicesToRemove[i], 1);
		}

		// Update the paragraph
		this.currentDocument.rawParagraphs[paraIndex] = lines.join('\n');

		// Sync changes and save
		this.syncFromRawParagraphs();
		await this.saveChangesToFile();

		// Re-render to show updated content (sentence should no longer show alternatives)
		this.renderCurrentZoom();
	}

	private async selectSentenceAlternative(paraIndex: number, sentIndex: number, altIndex: number) {
		// Select a different alternative for this sentence
		const alternativesData = this.getSentenceAlternatives(paraIndex, sentIndex);
		const { alternatives, original } = alternativesData;

		if (!this.currentDocument.rawParagraphs) return;

		let newSentenceText = '';
		if (altIndex === -1) {
			// Selecting original
			newSentenceText = original;
		} else if (altIndex < alternatives.length) {
			// Selecting an alternative
			newSentenceText = alternatives[altIndex];
		}

		if (!newSentenceText) return;

		// Update the sentence in raw paragraphs while preserving comment structure
		const paragraph = this.currentDocument.rawParagraphs[paraIndex];
		const lines = paragraph.split('\n');
		let sentenceLineIndex = -1;
		let nonCommentLineCount = 0;

		// Find the sentence line
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line && !(line.startsWith('%%') && line.endsWith('%%'))) {
				if (nonCommentLineCount === sentIndex) {
					sentenceLineIndex = i;
					break;
				}
				nonCommentLineCount++;
			}
		}

		if (sentenceLineIndex !== -1) {
			const originalLine = lines[sentenceLineIndex];
			const leadingSpaces = originalLine.match(/^\s*/)?.[0] || '';
			const currentSentenceText = originalLine.trim();

			// Check if we need to preserve the original sentence
			let originalCommentExists = false;
			let selectedCommentFound = false;
			let selectedCommentIndex = -1;

			// Check existing comments to see if ORIGINAL already exists
			for (let i = sentenceLineIndex + 1; i < lines.length; i++) {
				const line = lines[i].trim();
				if (line.startsWith('%%') && line.endsWith('%%')) {
					const commentContent = line.slice(2, -2).trim();
					if (commentContent.startsWith('ORIGINAL:')) {
						originalCommentExists = true;
					} else if (commentContent.startsWith('SELECTED:')) {
						selectedCommentFound = true;
						selectedCommentIndex = i;
					}
				} else if (line) {
					// Hit next sentence, stop looking
					break;
				}
			}

			// If this is the first time selecting an alternative and no ORIGINAL comment exists,
			// we need to preserve the current sentence as the original
			if (!originalCommentExists && altIndex !== -1) {
				// Insert ORIGINAL comment after the sentence
				const commentIndent = leadingSpaces;
				lines.splice(sentenceLineIndex + 1, 0, `${commentIndent}%% ORIGINAL: ${currentSentenceText} %%`);

				// Adjust selectedCommentIndex if it existed
				if (selectedCommentIndex !== -1) {
					selectedCommentIndex++;
				}
			}

			// Replace the sentence text with the selected alternative/original
			lines[sentenceLineIndex] = leadingSpaces + newSentenceText;

			// Update or add SELECTED comment
			if (selectedCommentFound && selectedCommentIndex !== -1) {
				// Update existing SELECTED comment
				const commentLeadingSpaces = lines[selectedCommentIndex].match(/^\s*/)?.[0] || '';
				lines[selectedCommentIndex] = `${commentLeadingSpaces}%% SELECTED:${altIndex} %%`;
			} else if (altIndex !== -1) {
				// Add new SELECTED comment
				const commentIndent = leadingSpaces;
				const insertIndex = originalCommentExists ? sentenceLineIndex + 2 : sentenceLineIndex + 1;
				lines.splice(insertIndex, 0, `${commentIndent}%% SELECTED:${altIndex} %%`);
			}

			// If selecting original (altIndex === -1), remove SELECTED comment
			if (altIndex === -1 && selectedCommentFound && selectedCommentIndex !== -1) {
				lines.splice(selectedCommentIndex, 1);
			}

			// Update the paragraph
			this.currentDocument.rawParagraphs[paraIndex] = lines.join('\n');

			// Sync changes and save
			this.syncFromRawParagraphs();
			await this.saveChangesToFile();

			// Re-render to show updated content
			this.renderCurrentZoom();
		}
	}

	private async deleteAlternative(paraIndex: number, sentIndex: number, altIndex: number) {
		// Delete a specific alternative
		if (!this.currentDocument.rawParagraphs || altIndex < 0) return;

		const paragraph = this.currentDocument.rawParagraphs[paraIndex];
		const lines = paragraph.split('\n');
		let sentenceLineIndex = -1;
		let nonCommentLineCount = 0;

		// Find the sentence line
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line && !(line.startsWith('%%') && line.endsWith('%%'))) {
				if (nonCommentLineCount === sentIndex) {
					sentenceLineIndex = i;
					break;
				}
				nonCommentLineCount++;
			}
		}

		if (sentenceLineIndex === -1) return;

		// Find and remove the alternative comment
		let currentAltIndex = 0;
		for (let i = sentenceLineIndex + 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line.startsWith('%%') && line.endsWith('%%')) {
				const commentContent = line.slice(2, -2).trim();
				if (!commentContent.startsWith('SELECTED:') && !commentContent.startsWith('ORIGINAL:')) {
					// This is an alternative
					if (currentAltIndex === altIndex) {
						// Remove this line
						lines.splice(i, 1);
						break;
					}
					currentAltIndex++;
				}
			} else if (line) {
				// Hit next sentence, stop looking
				break;
			}
		}

		// Update the paragraph
		this.currentDocument.rawParagraphs[paraIndex] = lines.join('\n');

		// Sync changes and save
		this.syncFromRawParagraphs();
		await this.saveChangesToFile();

		// Re-render to show updated content
		this.renderCurrentZoom();
	}

	private async saveNewAlternative(paraIndex: number, sentIndex: number, newText: string, sentBlock: HTMLElement) {
		// Save a new alternative for this sentence
		if (!newText.trim() || !this.currentDocument.rawParagraphs) return;

		const paragraph = this.currentDocument.rawParagraphs[paraIndex];
		const lines = paragraph.split('\n');
		let sentenceLineIndex = -1;
		let nonCommentLineCount = 0;

		// Find the sentence line
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line && !(line.startsWith('%%') && line.endsWith('%%'))) {
				if (nonCommentLineCount === sentIndex) {
					sentenceLineIndex = i;
					break;
				}
				nonCommentLineCount++;
			}
		}

		if (sentenceLineIndex === -1) return;

		// Find where to insert the new alternative (after existing alternatives)
		let insertIndex = sentenceLineIndex + 1;
		for (let i = sentenceLineIndex + 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line.startsWith('%%') && line.endsWith('%%')) {
				insertIndex = i + 1;
			} else if (line) {
				// Hit next sentence, stop looking
				break;
			}
		}

		// Insert the new alternative
		const commentIndent = lines[sentenceLineIndex].match(/^\s*/)?.[0] || '';
		lines.splice(insertIndex, 0, `${commentIndent}%% ${newText.trim()} %%`);

		// Update the paragraph
		this.currentDocument.rawParagraphs[paraIndex] = lines.join('\n');

		// Sync changes and save
		this.syncFromRawParagraphs();
		await this.saveChangesToFile();

		// Remove the input container
		const inputContainer = sentBlock.querySelector('.fornax-add-input');
		if (inputContainer) {
			inputContainer.remove();
		}

		// Re-render to show updated content
		this.renderCurrentZoom();
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

				.fornax-completion-btn {
					position: absolute;
					bottom: 8px;
					right: 8px;
					background: none;
					border: none;
					cursor: pointer;
					font-size: 14px;
					opacity: 0.7;
					transition: opacity 0.2s ease;
					padding: 2px 4px;
				}

				.fornax-paragraph-block:hover .fornax-completion-btn {
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

				.fornax-sections-container {
					display: grid;
					gap: 16px;
					margin-top: 16px;
				}

				.fornax-section-block {
					background: var(--background-secondary);
					border: 1px solid var(--background-modifier-border);
					border-radius: 8px;
					padding: 16px;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.fornax-section-block:hover {
					border-color: var(--interactive-accent);
					box-shadow: 0 2px 8px var(--background-modifier-box-shadow);
				}

				.fornax-section-header {
					border-bottom: 1px solid var(--background-modifier-border);
					margin-bottom: 12px;
					padding-bottom: 8px;
				}

				.fornax-section-title {
					margin: 0;
					color: var(--text-accent);
					font-size: 16px;
					font-weight: 600;
				}

				.fornax-section-content {
					display: flex;
					flex-direction: column;
					gap: 6px;
				}

				.fornax-paragraph-preview {
					color: var(--text-muted);
					font-size: 14px;
					line-height: 1.4;
					padding: 4px 0;
					border-left: 2px solid transparent;
					padding-left: 8px;
				}

				.fornax-third-level-heading {
					color: var(--text-normal);
					font-weight: 500;
					font-size: 14px;
					background: var(--background-primary);
					padding: 4px 8px;
					border-radius: 3px;
					border-left: 2px solid var(--text-accent);
					font-style: italic;
					opacity: 0.9;
				}

				.fornax-heading-block {
					position: relative;
					margin: 12px 0;
					padding: 12px 16px;
					background: var(--background-secondary);
					border: 1px solid var(--background-modifier-border);
					border-radius: 6px;
					opacity: 0.6;
					cursor: default;
				}

				.fornax-heading-content {
					color: var(--text-muted);
					font-weight: 600;
					line-height: 1.4;
					pointer-events: none;
					user-select: none;
				}

				.fornax-heading-block.fornax-drop-target {
					border-color: var(--interactive-accent) !important;
					background: rgba(var(--interactive-accent-rgb, 0, 122, 255), 0.1) !important;
					opacity: 1 !important;
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

				.fornax-has-alternatives {
					background: rgba(255, 235, 59, 0.15) !important;
					border-left: 3px solid #ffc107 !important;
				}

				.fornax-paragraph-block.fornax-has-alternatives {
					background: rgba(255, 235, 59, 0.1) !important;
					border-left: 3px solid #ffc107 !important;
				}

				.fornax-sentence-block.fornax-has-alternatives {
					background: rgba(255, 235, 59, 0.2) !important;
					border-left: 3px solid #ffc107 !important;
				}

				.fornax-paragraph-complete {
					background: rgba(76, 175, 80, 0.1) !important;
					border-left: 3px solid #4caf50 !important;
				}

				.fornax-paragraph-block.fornax-paragraph-complete {
					background: rgba(76, 175, 80, 0.15) !important;
					border-left: 3px solid #4caf50 !important;
				}

				/* Inline sentence alternatives styling */
				.fornax-sentence-row {
					display: flex;
					align-items: center;
					gap: 8px;
					flex-wrap: wrap;
				}

				.fornax-sentence-content {
					flex: 1;
					min-width: 0;
				}

				.fornax-add-alternative-btn, .fornax-save-final-btn {
					background: none;
					border: 1px solid var(--background-modifier-border);
					border-radius: 3px;
					padding: 2px 6px;
					font-size: 11px;
					color: var(--text-muted);
					cursor: pointer;
					opacity: 0.7;
					transition: opacity 0.2s ease;
				}

				.fornax-add-alternative-btn:hover, .fornax-save-final-btn:hover {
					opacity: 1;
					background: var(--background-modifier-hover);
				}

				.fornax-save-final-btn {
					color: var(--color-green);
					border-color: var(--color-green);
				}

				.fornax-save-final-btn:hover {
					background: rgba(76, 175, 80, 0.1);
				}

				.fornax-alternatives-container {
					margin-top: 8px;
					padding: 8px;
					background: var(--background-secondary);
					border-radius: 4px;
					border: 1px solid var(--background-modifier-border);
				}

				.fornax-alternative-item {
					display: flex;
					align-items: flex-start;
					gap: 8px;
					margin-bottom: 6px;
					padding: 4px;
					border-radius: 3px;
				}

				.fornax-alternative-item:last-child {
					margin-bottom: 0;
				}

				.fornax-alternative-item:hover {
					background: var(--background-modifier-hover);
				}

				.fornax-alternative-radio {
					margin-top: 2px;
					cursor: pointer;
				}

				.fornax-alternative-text {
					flex: 1;
					font-size: 13px;
					line-height: 1.4;
					word-wrap: break-word;
				}

				.fornax-original-sentence .fornax-alternative-text {
					font-style: italic;
					color: var(--text-muted);
				}

				.fornax-delete-alternative-btn {
					background: none;
					border: none;
					color: var(--text-error);
					cursor: pointer;
					font-size: 16px;
					line-height: 1;
					padding: 0;
					width: 20px;
					height: 20px;
					display: flex;
					align-items: center;
					justify-content: center;
					border-radius: 2px;
					opacity: 0.6;
					transition: opacity 0.2s ease;
				}

				.fornax-delete-alternative-btn:hover {
					opacity: 1;
					background: var(--background-modifier-error-hover);
				}

				.fornax-add-input {
					margin-top: 8px;
					padding: 8px;
					background: var(--background-secondary);
					border-radius: 4px;
					border: 1px solid var(--background-modifier-border);
				}

				.fornax-alternative-input {
					width: 100%;
					min-height: 60px;
					resize: vertical;
					padding: 8px;
					border: 1px solid var(--background-modifier-border);
					border-radius: 3px;
					background: var(--background-primary);
					color: var(--text-normal);
					font-family: inherit;
					font-size: 13px;
					line-height: 1.4;
				}

				.fornax-alternative-input:focus {
					outline: none;
					border-color: var(--interactive-accent);
				}

				.fornax-input-buttons {
					display: flex;
					gap: 8px;
					margin-top: 8px;
					justify-content: flex-end;
				}

				.fornax-save-alternative-btn, .fornax-cancel-alternative-btn {
					padding: 4px 12px;
					border: 1px solid var(--background-modifier-border);
					border-radius: 3px;
					background: var(--background-primary);
					color: var(--text-normal);
					cursor: pointer;
					font-size: 12px;
				}

				.fornax-save-alternative-btn {
					background: var(--interactive-accent);
					color: var(--text-on-accent);
					border-color: var(--interactive-accent);
				}

				.fornax-save-alternative-btn:hover {
					background: var(--interactive-accent-hover);
				}

				.fornax-cancel-alternative-btn:hover {
					background: var(--background-modifier-hover);
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

	async display(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Fornax Settings' });
		
		// Load and display README.md content
		await this.loadReadme(containerEl);
	}

	private async loadReadme(containerEl: HTMLElement): Promise<void> {
		try {
			// Try to find README.md in the plugin directory
			const readmeFile = this.app.vault.getAbstractFileByPath('README.md');
			
			if (readmeFile && readmeFile instanceof this.app.vault.adapter.constructor) {
				// If README.md exists, read and display it
				const readmeContent = await this.app.vault.read(readmeFile as any);
				this.renderMarkdown(containerEl, readmeContent);
			} else {
				// Fallback: show default documentation
				this.showFallbackDocumentation(containerEl);
			}
		} catch (error) {
			console.log('Could not load README.md, showing fallback documentation');
			this.showFallbackDocumentation(containerEl);
		}
	}

	private renderMarkdown(containerEl: HTMLElement, markdown: string): void {
		// Create a container for the README content
		const readmeContainer = containerEl.createEl('div', { 
			cls: 'fornax-readme-container'
		});
		
		// Use Obsidian's markdown renderer
		this.app.vault.adapter.read('README.md').then(content => {
			// Simple markdown-to-HTML conversion for basic formatting
			const htmlContent = this.convertMarkdownToHtml(content);
			readmeContainer.innerHTML = htmlContent;
		}).catch(() => {
			this.showFallbackDocumentation(containerEl);
		});
	}

	private convertMarkdownToHtml(markdown: string): string {
		// Basic markdown to HTML conversion
		return markdown
			.replace(/^# (.*$)/gm, '<h1>$1</h1>')
			.replace(/^## (.*$)/gm, '<h2>$1</h2>')
			.replace(/^### (.*$)/gm, '<h3>$1</h3>')
			.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.*?)\*/g, '<em>$1</em>')
			.replace(/`(.*?)`/g, '<code>$1</code>')
			.replace(/^\- (.*$)/gm, '<li>$1</li>')
			.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
			.replace(/\n\n/g, '</p><p>')
			.replace(/^(?!<[h|u|l])/gm, '<p>')
			.replace(/(?!>[h|u|l])$/gm, '</p>');
	}

	private showFallbackDocumentation(containerEl: HTMLElement): void {
		const docContainer = containerEl.createEl('div', { 
			cls: 'fornax-documentation'
		});
		
		docContainer.innerHTML = `
			<h3>Fornax - Telescopic Writing Plugin</h3>
			<p>Fornax provides "telescopic writing" functionality for Obsidian, allowing you to zoom between document structure, paragraphs, and sentences with drag-and-drop editing and sentence alternatives.</p>
			
			<h4>Features:</h4>
			<ul>
				<li><strong>Three Zoom Levels:</strong> Document view, Paragraph view, and Sentence view</li>
				<li><strong>Drag & Drop:</strong> Reorder paragraphs and sentences with visual feedback</li>
				<li><strong>Sentence Alternatives:</strong> Create and compare different versions of sentences</li>
				<li><strong>Line-based Writing:</strong> Each line is treated as a sentence unit</li>
				<li><strong>Comment Storage:</strong> Alternatives stored as invisible Obsidian comments</li>
			</ul>
			
			<h4>How to Use:</h4>
			<ol>
				<li>Open the Fornax panel from the right sidebar</li>
				<li>Switch between Document, Paragraph, and Sentence views</li>
				<li>Drag the <code>::</code> handles to reorder content</li>
				<li>Click the <code>✏️</code> icon to edit sentence alternatives</li>
				<li>Use "Save Selection" to try alternatives, "Commit" to finalize</li>
			</ol>
			
			<p><em>For complete documentation, see the README.md file in the plugin directory.</em></p>
		`;

		// Add some basic styling
		docContainer.style.maxHeight = '400px';
		docContainer.style.overflowY = 'auto';
		docContainer.style.padding = '20px';
		docContainer.style.lineHeight = '1.6';
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
