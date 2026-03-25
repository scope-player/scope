import type { StremioStream } from './stremio';

interface ScoredStream {
	stream: StremioStream;
	score: number;
}

/**
 * Ranks streams and returns the best one.
 * Prefers: 4K > 1080p > 720p > 480p, most seeds, HDR bonus.
 */
export function pickBestStream(streams: StremioStream[], serverAvailable: boolean): StremioStream | null {
	if (streams.length === 0) return null;

	const scored: ScoredStream[] = streams
		.filter(s => {
			if (s.infoHash && !serverAvailable) return false;
			if (s.externalUrl && !s.url && !s.infoHash) return false;
			return true;
		})
		.map(s => ({ stream: s, score: scoreStream(s) }));

	if (scored.length === 0) return null;

	scored.sort((a, b) => b.score - a.score);
	return scored[0].stream;
}

function scoreStream(s: StremioStream): number {
	const text = `${s.name || ''} ${s.title || ''}`.toLowerCase();
	let score = 0;

	// Quality — highest resolution wins
	if (/2160p|4k|uhd/i.test(text)) score += 100;
	else if (/1080p/i.test(text)) score += 80;
	else if (/720p/i.test(text)) score += 50;
	else if (/480p/i.test(text)) score += 20;
	else score += 30;

	// HDR / Dolby Vision
	if (/hdr|dolby.?vision|dv/i.test(text)) score += 15;

	// Seeds
	const seedMatch = text.match(/👤\s*(\d+)/);
	if (seedMatch) {
		score += Math.min(parseInt(seedMatch[1], 10), 50);
	}

	// Prefer torrents
	if (s.infoHash) score += 10;

	// Penalize cam/screener
	if (/cam|hdcam|ts|telesync|screener|scr/i.test(text)) score -= 100;

	return score;
}
