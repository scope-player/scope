// Stremio Addon Protocol Client

const CINEMETA_BASE = 'https://v3-cinemeta.strem.io';
const STREMIO_API = 'https://api.strem.io/api';
const DEFAULT_SERVER = 'http://127.0.0.1:11470';
const SERVER_URL_KEY = 'stremio_server_url';

export function getServerUrl(): string {
	if (typeof localStorage === 'undefined') return DEFAULT_SERVER;
	return localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER;
}

export function setServerUrl(url: string) {
	const cleaned = url.replace(/\/+$/, '');
	localStorage.setItem(SERVER_URL_KEY, cleaned);
}

export function resetServerUrl() {
	localStorage.removeItem(SERVER_URL_KEY);
}

export interface StremioMeta {
	id: string;
	imdb_id: string;
	type: 'movie' | 'series';
	name: string;
	poster: string;
	background: string;
	logo: string;
	description: string;
	releaseInfo: string;
	year: string;
	runtime: string;
	imdbRating: string;
	genre: string[];
	genres: string[];
	country: string;
	cast: string[];
	director: string[];
	writer: string[];
	moviedb_id: number;
	popularity: number;
	trailers: { source: string; type: string }[];
	trailerStreams: { title: string; ytId: string }[];
	behaviorHints: {
		defaultVideoId?: string;
		hasScheduledVideos?: boolean;
	};
	// Detail-only fields
	awards?: string;
	videos?: StremioVideo[];
	status?: string;
}

export interface StremioVideo {
	id: string;
	name: string;
	season: number;
	number: number;
	episode: number;
	released: string;
	firstAired: string;
	overview: string;
	description: string;
	thumbnail: string;
	tvdb_id: number;
	rating: string;
}

export interface StremioStream {
	name: string;
	title: string;
	url?: string;
	ytId?: string;
	infoHash?: string;
	fileIdx?: number;
	externalUrl?: string;
	subtitles?: { id: string; url: string; lang: string }[];
	behaviorHints?: {
		bingeGroup?: string;
		filename?: string;
		notWebReady?: boolean;
	};
}

export interface AddonManifest {
	id: string;
	version: string;
	name: string;
	description: string;
	logo?: string;
	resources: string[];
	types: string[];
	catalogs: {
		type: string;
		id: string;
		name: string;
		extra?: { name: string; options?: string[]; isRequired?: boolean }[];
	}[];
}

// ─── Cinemeta (catalogs, meta, search) ───

async function fetchJson<T>(url: string): Promise<T> {
	const res = await fetch(url, { redirect: 'follow' });
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	return res.json();
}

export async function getCatalog(type: 'movie' | 'series', catalogId: string, extra?: string): Promise<StremioMeta[]> {
	const extraPath = extra ? `/${extra}` : '';
	const { metas } = await fetchJson<{ metas: StremioMeta[] }>(
		`${CINEMETA_BASE}/catalog/${type}/${catalogId}${extraPath}.json`
	);
	return metas;
}

export async function searchCatalog(type: 'movie' | 'series', query: string): Promise<StremioMeta[]> {
	const { metas } = await fetchJson<{ metas: StremioMeta[] }>(
		`${CINEMETA_BASE}/catalog/${type}/top/search=${encodeURIComponent(query)}.json`
	);
	return metas;
}

export async function search(query: string): Promise<StremioMeta[]> {
	const [movies, series] = await Promise.allSettled([
		searchCatalog('movie', query),
		searchCatalog('series', query),
	]);

	const results: StremioMeta[] = [];
	if (movies.status === 'fulfilled') results.push(...movies.value);
	if (series.status === 'fulfilled') results.push(...series.value);

	// Interleave results by relevance (name match priority)
	const q = query.toLowerCase();
	results.sort((a, b) => {
		const aExact = a.name.toLowerCase().includes(q) ? 0 : 1;
		const bExact = b.name.toLowerCase().includes(q) ? 0 : 1;
		if (aExact !== bExact) return aExact - bExact;
		return (b.popularity || 0) - (a.popularity || 0);
	});

	return results;
}

