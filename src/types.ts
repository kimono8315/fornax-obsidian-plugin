// Types and interfaces for Fornax plugin

export interface FornaxSettings {
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

export type ZoomLevel = 'document' | 'paragraphs' | 'sentences';