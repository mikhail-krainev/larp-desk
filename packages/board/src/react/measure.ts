import { LINE_HEIGHT } from '../model/shapes'

export const FONT_FAMILY = `'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif`

let ctx: CanvasRenderingContext2D | null = null

/**
 * Canvas-based text measurement. Wrapping mirrors the renderer's CSS (`white-space: pre-wrap;
 * overflow-wrap: anywhere`): break at spaces, and break inside a word only when the word alone
 * is wider than the line.
 */
export function measureTextCanvas(text: string, fontSize: number, maxWidth?: number) {
	if (!ctx) {
		const canvas = document.createElement('canvas')
		ctx = canvas.getContext('2d')
		// jsdom has no canvas; fall back to an estimate rather than crash.
		if (!ctx) return estimate(text, fontSize, maxWidth)
	}
	ctx.font = `${fontSize}px ${FONT_FAMILY}`
	let widest = 0
	let lines = 0
	for (const para of text.split('\n')) {
		if (maxWidth === undefined) {
			widest = Math.max(widest, ctx.measureText(para).width)
			lines++
			continue
		}
		let line = ''
		for (const word of para.split(/(?<= )/)) {
			const candidate = line + word
			if (ctx.measureText(candidate.trimEnd()).width <= maxWidth || line === '') {
				line = candidate
			} else {
				widest = Math.max(widest, ctx.measureText(line.trimEnd()).width)
				lines++
				line = word
			}
			while (ctx.measureText(line.trimEnd()).width > maxWidth && line.length > 1) {
				let cut = line.length - 1
				while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut--
				widest = Math.max(widest, ctx.measureText(line.slice(0, cut)).width)
				lines++
				line = line.slice(cut)
			}
		}
		widest = Math.max(widest, ctx.measureText(line.trimEnd()).width)
		lines++
	}
	return { w: Math.ceil(widest) + 1, h: Math.max(1, lines) * fontSize * LINE_HEIGHT }
}

function estimate(text: string, fontSize: number, maxWidth?: number) {
	const lines = text.split('\n')
	const w = Math.max(...lines.map((l) => l.length)) * fontSize * 0.56
	const wrapped = maxWidth ? Math.max(1, Math.ceil(w / maxWidth)) : 1
	return {
		w: maxWidth ? Math.min(w, maxWidth) : w,
		h: lines.length * wrapped * fontSize * LINE_HEIGHT,
	}
}
