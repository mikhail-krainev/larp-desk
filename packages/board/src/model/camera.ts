import { Box } from '../math/box'
import { Vec } from '../math/vec'
import { Camera } from './types'

export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 8
/** Discrete steps used by zoom in / zoom out commands. */
export const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8]

export function clampZoom(z: number) {
	return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
}

/** screen = (page + camera.xy) * camera.z */
export function screenToPage(c: Camera, p: Vec): Vec {
	return { x: p.x / c.z - c.x, y: p.y / c.z - c.y }
}
export function pageToScreen(c: Camera, p: Vec): Vec {
	return {
		x: (p.x + c.x) * c.z,
		y: (p.y + c.y) * c.z,
	}
}

/** Zooms so that the page point under `screen` stays under it. */
export function zoomAt(c: Camera, screen: Vec, z: number): Camera {
	const nz = clampZoom(z)
	const p = screenToPage(c, screen)
	return { x: screen.x / nz - p.x, y: screen.y / nz - p.y, z: nz }
}

export function fitBox(
	viewport: { w: number; h: number },
	b: Box,
	padding = 64,
	maxZoom = 1
): Camera {
	const z = clampZoom(
		Math.min(
			(viewport.w - padding * 2) / Math.max(b.w, 1),
			(viewport.h - padding * 2) / Math.max(b.h, 1),
			maxZoom
		)
	)
	return {
		x: viewport.w / 2 / z - (b.x + b.w / 2),
		y: viewport.h / 2 / z - (b.y + b.h / 2),
		z,
	}
}

export function viewportPageBounds(c: Camera, viewport: { w: number; h: number }): Box {
	const tl = screenToPage(c, { x: 0, y: 0 })
	return { x: tl.x, y: tl.y, w: viewport.w / c.z, h: viewport.h / c.z }
}

export function nextZoomStep(z: number, dir: 1 | -1) {
	if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 1e-6) ?? MAX_ZOOM
	return [...ZOOM_STEPS].reverse().find((s) => s < z - 1e-6) ?? MIN_ZOOM
}
