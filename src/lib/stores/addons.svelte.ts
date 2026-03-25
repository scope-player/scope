import { getInstalledAddons, getManifest, type AddonManifest } from '$lib/api/stremio';

export interface InstalledAddon {
	manifest: AddonManifest;
	transportUrl: string;
	flags: Record<string, any>;
}

let addons = $state<InstalledAddon[]>([]);
let loading = $state(false);
let loaded = $state(false);

const STORAGE_KEY = 'stremio_addons';

function loadFromStorage(): boolean {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			addons = JSON.parse(stored);
			loaded = true;
			return true;
		}
	} catch {}
	return false;
}

function saveToStorage() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(addons));
	} catch {}
}

export function getAddons() {
	return {
		get addons() { return addons; },
		get loading() { return loading; },
		get loaded() { return loaded; },
	};
}

export async function loadAddons(authKey: string = '') {
	// If already loaded (from storage or prior fetch), skip
	if (loaded) return;

	// Try localStorage first
	if (loadFromStorage()) return;

	loading = true;
	try {
		const res = await getInstalledAddons(authKey);
		addons = res.addons || [];
		loaded = true;
		saveToStorage();
	} catch {
		try {
			const res = await getInstalledAddons('');
			addons = res.addons || [];
			loaded = true;
			saveToStorage();
		} catch {
			addons = [];
		}
	}
	loading = false;
}

export async function refreshAddons(authKey: string = '') {
	loading = true;
	try {
		const res = await getInstalledAddons(authKey);
		addons = res.addons || [];
		loaded = true;
		saveToStorage();
	} catch {}
	loading = false;
}

export function getStreamAddons(): InstalledAddon[] {
	return addons.filter(a => {
		const resources = a.manifest.resources || [];
		return resources.some((r: any) => r === 'stream' || r?.name === 'stream');
	});
}

export function getSubtitleAddons(): InstalledAddon[] {
	return addons.filter(a => {
		const resources = a.manifest.resources || [];
		return resources.some((r: any) => r === 'subtitles' || r?.name === 'subtitles');
	});
}

export function getCatalogAddons(): InstalledAddon[] {
	return addons.filter(a => (a.manifest.catalogs?.length || 0) > 0);
}

export async function installAddon(authKey: string, addonUrl: string): Promise<AddonManifest> {
	const url = addonUrl.endsWith('/manifest.json') ? addonUrl : `${addonUrl}/manifest.json`;
	const manifest = await getManifest(url);
	const transportUrl = url;

	// Check if already installed
	const exists = addons.find(a => a.manifest.id === manifest.id);
	if (exists) throw new Error('Addon already installed');

	addons = [...addons, { manifest, transportUrl, flags: {} }];
	saveToStorage();

	// Persist to cloud if authenticated
	if (authKey) {
		await saveAddonsToCloud(authKey);
	}

	return manifest;
}

export async function removeAddon(authKey: string, addonId: string) {
	addons = addons.filter(a => a.manifest.id !== addonId);
	saveToStorage();

	if (authKey) {
		await saveAddonsToCloud(authKey);
	}
}

async function saveAddonsToCloud(authKey: string) {
	const body = {
		authKey,
		addons: addons.map(a => ({
			manifest: a.manifest,
			transportUrl: a.transportUrl,
			flags: a.flags,
		})),
	};

	const res = await fetch('https://api.strem.io/api/addonCollectionSet', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error('Failed to save addons');
}
