import {
	Plugin,
	MarkdownRenderer,
	MarkdownView,
	TFile,
	Component,
} from 'obsidian';
import {
	ScrollstreamSettings,
	DEFAULT_SETTINGS,
	ScrollstreamSettingTab,
	TimestampStyle,
	SplitOrientation,
} from './settings';

interface ScrollstreamImage {
	path: string;
	alt: string;
}

interface ScrollstreamEntryData {
	lineStart: number;
	images: ScrollstreamImage[];
	timestamp?: string;
	chapter?: string;
	boundHeading: string;
	columns: number;
	bodyMarkdown: string;
}

const KEY_ALIASES: Record<string, string> = {
	img: 'image',
	imgs: 'images',
	colums: 'columns',
	column: 'columns',
};

function normalizeHeading(text: string): string {
	return text
		.replace(/^#+\s+/, '')
		.replace(/\[\[(.*?)\]\]/g, '$1')
		.trim()
		.toLowerCase();
}

function cleanHeadingText(text: string): string {
	const cleaned = text
		.replace(/^#+\s+/, '')
		.replace(/\[\[(.*?)\]\]/g, '$1')
		.replace(/^[\d.]+\s*/, '');
	const firstSegment = cleaned.split(/[\s—–:-]+/)[0];
	return (firstSegment ?? '').trim().toLowerCase();
}

function parseOrientationOverride(
	value: unknown,
): SplitOrientation | undefined {
	if (value === 'vertical' || value === 'horizontal') return value;
	return undefined;
}

function parseRatioOverride(value: unknown): number | undefined {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isNaN(n) && n > 0 && n < 100) return n;
	return undefined;
}

function parseScrollstreamBlock(
	source: string,
	lineStart: number,
	precedingHeading: string,
): ScrollstreamEntryData {
	const data: ScrollstreamEntryData = {
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

		const rawKey = line.slice(0, sepIndex).trim().toLowerCase();
		const key = KEY_ALIASES[rawKey] ?? rawKey;
		const value = line.slice(sepIndex + 1).trim();
		if (!value) continue;

		switch (key) {
			case 'image': {
				const [p, ...altParts] = value.split('|').map((s) => s.trim());
				if (p) {
					data.images.push({
						path: p,
						alt: altParts.join('|') || '',
					});
				}
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

export default class ScrollstreamGalleryPlugin extends Plugin {
	settings!: ScrollstreamSettings;
	private observers: Map<HTMLElement, IntersectionObserver> = new Map();
	private mutationObservers: Map<HTMLElement, MutationObserver> = new Map();
	private splitContainers: Set<HTMLElement> = new Set();
	private renderComponents: Map<HTMLElement, Component> = new Map();
	private orientationOverrides: Map<HTMLElement, SplitOrientation> =
		new Map();
	private lightboxEl: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new ScrollstreamSettingTab(this.app, this));
		this.updateLayoutVariables();

		this.registerMarkdownCodeBlockProcessor(
			'scrollstream',
			(_source, el) => {
				el.addClass('tlg-codeblock-hidden');
			},
		);

		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				void this.refreshActiveScrollstream();
			}),
		);
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				void this.refreshActiveScrollstream();
			}),
		);
		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				const activeView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView?.file?.path === file.path) {
					void this.refreshActiveScrollstream();
				}
			}),
		);

		void this.refreshActiveScrollstream();
	}

	onunload() {
		this.observers.forEach((obs) => obs.disconnect());
		this.observers.clear();
		this.mutationObservers.forEach((obs) => obs.disconnect());
		this.mutationObservers.clear();
		this.renderComponents.forEach((comp) => comp.unload());
		this.renderComponents.clear();
		this.splitContainers.clear();
		this.orientationOverrides.clear();

		this.lightboxEl?.remove();
		this.lightboxEl = null;

		document.body
			.querySelectorAll('.tlg-sidebar-track, .tlg-resizer')
			.forEach((el) => el.remove());
		document.body.querySelectorAll('.tlg-split-active').forEach((el) => {
			el.removeClass('tlg-split-active');
			el.removeClass('tlg-orientation-vertical');
			el.removeClass('tlg-orientation-horizontal');
		});
	}

	async loadSettings() {
		const loadedData =
			(await this.loadData()) as Partial<ScrollstreamSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData ?? {});
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

		this.splitContainers.forEach((container) => {
			this.applyOrientation(
				container,
				this.orientationOverrides.get(container),
			);
			const track = container.querySelector<HTMLElement>(
				':scope > .tlg-sidebar-track',
			);
			if (track) {
				this.applyTimestampClass(track, this.settings.timestampStyle);
			}
		});
	}

	private applyOrientation(
		container: HTMLElement,
		override?: SplitOrientation,
	) {
		const effective = override ?? this.settings.splitOrientation;
		const isVertical = effective === 'vertical';
		container.dataset.tlgOrientation = effective;
		container.toggleClass('tlg-orientation-vertical', isVertical);
		container.toggleClass('tlg-orientation-horizontal', !isVertical);
	}

	private applyTimestampClass(track: HTMLElement, style: TimestampStyle) {
		track.removeClass(
			'tlg-track-timestamp-accent',
			'tlg-track-timestamp-badge',
			'tlg-track-timestamp-active-sync',
			'tlg-track-timestamp-default',
		);
		track.addClass(`tlg-track-timestamp-${style}`);
	}

	private ensureLightbox(): HTMLElement {
		if (this.lightboxEl) return this.lightboxEl;
		const overlay = document.body.createDiv({ cls: 'tlg-lightbox' });
		overlay.createEl('img', { cls: 'tlg-lightbox-img' });
		this.registerDomEvent(overlay, 'click', () => this.closeLightbox());
		this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
			if (evt.key === 'Escape') this.closeLightbox();
		});
		this.lightboxEl = overlay;
		return overlay;
	}

	private openLightbox(src: string, alt: string) {
		const overlay = this.ensureLightbox();
		const imgEl = overlay.querySelector('img') as HTMLImageElement;
		imgEl.src = src;
		imgEl.alt = alt;
		overlay.addClass('tlg-lightbox-open');
	}

	private closeLightbox() {
		this.lightboxEl?.removeClass('tlg-lightbox-open');
	}

	private focusAndRevealBlock(view: MarkdownView, lineStart: number) {
		if (view.getMode() === 'preview') {
			void view.setState(
				{ ...view.getState(), mode: 'source' },
				{ history: false },
			);
		}

		const editor = view.editor;
		editor.focus();

		const targetLine = lineStart + 1;
		const lineCount = editor.lineCount();
		const safeLine = Math.min(targetLine, Math.max(0, lineCount - 1));

		editor.setCursor({ line: safeLine, ch: 0 });

		editor.setSelection(
			{ line: lineStart, ch: 0 },
			{ line: safeLine, ch: editor.getLine(safeLine)?.length ?? 0 },
		);

		editor.scrollIntoView(
			{
				from: { line: lineStart, ch: 0 },
				to: { line: safeLine, ch: 0 },
			},
			true,
		);
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

	private extractScrollstreamBlocksFromText(
		content: string,
	): ScrollstreamEntryData[] {
		const entries: ScrollstreamEntryData[] = [];
		const lines = content.split(/\r?\n/);
		let currentHeading = 'root';
		let inBlock = false;
		let blockLines: string[] = [];
		let blockStartLine = 0;

		for (let i = 0; i < lines.length; i++) {
			const rawLine = lines[i];
			if (rawLine === undefined) continue;
			const trimmed = rawLine.trim();

			if (!inBlock) {
				const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
				if (headingMatch && headingMatch[1]) {
					currentHeading = headingMatch[1].trim();
				}

				if (trimmed === '```scrollstream') {
					inBlock = true;
					blockStartLine = i;
					blockLines = [];
				}
			} else {
				if (trimmed === '```') {
					inBlock = false;
					const blockSource = blockLines.join('\n');
					entries.push(
						parseScrollstreamBlock(
							blockSource,
							blockStartLine,
							currentHeading,
						),
					);
				} else {
					blockLines.push(rawLine);
				}
			}
		}
		return entries;
	}

	private teardownContainer(
		container: HTMLElement,
		track: HTMLElement | null,
	) {
		if (track) {
			this.renderComponents.get(track)?.unload();
			this.renderComponents.delete(track);
			track.remove();
		}

		const resizer = container.querySelector<HTMLElement>(
			':scope > .tlg-resizer',
		);
		resizer?.remove();

		container.removeClass('tlg-split-active');
		container.removeClass('tlg-orientation-vertical');
		container.removeClass('tlg-orientation-horizontal');
		container.style.removeProperty('--tlg-split-left');
		container.style.removeProperty('--tlg-split-right');
		container.style.removeProperty('--tlg-font-size');
		container.style.removeProperty('--tlg-item-gap');
		container.style.removeProperty('--tlg-radius');

		this.splitContainers.delete(container);
		this.orientationOverrides.delete(container);

		this.observers.get(container)?.disconnect();
		this.observers.delete(container);
		this.mutationObservers.get(container)?.disconnect();
		this.mutationObservers.delete(container);
	}

	private registerResizerDrag(resizer: HTMLElement, container: HTMLElement) {
		resizer.addEventListener('pointerdown', (e: PointerEvent) => {
			e.preventDefault();
			const rect = container.getBoundingClientRect();
			const isVertical =
				container.dataset.tlgOrientation !== 'horizontal';

			const onPointerMove = (moveEvent: PointerEvent) => {
				let percentage: number;
				if (isVertical) {
					const leftOffset = moveEvent.clientX - rect.left;
					percentage = (leftOffset / rect.width) * 100;
				} else {
					const topOffset = moveEvent.clientY - rect.top;
					percentage = (topOffset / rect.height) * 100;
				}

				const clamped = Math.min(Math.max(percentage, 20), 80);
				container.style.setProperty('--tlg-split-left', `${clamped}%`);
				container.style.setProperty(
					'--tlg-split-right',
					`${100 - clamped}%`,
				);
			};

			const onPointerUp = () => {
				window.removeEventListener('pointermove', onPointerMove);
				window.removeEventListener('pointerup', onPointerUp);
			};

			window.addEventListener('pointermove', onPointerMove);
			window.addEventListener('pointerup', onPointerUp);
		});
	}

	private async refreshActiveScrollstream() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || !view.file) return;

		const container = view.contentEl;
		if (!container) return;

		const fileContent = await this.app.vault.cachedRead(view.file);
		const entries = this.extractScrollstreamBlocksFromText(fileContent);

		let track = container.querySelector<HTMLElement>(
			':scope > .tlg-sidebar-track',
		);

		if (entries.length === 0) {
			this.teardownContainer(container, track);
			return;
		}

		if (!track) {
			track = createDiv({ cls: 'tlg-sidebar-track' });
			container.addClass('tlg-split-active');
			container.appendChild(track);
			this.splitContainers.add(container);
		}

		let resizer = container.querySelector<HTMLElement>(
			':scope > .tlg-resizer',
		);
		if (!resizer) {
			resizer = createDiv({ cls: 'tlg-resizer' });
			container.insertBefore(resizer, track);
			this.registerResizerDrag(resizer, container);
		}

		const cache = this.app.metadataCache.getFileCache(view.file);
		const fm = cache?.frontmatter;
		const orientationOverride = parseOrientationOverride(
			fm?.['scrollstream-orientation'],
		);
		const ratioOverride = parseRatioOverride(fm?.['scrollstream-ratio']);

		if (orientationOverride) {
			this.orientationOverrides.set(container, orientationOverride);
		} else {
			this.orientationOverrides.delete(container);
		}
		this.applyOrientation(container, orientationOverride);

		if (ratioOverride !== undefined) {
			container.style.setProperty(
				'--tlg-split-left',
				`${ratioOverride}%`,
			);
			container.style.setProperty(
				'--tlg-split-right',
				`${100 - ratioOverride}%`,
			);
		} else {
			container.style.removeProperty('--tlg-split-left');
			container.style.removeProperty('--tlg-split-right');
		}

		if (fm?.['scrollstream-font-size']) {
			container.style.setProperty(
				'--tlg-font-size',
				String(fm['scrollstream-font-size']),
			);
		} else {
			container.style.removeProperty('--tlg-font-size');
		}

		if (fm?.['scrollstream-gap']) {
			container.style.setProperty(
				'--tlg-item-gap',
				String(fm['scrollstream-gap']),
			);
		} else {
			container.style.removeProperty('--tlg-item-gap');
		}

		if (fm?.['scrollstream-radius']) {
			container.style.setProperty(
				'--tlg-radius',
				String(fm['scrollstream-radius']),
			);
		} else {
			container.style.removeProperty('--tlg-radius');
		}

		this.applyTimestampClass(track, this.settings.timestampStyle);

		this.renderComponents.get(track)?.unload();
		const trackComponent = new Component();
		trackComponent.load();
		this.renderComponents.set(track, trackComponent);

		track.empty();

		for (const entry of entries) {
			const item = createDiv({ cls: 'tlg-item' });
			item.dataset.lineStart = String(entry.lineStart);
			item.dataset.boundHeading = normalizeHeading(entry.boundHeading);

			const displaySection = entry.chapter || entry.boundHeading;
			if (displaySection && displaySection !== 'root') {
				item.dataset.section = displaySection;
			}

			item.addEventListener('click', (evt) => {
				if ((evt.target as HTMLElement).closest('a, img, button')) {
					return;
				}
				this.focusAndRevealBlock(view, entry.lineStart);
			});

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
						const imgEl = wrap.createEl('img', {
							attr: { src, alt: img.alt || '' },
						});
						imgEl.addEventListener('click', (evt) => {
							evt.stopPropagation();
							this.openLightbox(src, img.alt || '');
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
					trackComponent,
				);
			}

			track.appendChild(item);
		}
		this.setupHeadingObserver(container, track);
	}

	private setupHeadingObserver(
		renderedContainer: HTMLElement,
		track: HTMLElement,
	) {
		this.observers.get(renderedContainer)?.disconnect();
		this.observers.delete(renderedContainer);
		this.mutationObservers.get(renderedContainer)?.disconnect();
		this.mutationObservers.delete(renderedContainer);

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		const activateTrackItemForHeading = (targetHeadingText: string) => {
			const targetToken = cleanHeadingText(targetHeadingText);
			if (!targetToken) return;

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

			if (targetItem && !targetItem.hasClass('is-active')) {
				targetItem.scrollIntoView({
					behavior: 'smooth',
					block: 'nearest',
				});
				track
					.querySelectorAll('.tlg-item')
					.forEach((i) => i.removeClass('is-active'));
				targetItem.addClass('is-active');
			}
		};

		if (view.getMode() !== 'preview') {
			const scroller =
				renderedContainer.querySelector<HTMLElement>('.cm-scroller');
			if (!scroller) return;

			let isThrottled = false;
			const onEditorScroll = () => {
				if (isThrottled) return;
				isThrottled = true;

				window.requestAnimationFrame(() => {
					isThrottled = false;
					if (!view.file) return;

					const scrollInfo = view.editor.getScrollInfo();
					const totalLines = view.editor.lineCount();
					const approxLineHeight =
						scroller.scrollHeight / Math.max(totalLines, 1);
					const currentLine = Math.floor(
						scrollInfo.top / approxLineHeight,
					);

					const cache = this.app.metadataCache.getFileCache(
						view.file,
					);
					const headings = cache?.headings ?? [];

					let activeHeading: string | null = null;
					for (const h of headings) {
						if (h.position.start.line <= currentLine) {
							activeHeading = h.heading;
						} else {
							break;
						}
					}

					if (activeHeading) {
						activateTrackItemForHeading(activeHeading);
					}
				});
			};

			scroller.addEventListener('scroll', onEditorScroll, {
				passive: true,
			});
			this.register(() =>
				scroller.removeEventListener('scroll', onEditorScroll),
			);
			return;
		}

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

						activateTrackItemForHeading(targetToken);
					}
				}
			},
			{
				root: scrollContainer,
				rootMargin: '-10% 0px -40% 0px',
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
