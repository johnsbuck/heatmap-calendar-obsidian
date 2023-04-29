import { Plugin, } from 'obsidian'
import HeatmapCalendarSettingsTab from "settings"

interface CalendarData {
	year: number
	month: number
	colors: {
		[index: string | number]: string[]
	} | string
	entries: Entry[]
	showCurrentDayBorder: boolean
	defaultEntryIntensity: number
	intensityScaleStart: number
	intensityScaleEnd: number
}

interface CalendarSettings extends CalendarData {
	colors: {
		[index: string | number]: string[]
	}
}

interface Entry {
	date: string
	intensity?: number
	color: string 
	content: string
}
const DEFAULT_SETTINGS: CalendarData = {
	year: new Date().getFullYear(),
	month: 0,
	colors: {
		default: ["#c6e48b", "#7bc96f", "#49af5d", "#2e8840", "#196127",],
	},
	entries: [{ date: "1900-01-01", color: "#7bc96f", intensity: 5, content: "",},],
	showCurrentDayBorder: true,
	defaultEntryIntensity: 4,
	intensityScaleStart: 1,
	intensityScaleEnd: 5,
}
export default class HeatmapCalendar extends Plugin {

	settings: CalendarSettings

	/**
	 * Returns a number representing how many days into the year the supplied date is. 
	 * Example: first of january is 1, third of february is 34 (31+3) 
	 * @param date
	 */
	
	getHowManyDaysIntoYear(date: Date): number {
		return (
			(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
				Date.UTC(date.getUTCFullYear(), 0, 0)) / 24 / 60 / 60 / 1000
		)
	}
	getHowManyDaysIntoYearLocal(date: Date): number {
		return (
			(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
				Date.UTC(date.getFullYear(), 0, 0)) / 24 / 60 / 60 / 1000
		)
	}

	/**
	 * Returns a number representing the max number of weeks in the month.
	 * Source: https://stackoverflow.com/questions/1643320/get-month-name-from-date
	 * @param year 
	 * @param month_number 
	 * @returns 
	 */
	weekCount(year: number, month_number: number): number {

		// month_number is in the range 1..12
	
		var firstOfMonth = new Date(year, month_number-1, 1);
		var lastOfMonth = new Date(year, month_number, 0);
	
		var used = firstOfMonth.getDay() + lastOfMonth.getDate();
	
		// Added one for padding
		return Math.ceil( used / 7) + 1;
	}

	/** 
	 * Removes HTMLElements passed as entry.content and outside of the displayed year from rendering above the calendar
	 */
	removeHtmlElementsNotInYear(entries: Entry[], year: number) {
		const calEntriesNotInDisplayedYear = entries.filter(e => new Date(e.date).getFullYear() !== year) ?? this.settings.entries
		//@ts-ignore
		calEntriesNotInDisplayedYear.forEach(e => e.content instanceof HTMLElement && e.content.remove())
	}

	clamp(input: number, min: number, max: number): number {
		return input < min ? min : input > max ? max : input
	}

