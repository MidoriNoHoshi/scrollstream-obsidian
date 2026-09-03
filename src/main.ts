import { Plugin, MarkdownRenderer, MarkdownView, TFile } from 'obsidian';
import {
	TimelineSettings,
	DEFAULT_SETTINGS,
	TimelineSettingTab,
} from './settings';

interface TimelineImage {
	path: string;
	alt: string;
}

interface TimelineEntryData {
	lineStart: number;
	images: TimelineImage[];
	timestamp?: string;
	chapter?: string;
	boundHeading: string;
	columns: number;
	bodyMarkdown: string;
}

function normalizeHeading(text: string): string {
	return text
		.replace(/^#+\s+/, '') // Strip markdown hashes
		.replace(/\[\[(.*?)\]\]/g, '$1') // Strip wikilinks
		.trim()
		.toLowerCase();
}

function cleanHeadingText(text: string): string {
	return text
		.replace(/^#+\s+/, '') // Strip markdown hashes
		.replace(/\[\[(.*?)\]\]/g, '$1') // Strip wikilinks
		.replace(/^[\d.]+\s*/, '') // Strip leading section numbering (e.g., "1. ", "2.1 ")
		.split(/[\s—–:-]+/)[0] // Extract primary topic token before dashes/subtitles
		.trim()
		.toLowerCase();
}

/**
 * Parses a single block and associates it with its explicit or auto chapter
 */
function parseTimelineBlock(
	source: string,
	lineStart: number,
	precedingHeading: string,
): TimelineEntryData {
	const data: TimelineEntryData = {
		lineStart,
		images: [],
		columns: 2,
		bodyMarkdown: '',
		boundHeading: precedingHeading,
	};
	const lines = source.split('\n');
	let isParsingBody = false;
	const bodyLines: string[] = [];

	for (const rawLine of lines) {
		if (rawLine.trim() === '---' && !isParsingBody) {
			isParsingBody = true;
			continue;
		}
		if (isParsingBody) {
			bodyLines.push(rawLine);
			continue;
		}

		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;

		const sepIndex = line.indexOf(':');
		if (sepIndex === -1) {
			bodyLines.push(rawLine);
			continue;
		}

		const key = line.slice(0, sepIndex).trim().toLowerCase();
		const value = line.slice(sepIndex + 1).trim();
		if (!value) continue;

		switch (key) {
			case 'image': {
				const [p, ...altParts] = value.split('|').map((s) => s.trim());
				if (p)
					data.images.push({
						path: p,
						alt: altParts.join('|') || '',
					});
				break;
			}
			case 'images': {
				value
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
					.forEach((p) => data.images.push({ path: p, alt: '' }));
				break;
			}
			case 'timestamp':
			case 'date':
				data.timestamp = value;
				break;
			case 'chapter':
			case 'section': {
				if (value.toLowerCase() !== 'auto') {
					data.chapter = value;
					data.boundHeading = value;
				}
				break;
			}
			case 'columns': {
				const n = parseInt(value, 10);
				if (!Number.isNaN(n) && n > 0) data.columns = n;
				break;
			}
			default:
				bodyLines.push(rawLine);
				break;
		}
	}
	data.bodyMarkdown = bodyLines.join('\n').trim();
	return data;
}

export default class TimelineGalleryPlugin extends Plugin {
	settings: TimelineSettings;
	private observers: Map<HTMLElement, IntersectionObserver> = new Map();
	private mutationObservers: Map<HTMLElement, MutationObserver> = new Map();
	private splitContainers: Set<HTMLElement> = new Set();

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new TimelineSettingTab(this.app, this));
		this.updateLayoutVariables();

		this.registerMarkdownCodeBlockProcessor('timeline', (source, el) => {
			el.style.display = 'none';
		});

		this.registerEvent(
			this.app.workspace.on('file-open', () =>
				this.refreshActiveTimeline(),
			),
		);
		this.registerEvent(
			this.app.workspace.on('layout-change', () =>
				this.refreshActiveTimeline(),
			),
		);
		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				const activeView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView?.file?.path === file.path) {
					this.refreshActiveTimeline();
				}
			}),
		);

		this.refreshActiveTimeline();
	}

	onunload() {
		this.observers.forEach((obs) => obs.disconnect());
		this.observers.clear();
		this.mutationObservers.forEach((obs) => obs.disconnect());
		this.mutationObservers.clear();
		this.splitContainers.clear();

		delete document.documentElement.dataset.tlgTimestampStyle;

		document.body
			.querySelectorAll('.tlg-sidebar-track')
			.forEach((el) => el.remove());
		document.body
			.querySelectorAll('.tlg-split-active')
			.forEach((el) => el.removeClass('tlg-split-active'));
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	updateLayoutVariables() {
		const left = this.settings.splitRatioLeft;
		const right = 100 - left;
		document.documentElement.style.setProperty(
			'--tlg-split-left',
			`${left}%`,
		);
		document.documentElement.style.setProperty(
			'--tlg-split-right',
			`${right}%`,
		);

		document.documentElement.dataset.tlgTimestampStyle =
			this.settings.timestampStyle;

		this.splitContainers.forEach((container) =>
			this.applyOrientation(container),
		);
	}

	private applyOrientation(container: HTMLElement) {
		const isVertical = this.settings.splitOrientation === 'vertical';
		container.dataset.tlgOrientation = this.settings.splitOrientation;
		container.style.setProperty('display', 'flex', 'important');
		container.style.setProperty(
			'flex-direction',
			isVertical ? 'row' : 'column',
			'important',
		);

		const textPane = container.querySelector<HTMLElement>(
			':scope > :not(.tlg-sidebar-track)',
		);
		const track = container.querySelector<HTMLElement>(
			':scope > .tlg-sidebar-track',
		);

		if (textPane) {
			if (isVertical) {
				textPane.style.setProperty(
					'flex',
					'0 0 calc(var(--tlg-split-left) - 12px)',
					'important',
				);
				textPane.style.setProperty(
					'max-width',
					'calc(var(--tlg-split-left) - 12px)',
					'important',
				);
			} else {
				textPane.style.setProperty('flex', '0 0 auto', 'important');
				textPane.style.setProperty('max-width', '100%', 'important');
			}
		}

		if (track) {
			if (isVertical) {
				track.style.setProperty(
					'flex',
					'0 0 calc(var(--tlg-split-right) - 12px)',
					'important',
				);
				track.style.setProperty(
					'max-width',
					'calc(var(--tlg-split-right) - 12px)',
					'important',
				);
				track.style.setProperty('position', 'sticky', 'important');
				track.style.setProperty('top', '0', 'important');
				track.style.setProperty(
					'max-height',
					'calc(100vh - 40px)',
					'important',
				);
				track.style.setProperty('overflow-y', 'auto', 'important');
			} else {
				track.style.setProperty('flex', '0 0 auto', 'important');
				track.style.setProperty('max-width', '100%', 'important');
				track.style.setProperty('position', 'static', 'important');
				track.style.setProperty('max-height', 'none', 'important');
				track.style.setProperty('overflow-y', 'visible', 'important');
			}
		}
	}

	private resolveImageSrc(
		rawPath: string,
		sourcePath: string,
	): string | null {
		const cleaned = rawPath
			.replace(/^!?\[\[/, '')
			.replace(/\]\]$/, '')
			.trim();
		const file = this.app.metadataCache.getFirstLinkpathDest(
			cleaned,
			sourcePath,
		);
		if (file instanceof TFile) {
			return this.app.vault.getResourcePath(file);
		}
		if (/^https?:\/\//i.test(cleaned)) return cleaned;
		return null;
	}

	/**
	 * Parses the markdown file text sequentially, calculating line positions
	 * and tracking the active heading for automatic block association.
	 */
	private extractTimelineBlocksFromText(
		content: string,
	): TimelineEntryData[] {
		const entries: TimelineEntryData[] = [];
		const lines = content.split(/\r?\n/);
		let currentHeading = 'root';
		let inBlock = false;
		let blockLines: string[] = [];
		let blockStartLine = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();

			if (!inBlock) {
				const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
				if (headingMatch) {
					currentHeading = headingMatch[1].trim();
				}

				if (trimmed === '```timeline') {
					inBlock = true;
					blockStartLine = i;
					blockLines = [];
				}
			} else {
				if (trimmed === '```') {
					inBlock = false;
					const blockSource = blockLines.join('\n');
					entries.push(
						parseTimelineBlock(
							blockSource,
							blockStartLine,
							currentHeading,
						),
					);
				} else {
					blockLines.push(line);
				}
			}
		}
		return entries;
	}

	private async refreshActiveTimeline() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || !view.file) return;

		const container = view.contentEl.querySelector<HTMLElement>(
			'.markdown-reading-view',
		);
		if (!container) return;

		const fileContent = await this.app.vault.cachedRead(view.file);
		const entries = this.extractTimelineBlocksFromText(fileContent);

		let track = container.querySelector<HTMLElement>(
			':scope > .tlg-sidebar-track',
		);
		if (entries.length === 0) {
			if (track) {
				track.remove();
				container.removeClass('tlg-split-active');
			}
			return;
		}

		if (!track) {
			track = createDiv({ cls: 'tlg-sidebar-track' });
			container.addClass('tlg-split-active');
			container.appendChild(track);
			this.splitContainers.add(container);
			this.applyOrientation(container);
		}

		track.empty();

		for (const entry of entries) {
			const item = createDiv({ cls: 'tlg-item' });
			item.dataset.lineStart = String(entry.lineStart);
			item.dataset.boundHeading = normalizeHeading(entry.boundHeading);

			const displaySection = entry.chapter || entry.boundHeading;
			if (displaySection && displaySection !== 'root') {
				item.dataset.section = displaySection;
			}

			item.createDiv({ cls: 'tlg-marker' });
			const content = item.createDiv({ cls: 'tlg-content' });

			const meta = content.createDiv({ cls: 'tlg-meta' });
			if (entry.timestamp) {
				meta.createSpan({
					cls: 'tlg-timestamp',
					text: entry.timestamp,
				});
			}
			if (displaySection && displaySection !== 'root') {
				meta.createSpan({ cls: 'tlg-section', text: displaySection });
			}

			if (entry.images.length > 0) {
				const gallery = content.createDiv({ cls: 'tlg-gallery' });
				gallery.style.setProperty(
					'--tlg-columns',
					String(Math.min(entry.columns, entry.images.length)),
				);
				for (const img of entry.images) {
					const wrap = gallery.createDiv({ cls: 'tlg-image-wrap' });
					const src = this.resolveImageSrc(img.path, view.file.path);
					if (src) {
						wrap.createEl('img', {
							attr: { src, alt: img.alt || '' },
						});
					} else {
						wrap.createDiv({
							cls: 'tlg-missing',
							text: `Missing: ${img.path}`,
						});
					}
				}
			}

			if (entry.bodyMarkdown) {
				const bodyContainer = content.createDiv({ cls: 'tlg-body' });
				await MarkdownRenderer.render(
					this.app,
					entry.bodyMarkdown,
					bodyContainer,
					view.file.path,
					this,
				);
			}

			track.appendChild(item);
		}
		this.setupHeadingObserver(container, track);
	}

	/**
	 * Pairs IntersectionObserver with MutationObserver so virtualized headings
	 * added to the DOM dynamically during scrolling are observed immediately.
	 */
	private setupHeadingObserver(
		renderedContainer: HTMLElement,
		track: HTMLElement,
	) {
		this.observers.get(renderedContainer)?.disconnect();
		this.mutationObservers.get(renderedContainer)?.disconnect();

		const scrollContainer =
			renderedContainer.querySelector<HTMLElement>(
				'.markdown-preview-view',
			) || renderedContainer;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						const heading = entry.target as HTMLElement;

						const clone = heading.cloneNode(true) as HTMLElement;
						clone
							.querySelectorAll(
								'.heading-collapse-indicator, .heading-anchor',
							)
							.forEach((el) => el.remove());

						const rawText =
							heading.getAttribute('data-heading') ||
							clone.textContent ||
							'';

						const targetToken = cleanHeadingText(rawText);
						if (!targetToken) continue;

						const items = Array.from(
							track.querySelectorAll<HTMLElement>('.tlg-item'),
						);
						const targetItem = items.find((item) => {
							const bound = (item.dataset.boundHeading || '')
								.toLowerCase()
								.trim();
							return (
								bound === targetToken ||
								bound.includes(targetToken) ||
								targetToken.includes(bound)
							);
						});

						if (targetItem) {
							targetItem.scrollIntoView({
								behavior: 'smooth',
								block: 'nearest',
							});

							track
								.querySelectorAll('.tlg-item')
								.forEach((i) => i.removeClass('is-active'));
							targetItem.addClass('is-active');
						}
					}
				}
			},
			{
				root: null,
				rootMargin: '-15% 0px -50% 0px',
				threshold: 0,
			},
		);

		this.observers.set(renderedContainer, observer);

		const observedElements = new WeakSet<Element>();
		const observeHeadings = () => {
			const headings = scrollContainer.querySelectorAll(
				'h1, h2, h3, h4, h5, h6',
			);
			headings.forEach((h) => {
				if (!observedElements.has(h)) {
					observer.observe(h);
					observedElements.add(h);
				}
			});
		};

		observeHeadings();

		const mutationObserver = new MutationObserver(() => {
			observeHeadings();
		});

		mutationObserver.observe(scrollContainer, {
			childList: true,
			subtree: true,
		});

		this.mutationObservers.set(renderedContainer, mutationObserver);
	}
}
