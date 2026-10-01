export interface Vec {
	x: number
	y: number
}

export function vec(x = 0, y = 0): Vec {
	return { x, y }
}

export function add(a: Vec, b: Vec): Vec {
	return { x: a.x + b.x, y: a.y + b.y }
}
export function sub(a: Vec, b: Vec): Vec {
	return { x: a.x - b.x, y: a.y - b.y }
}
export function mul(a: Vec, s: number): Vec {
	return { x: a.x * s, y: a.y * s }
}
export function dot(a: Vec, b: Vec) {
	return a.x * b.x + a.y * b.y
}
export function cross(a: Vec, b: Vec) {
	return a.x * b.y - a.y * b.x
}
export function len(a: Vec) {
	return Math.hypot(a.x, a.y)
}
export function dist(a: Vec, b: Vec) {
	return Math.hypot(a.x - b.x, a.y - b.y)
}
export function lerp(a: Vec, b: Vec, t: number): Vec {
	return {
		x: a.x + (b.x - a.x) * t,
		y: a.y + (b.y - a.y) * t,
	}
}
export function eq(a: Vec, b: Vec, eps = 1e-9) {
	return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps
}

export function norm(a: Vec): Vec {
	const l = len(a)
	return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}

export function rotate(a: Vec, angle: number, origin: Vec = { x: 0, y: 0 }): Vec {
	if (angle === 0) return { x: a.x, y: a.y }
	const s = Math.sin(angle)
	const c = Math.cos(angle)
	const dx = a.x - origin.x
	const dy = a.y - origin.y
	return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c }
}

export function angleOf(from: Vec, to: Vec) {
	return Math.atan2(to.y - from.y, to.x - from.x)
}

/** Snaps an angle to the nearest multiple of `step`. */
export function snapAngle(angle: number, step: number) {
	return Math.round(angle / step) * step
}

export function normalizeAngle(angle: number) {
	const t = angle % (Math.PI * 2)
	return t < 0 ? t + Math.PI * 2 : t
}