	map(current: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
		const mapped: number = ((current - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin
		return this.clamp(mapped, outMin, outMax)
	}

	async onload() {

		await this.loadSettings()

		this.addSettingTab(new HeatmapCalendarSettingsTab(this.app, this))

		//@ts-ignore
		window.renderHeatmapCalendar = (el: HTMLElement, calendarData: CalendarData): void => {
			const year = calendarData.year ?? this.settings.year
			let month = calendarData.month ?? 0
			month = month < 0 || month > 12 ? 0 : month
			
			const colors = typeof calendarData.colors === "string"
				? this.settings.colors[calendarData.colors]
					? { [calendarData.colors]: this.settings.colors[calendarData.colors], }
					: this.settings.colors
				: calendarData.colors ?? this.settings.colors

			this.removeHtmlElementsNotInYear(calendarData.entries, year)

			const calEntries = calendarData.entries.filter(e => new Date(e.date + "T00:00").getFullYear() === year) ?? this.settings.entries

			const showCurrentDayBorder = calendarData.showCurrentDayBorder ?? this.settings.showCurrentDayBorder

			const defaultEntryIntensity = calendarData.defaultEntryIntensity ?? this.settings.defaultEntryIntensity

			const intensities = calEntries.filter(e => e.intensity).map(e => e.intensity as number)
			const minimumIntensity = intensities.length ? Math.min(...intensities) : this.settings.intensityScaleStart
			const maximumIntensity = intensities.length ? Math.max(...intensities) : this.settings.intensityScaleEnd
			const intensityScaleStart = calendarData.intensityScaleStart ?? minimumIntensity
			const intensityScaleEnd = calendarData.intensityScaleEnd ?? maximumIntensity

			const mappedEntries: Entry[] = []
			calEntries.forEach(e => {
				const newEntry = {
					intensity: defaultEntryIntensity,
					...e,
				}
				const colorIntensities = typeof colors === "string"
					? this.settings.colors[colors]
					: colors[e.color] ?? colors[Object.keys(colors)[0]]

				const numOfColorIntensities = Object.keys(colorIntensities).length

				if(minimumIntensity === maximumIntensity && intensityScaleStart === intensityScaleEnd) newEntry.intensity = numOfColorIntensities
				else newEntry.intensity = Math.round(this.map(newEntry.intensity, intensityScaleStart, intensityScaleEnd, 1, numOfColorIntensities))

				mappedEntries[this.getHowManyDaysIntoYear(new Date(e.date))] = newEntry
			})

			const firstDayOfYear = new Date(Date.UTC(year, 0, 1))
			let numberOfEmptyDaysBeforeYearBegins = (firstDayOfYear.getUTCDay() + 6) % 7

			interface Box {
				backgroundColor?: string;
				date?: string;
				content?: string;
				classNames?: string[];
			}

			const boxes: Array<Box> = []

			while (numberOfEmptyDaysBeforeYearBegins) {
				boxes.push({ backgroundColor: "transparent", })
				numberOfEmptyDaysBeforeYearBegins--
			}
			const lastDayOfYear = new Date(Date.UTC(year, 11, 31))
			const todaysDayNumberLocal = this.getHowManyDaysIntoYearLocal(new Date())

			let startDay = 1
			let lastDay = this.getHowManyDaysIntoYear(lastDayOfYear) //eg 365 or 366

			if (month !== 0) {
				startDay = this.getHowManyDaysIntoYear(new Date(Date.UTC(year, month - 1, 1)))
				lastDay = this.getHowManyDaysIntoYear(new Date(Date.UTC(year, month, 0)));
			}


			for (let day = startDay; day <= lastDay; day++) {

				const box: Box = {
                    classNames: [],
                }

				if (day === todaysDayNumberLocal && showCurrentDayBorder) box.classNames?.push("today")

				if (mappedEntries[day]) {
					box.classNames?.push("hasData")
					const entry = mappedEntries[day]

					box.date = entry.date

					if (entry.content) box.content = entry.content

					const currentDayColors = entry.color ? colors[entry.color] : colors[Object.keys(colors)[0]]
					box.backgroundColor = currentDayColors[entry.intensity as number - 1]

				} else box.classNames?.push("isEmpty")
				boxes.push(box)
			}

			const heatmapCalendarGraphDiv = createDiv({
				cls: "heatmap-calendar-graph",
				parent: el,
			})

			createDiv({
				cls: "heatmap-calendar-year",
				text: String(year).slice(2),
				parent: heatmapCalendarGraphDiv,
			})

			const heatmapCalendarMonthsUl = createEl("ul", {
				cls: "heatmap-calendar-months",
				parent: heatmapCalendarGraphDiv,
			})

			// Generate months on top of heatmap using short month naming convention
			if (month === 0) {
				const NUM_MONTHS = 12;
				for (let i = 0; i < NUM_MONTHS; i++) {
					createEl("li", { text: new Date(year, i, 1).toLocaleString('default', { month: 'short' }), parent: heatmapCalendarMonthsUl, })
				}
			} else {
				// We selected a singular month, only generate this month
				createEl("li", { text: new Date(year, month, 0).toLocaleString('default', { month: 'short' }), parent: heatmapCalendarMonthsUl, })
			}

			const heatmapCalendarDaysUl = createEl("ul", {
				cls: "heatmap-calendar-days",
				parent: heatmapCalendarGraphDiv,
			})

			createEl("li", { text: "Mon", parent: heatmapCalendarDaysUl, })
			createEl("li", { text: "Tue", parent: heatmapCalendarDaysUl, })
			createEl("li", { text: "Wed", parent: heatmapCalendarDaysUl, })
			createEl("li", { text: "Thu", parent: heatmapCalendarDaysUl, })
			createEl("li", { text: "Fri", parent: heatmapCalendarDaysUl, })
			createEl("li", { text: "Sat", parent: heatmapCalendarDaysUl, })
			createEl("li", { text: "Sun", parent: heatmapCalendarDaysUl, })

			let heatmapCalendarBoxesUl = createEl("ul", {
				cls: "heatmap-calendar-boxes",
				parent: heatmapCalendarGraphDiv,
			})

			const MAX_WEEKS = 53;
			heatmapCalendarBoxesUl.style.setProperty('grid-template-columns', 'repeat(' + String(month === 0 ? MAX_WEEKS : this.weekCount(year, month)) + ')')

			boxes.forEach(e => {
				const entry = createEl("li", {
					attr: {
						...e.backgroundColor && { style: `background-color: ${e.backgroundColor};`, },
						...e.date && { "data-date": e.date, },
					},
					cls: e.classNames,
					parent: heatmapCalendarBoxesUl,
				})

				createSpan({
					cls: "heatmap-calendar-content",
					parent: entry,
					text: e.content,
				})
			})

		}
	}

	onunload() {

	}

	async loadSettings() {
		console.log( "heyoh", await this.loadData() );
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}
}
