const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** 16 random base-62 chars: ~95 bits, enough that peers can mint ids without coordinating. */
export function uid(size = 16) {
	const bytes = new Uint8Array(size)
	crypto.getRandomValues(bytes)
	let out = ''
	for (let i = 0; i < size; i++) out += ALPHABET[bytes[i] % 62]
	return out
}

/** Shapes are plain JSON, so a JSON round trip is a complete deep copy. */
export function deepClone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value))
}