export async function getMeta(type: 'movie' | 'series', id: string): Promise<StremioMeta> {
	const { meta } = await fetchJson<{ meta: StremioMeta }>(
		`${CINEMETA_BASE}/meta/${type}/${id}.json`
	);
	return meta;
}

// ─── Streams (from any addon) ───

export async function getStreams(addonUrl: string, type: 'movie' | 'series', id: string): Promise<StremioStream[]> {
	const base = addonUrl.replace(/\/manifest\.json$/, '');
	const { streams } = await fetchJson<{ streams: StremioStream[] }>(
		`${base}/stream/${type}/${id}.json`
	);
	return streams;
}

export interface StremioSubtitle {
	id: string;
	url: string;
	lang: string;
	SubEncoding?: string;
}

export async function getSubtitles(addonUrl: string, type: 'movie' | 'series', id: string): Promise<StremioSubtitle[]> {
	const base = addonUrl.replace(/\/manifest\.json$/, '');
	try {
		const { subtitles } = await fetchJson<{ subtitles: StremioSubtitle[] }>(
			`${base}/subtitles/${type}/${id}.json`
		);
		return subtitles || [];
	} catch {
		return [];
	}
}

// ─── Stremio Server (localhost:11470) ───

export function getServerStreamUrl(infoHash: string, fileIdx: number): string {
	return `${getServerUrl()}/${infoHash}/${fileIdx}`;
}

export function getServerHlsUrl(infoHash: string, fileIdx: number): string {
	return `${getServerUrl()}/hlsv2/${infoHash}/${fileIdx}/master.m3u8`;
}

export async function getTorrentStats(infoHash: string): Promise<any> {
	return fetchJson(`${getServerUrl()}/${infoHash}/stats.json`);
}

export async function serverHeartbeat(): Promise<boolean> {
	try {
		const res = await fetch(`${getServerUrl()}/heartbeat`, { redirect: 'follow' });
		return res.ok;
	} catch {
		return false;
	}
}

// ─── Stremio Cloud API (auth, library, addons) ───

async function stremioApi<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
	const res = await fetch(`${STREMIO_API}/${endpoint}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	const data = await res.json();
	if (data.error) {
		const msg = typeof data.error === 'string' ? data.error : (data.error?.message || JSON.stringify(data.error));
		throw new Error(msg);
	}
	return data.result;
}

export async function stremioLogin(email: string, password: string): Promise<{ authKey: string }> {
	return stremioApi('login', { email, password });
}

export async function stremioGetUser(authKey: string): Promise<any> {
	return stremioApi('getUser', { authKey });
}

export async function getInstalledAddons(authKey: string = ''): Promise<{ addons: { manifest: AddonManifest; transportUrl: string; flags: any }[] }> {
	return stremioApi('addonCollectionGet', { authKey, update: true });
}

export async function getLibraryMeta(authKey: string): Promise<[string, number][]> {
	const res = await fetch(`${STREMIO_API}/datastoreMeta`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ authKey, collection: 'libraryItem' }),
	});
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	const data = await res.json();
	if (data.error) {
		const msg = typeof data.error === 'string' ? data.error : (data.error?.message || JSON.stringify(data.error));
		throw new Error(msg);
	}
	return data.result ?? [];
}

export async function getLibrary(authKey: string): Promise<any[]> {
	const res = await fetch(`${STREMIO_API}/datastoreGet`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			authKey,
			collection: 'libraryItem',
			all: true,
			ids: [],
		}),
	});
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	const data = await res.json();
	if (data.error) {
		const msg = typeof data.error === 'string' ? data.error : (data.error?.message || JSON.stringify(data.error));
		throw new Error(msg);
	}
	return data.result ?? data;
}

// ─── Addon manifest ───

export async function getManifest(addonUrl: string): Promise<AddonManifest> {
	const url = addonUrl.endsWith('/manifest.json') ? addonUrl : `${addonUrl}/manifest.json`;
	return fetchJson<AddonManifest>(url);
}
