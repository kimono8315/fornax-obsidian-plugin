import { App, PluginSettingTab, Plugin } from 'obsidian';
import { FornaxSettings } from '../types';

export class FornaxSettingTab extends PluginSettingTab {
	plugin: Plugin;

	constructor(app: App, plugin: Plugin) {
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