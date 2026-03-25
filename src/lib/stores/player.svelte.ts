import type { StremioMeta, StremioStream } from '$lib/api/stremio';

export type StreamType = 'hls' | 'direct' | 'youtube';

const STREAM_HISTORY_KEY = 'stremio_stream_history';

export interface SavedStreamChoice {
	infoHash?: string;
	fileIdx?: number;
	url?: string;
	name?: string;
	title?: string;
	addonUrl?: string;
}

let streamUrl = $state<string | null>(null);
let streamType = $state<StreamType>('direct');
let meta = $state<StremioMeta | null>(null);
let videoId = $state<string | null>(null);
let stream = $state<StremioStream | null>(null);
let subtitles = $state<{ url: string; lang: string }[]>([]);

export function getPlayer() {
	return {
		get streamUrl() { return streamUrl; },
		get streamType() { return streamType; },
		get meta() { return meta; },
		get videoId() { return videoId; },
		get stream() { return stream; },
		get subtitles() { return subtitles; },
	};
}

export function setStream(
	url: string,
	type: StreamType,
	currentMeta: StremioMeta,
	currentVideoId: string,
	currentStream: StremioStream,
	subs: { url: string; lang: string }[] = [],
) {
	streamUrl = url;
	streamType = type;
	meta = currentMeta;
	videoId = currentVideoId;
	stream = currentStream;
	subtitles = subs;

	// Save this stream choice for the media
	saveStreamChoice(currentMeta.id, currentStream);
}

export function clearStream() {
	streamUrl = null;
	streamType = 'direct';
	meta = null;
	videoId = null;
	stream = null;
	subtitles = [];
}

// ─── Stream history (remember last chosen source per media) ───

function getHistory(): Record<string, SavedStreamChoice> {
	try {
		const raw = localStorage.getItem(STREAM_HISTORY_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch { return {}; }
}

function saveStreamChoice(mediaId: string, s: StremioStream) {
	try {
		const history = getHistory();
		history[mediaId] = {
			infoHash: s.infoHash,
			fileIdx: s.fileIdx,
			url: s.url,
			name: s.name,
			title: s.title,
		};
		localStorage.setItem(STREAM_HISTORY_KEY, JSON.stringify(history));
	} catch {}
}

export function getLastStreamChoice(mediaId: string): SavedStreamChoice | null {
	const history = getHistory();
	return history[mediaId] || null;
}
