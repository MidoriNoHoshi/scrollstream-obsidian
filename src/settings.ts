import { App, PluginSettingTab, Setting } from 'obsidian';
import ScrollstreamGalleryPlugin from './main';

export type SplitOrientation = 'vertical' | 'horizontal';
export type TimestampStyle = 'default' | 'accent' | 'badge' | 'active-sync';

export interface ScrollstreamSettings {
	splitRatioLeft: number;
	splitOrientation: SplitOrientation;
	timestampStyle: TimestampStyle;
}

export const DEFAULT_SETTINGS: ScrollstreamSettings = {
	splitRatioLeft: 60,
	splitOrientation: 'vertical',
	timestampStyle: 'accent',
};

export class ScrollstreamSettingTab extends PluginSettingTab {
	plugin: ScrollstreamGalleryPlugin;

	constructor(app: App, plugin: ScrollstreamGalleryPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions() {
		return [
			{
				name: 'Split orientation',
				description:
					'Vertical = side-by-side columns (text left, timeline right). Horizontal = timeline stacked below the text. Can be overridden per note with a "scrollstream-orientation" frontmatter key.',
			},
			{
				name: 'Main column width percentage',
				description:
					'Width (vertical orientation) or height (horizontal orientation) allocated to the primary text column (default: 60). Can be overridden per note with a "scrollstream-ratio" frontmatter key.',
			},
			{
				name: 'Timestamp style',
				description:
					'Choose visual appearance and emphasis for timeline timestamps.',
			},
		];
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Split orientation')
			.setDesc(
				'Vertical = side-by-side columns (text left, timeline right). Horizontal = timeline stacked below the text. Can be overridden per note with a "scrollstream-orientation" frontmatter key.',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('vertical', 'Vertical (side-by-side)')
					.addOption('horizontal', 'Horizontal (stacked)')
					.setValue(this.plugin.settings.splitOrientation)
					.onChange(async (value) => {
						this.plugin.settings.splitOrientation =
							value as SplitOrientation;
						await this.plugin.saveSettings();
						this.plugin.updateLayoutVariables();
					}),
			);

		new Setting(containerEl)
			.setName('Main column width percentage')
			.setDesc(
				'Width (vertical orientation) or height (horizontal orientation) allocated to the primary text column (default: 60). Can be overridden per note with a "scrollstream-ratio" frontmatter key.',
			)
			.addSlider((slider) =>
				slider
					.setLimits(20, 80, 5)
					.setValue(this.plugin.settings.splitRatioLeft)
					.onChange(async (value) => {
						this.plugin.settings.splitRatioLeft = value;
						await this.plugin.saveSettings();
						this.plugin.updateLayoutVariables();
					}),
			);

		new Setting(containerEl)
			.setName('Timestamp style')
			.setDesc(
				'Choose visual appearance and emphasis for timeline timestamps.',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('accent', 'Accent color (high contrast)')
					.addOption('badge', 'Badge / pill container')
					.addOption(
						'active-sync',
						'Dynamic sync (highlights on scroll focus)',
					)
					.addOption('default', 'Default (faint monospace)')
					.setValue(this.plugin.settings.timestampStyle)
					.onChange(async (value) => {
						this.plugin.settings.timestampStyle =
							value as TimestampStyle;
						await this.plugin.saveSettings();
						this.plugin.updateLayoutVariables();
					}),
			);
	}
}
