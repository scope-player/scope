import { getLibrary as fetchLibrary, getLibraryMeta } from '$lib/api/stremio';
import { toast } from 'svelte-sonner';

export interface LibraryItem {
	_id: string;
	name: string;
	type: string;
	poster: string;
	posterShape?: string;
	background?: string;
	logo?: string;
	year?: string;
	state: {
		lastWatched?: string;
		timeWatched?: number;
		timeOffset?: number;
		overallTimeWatched?: number;
		timesWatched?: number;
		flaggedWatched?: number;
		duration?: number;
		video_id?: string;
		season?: number;
		episode?: number;
		watched?: Record<string, boolean>;
		noNotif?: boolean;
	};
	removed: boolean;
	temp: boolean;
	_ctime?: string;
	_mtime?: string;
}

let items = $state<LibraryItem[]>([]);
let loading = $state(false);
let loaded = $state(false);

export function getLibraryStore() {
	return {
		get items() { return items; },
		get loading() { return loading; },
		get loaded() { return loaded; },
	};
}

export async function loadLibrary(authKey: string) {
	if (!authKey) return;
	if (loading) return;
	loading = true;
	try {
		// First check what's in the cloud via datastoreMeta
		const meta = await getLibraryMeta(authKey);
		const metaCount = meta?.length || 0;

		if (metaCount === 0) {
			items = [];
			loaded = true;
			loading = false;
			return;
		}

		// Fetch all items
		const raw = await fetchLibrary(authKey);

		let parsed: any[] = [];
		if (Array.isArray(raw)) {
			if (raw.length > 0 && Array.isArray(raw[0])) {
				parsed = raw.map((entry: any) => Array.isArray(entry) ? entry[1] : entry);
			} else {
				parsed = raw;
			}
		} else if (raw && typeof raw === 'object') {
			parsed = Object.values(raw);
		}

		// Keep all items (including temp) — filter removed UNLESS temp
		// Matches stremio-core: (!removed || temp)
		items = parsed.filter((i: any) => i && i._id && (!i.removed || i.temp)).sort((a: any, b: any) => {
			const aTime = new Date(a._mtime || 0).getTime();
			const bTime = new Date(b._mtime || 0).getTime();
			return bTime - aTime;
		});
		loaded = true;
		loading = false;
	} catch (e: any) {
		console.error('Library sync failed:', e);
		toast.error('Library sync failed');
		loaded = true;
		loading = false;
		items = [];
	}
}

export function getContinueWatching(): LibraryItem[] {
	// Matches stremio-core: type != "other" && (!removed || temp) && state.time_offset > 0
	return items.filter(i => {
		if (i.type === 'other') return false;
		if (i.removed && !i.temp) return false;
		const s = i.state;
		if (!s?.timeOffset || s.timeOffset <= 0) return false;
		// Also exclude if basically finished (>95%)
		if (s.duration && s.duration > 0 && (s.timeOffset / s.duration) > 0.95) return false;
		return true;
	}).slice(0, 20);
}

export function getMovies(): LibraryItem[] {
	return items.filter(i => i.type === 'movie');
}

export function getSeries(): LibraryItem[] {
	return items.filter(i => i.type === 'series');
}

export async function addToLibrary(authKey: string, meta: any) {
	const item: any = {
		_id: meta.id,
		name: meta.name,
		type: meta.type,
		poster: meta.poster,
		background: meta.background,
		logo: meta.logo,
		year: meta.releaseInfo || meta.year,
		state: {
			lastWatched: new Date().toISOString(),
			timeWatched: 0,
			timeOffset: 0,
			overallTimeWatched: 0,
			timesWatched: 0,
			video_id: '',
		},
		removed: false,
		temp: false,
		_ctime: new Date().toISOString(),
		_mtime: new Date().toISOString(),
	};

	// Add locally
	items = [item, ...items.filter(i => i._id !== meta.id)];

	// Persist
	if (authKey) {
		try {
			const res = await fetch('https://api.strem.io/api/datastorePut', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					authKey,
					collection: 'libraryItem',
					changes: [item],
				}),
			});
			if (!res.ok) throw new Error();
		} catch {
			toast.error('Failed to sync library — item added locally only');
		}
	}
}

