import { App, Modal } from 'obsidian';
import { TelescopeOverlay } from './telescope-overlay';

export class SentenceEditModal extends Modal {
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