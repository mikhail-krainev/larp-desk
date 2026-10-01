export interface PaletteColor {
	stroke: string
	/** Light tint used for `fill: 'tint'` and sticky backgrounds. */
	tint: string
	solid: string
}

export const PALETTE: Record<string, { light: PaletteColor; dark: PaletteColor }> = {
	ink: {
		light: { stroke: '#1d1d1f', tint: '#ececef', solid: '#3a3a3e' },
		dark: { stroke: '#f1f1f3', tint: '#2b2b30', solid: '#c9c9cf' },
	},
	grey: {
		light: { stroke: '#8a8f98', tint: '#f1f2f4', solid: '#c4c8ce' },
		dark: { stroke: '#9aa0a8', tint: '#26282c', solid: '#5c6168' },
	},
	red: {
		light: { stroke: '#e03131', tint: '#ffe3e3', solid: '#ff8787' },
		dark: { stroke: '#ff6b6b', tint: '#3b1d1f', solid: '#c92a2a' },
	},
	orange: {
		light: { stroke: '#e8590c', tint: '#ffe8cc', solid: '#ffa94d' },
		dark: { stroke: '#ff922b', tint: '#3a2615', solid: '#d9480f' },
	},
	yellow: {
		light: { stroke: '#e0a800', tint: '#fff3bf', solid: '#ffd43b' },
		dark: { stroke: '#fcc419', tint: '#3a3315', solid: '#e0a800' },
	},
	green: {
		light: { stroke: '#2f9e44', tint: '#d3f9d8', solid: '#69db7c' },
		dark: { stroke: '#51cf66', tint: '#183320', solid: '#2b8a3e' },
	},
	teal: {
		light: { stroke: '#0c8599', tint: '#c5f6fa', solid: '#3bc9db' },
		dark: { stroke: '#22b8cf', tint: '#13313a', solid: '#0b7285' },
	},
	blue: {
		light: { stroke: '#1c7ed6', tint: '#d0ebff', solid: '#74c0fc' },
		dark: { stroke: '#4dabf7', tint: '#162a40', solid: '#1864ab' },
	},
	violet: {
		light: { stroke: '#7048e8', tint: '#e5dbff', solid: '#b197fc' },
		dark: { stroke: '#9775fa', tint: '#271d45', solid: '#5f3dc4' },
	},
	pink: {
		light: { stroke: '#d6336c', tint: '#ffdeeb', solid: '#faa2c1' },
		dark: { stroke: '#f06595', tint: '#3d1a2a', solid: '#a61e4d' },
	},
}

export const PALETTE_KEYS = Object.keys(PALETTE)

export function resolveColor(color: string, theme: 'light' | 'dark'): PaletteColor {
	const entry = PALETTE[color]
	if (entry) return entry[theme]
	return { stroke: color, tint: color, solid: color }
}