export async function updateWatchProgress(
	authKey: string,
	meta: any,
	videoId: string,
	timeOffset: number,
	duration: number,
) {
	const id = meta.id || meta._id;
	const existing = items.find(i => i._id === id);
	const isFinished = duration > 0 && timeOffset / duration > 0.95;

	// Parse season/episode from videoId (format: tt1234567:1:3)
	let season: number | undefined;
	let episode: number | undefined;
	const parts = videoId.split(':');
	if (parts.length >= 3) {
		season = parseInt(parts[1], 10);
		episode = parseInt(parts[2], 10);
	}

	// For series: if episode is finished, advance to next episode
	let finalVideoId = videoId;
	let finalSeason = season;
	let finalEpisode = episode;
	let finalTimeOffset = Math.floor(timeOffset);
	let finalDuration = Math.floor(duration);

	if (isFinished && meta.type === 'series' && meta.videos?.length && season != null && episode != null) {
		const sorted = [...meta.videos]
			.filter((v: any) => v.season != null && (v.episode != null || v.number != null))
			.sort((a: any, b: any) => {
				if (a.season !== b.season) return a.season - b.season;
				return (a.episode || a.number || 0) - (b.episode || b.number || 0);
			});

		const curIdx = sorted.findIndex((v: any) => v.season === season && (v.episode || v.number) === episode);
		if (curIdx !== -1 && curIdx < sorted.length - 1) {
			const next = sorted[curIdx + 1];
			finalVideoId = next.id;
			finalSeason = next.season;
			finalEpisode = next.episode || next.number;
			finalTimeOffset = 1; // >0 so it shows in continue watching
			finalDuration = 0; // unknown until they start it — skips the 95% filter
		}
	}

	const now = new Date().toISOString();
	const prevOverall = existing?.state?.overallTimeWatched || 0;
	const prevTimeWatched = existing?.state?.timeWatched || 0;
	const timeDelta = Math.max(0, timeOffset - (existing?.state?.timeOffset || 0));

	const item: LibraryItem = {
		_id: id,
		name: meta.name || existing?.name || '',
		type: meta.type || existing?.type || 'movie',
		poster: meta.poster || existing?.poster || '',
		background: meta.background || existing?.background,
		logo: meta.logo || existing?.logo,
		year: meta.releaseInfo || meta.year || existing?.year,
		state: {
			lastWatched: now,
			timeWatched: prevTimeWatched + timeDelta,
			timeOffset: finalTimeOffset,
			overallTimeWatched: prevOverall + timeDelta,
			timesWatched: (existing?.state?.timesWatched || 0) + (isFinished ? 1 : 0),
			duration: finalDuration,
			video_id: finalVideoId,
			season: finalSeason,
			episode: finalEpisode,
			flaggedWatched: isFinished && !finalSeason ? 1 : (existing?.state?.flaggedWatched || 0),
		},
		removed: false,
		temp: false,
		_ctime: existing?._ctime || now,
		_mtime: now,
	};

	// Update locally
	items = [item, ...items.filter(i => i._id !== id)];

	// Persist to cloud
	if (authKey) {
		try {
			const res = await fetch('https://api.strem.io/api/datastorePut', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					authKey,
					collection: 'libraryItem',
					changes: [item],
				}),
			});
			if (!res.ok) throw new Error();
		} catch {
			toast.error('Failed to save watch progress to cloud');
		}
	}
}

export async function removeFromLibrary(authKey: string, itemId: string) {
	const existing = items.find(i => i._id === itemId);
	if (!existing) return;

	items = items.filter(i => i._id !== itemId);

	if (authKey) {
		try {
			const res = await fetch('https://api.strem.io/api/datastorePut', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					authKey,
					collection: 'libraryItem',
					changes: [{ ...existing, removed: true, _mtime: new Date().toISOString() }],
				}),
			});
			if (!res.ok) throw new Error();
		} catch {
			toast.error('Failed to sync removal to cloud');
		}
	}
}
