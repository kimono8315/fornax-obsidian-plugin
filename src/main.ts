// main.ts - Fornax Plugin Entry Point
import { Plugin, WorkspaceLeaf } from 'obsidian';

// Import types and constants
import { FornaxSettings } from './types';
import { DEFAULT_SETTINGS, VIEW_TYPE_FORNAX } from './constants';

// Import core components
import { FornaxEngine } from './engine/fornax-engine';
import { FornaxView } from './ui/fornax-view';
import { FornaxSettingTab } from './settings/settings';

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