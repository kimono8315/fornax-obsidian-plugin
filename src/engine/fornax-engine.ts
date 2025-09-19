// FornaxEngine - Core document parsing and editing logic
import { App, TFile, Notice } from 'obsidian';
import { FornaxSettings, SentenceEdit, Section } from '../types';

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