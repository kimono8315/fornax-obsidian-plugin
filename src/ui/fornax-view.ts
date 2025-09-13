import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import { VIEW_TYPE_FORNAX } from '../constants';
import { TelescopeOverlay } from './telescope-overlay';

// Import type for FornaxPlugin - will need to import the actual class when it's extracted
// import { FornaxPlugin } from '../plugin';

export class FornaxView extends ItemView {
	private overlay: TelescopeOverlay | null = null;
	private currentFile: TFile | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: any) { // TODO: Type as FornaxPlugin when extracted
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