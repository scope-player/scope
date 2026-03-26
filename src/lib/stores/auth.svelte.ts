import { stremioLogin, stremioGetUser } from '$lib/api/stremio';
import { toast } from 'svelte-sonner';

interface StremioUser {
	_id: string;
	email: string;
	[key: string]: any;
}

let authKey = $state<string | null>(null);
let user = $state<StremioUser | null>(null);
let isAuthenticated = $state(false);

function loadFromStorage() {
	const stored = localStorage.getItem('stremio_auth');
	if (stored) {
		try {
			const parsed = JSON.parse(stored);
			authKey = parsed.authKey;
			user = parsed.user;
			isAuthenticated = !!parsed.authKey;
		} catch {
			localStorage.removeItem('stremio_auth');
		}
	}
}

function saveToStorage() {
	localStorage.setItem('stremio_auth', JSON.stringify({ authKey, user }));
}

export function getAuth() {
	return {
		get authKey() { return authKey; },
		get user() { return user; },
		get isAuthenticated() { return isAuthenticated; },
	};
}

export function getAuthKey(): string | null {
	return authKey;
}

export function initAuth() {
	loadFromStorage();
	// Refresh user info if we have a key
	if (authKey) {
		stremioGetUser(authKey).then((u: any) => {
			user = u;
			saveToStorage();
		}).catch(() => {
			toast.error('Failed to refresh account info');
		});
	}
}

export async function login(email: string, password: string) {
	const res = await stremioLogin(email, password);
	authKey = res.authKey;
	isAuthenticated = true;

	const u = await stremioGetUser(authKey!);
	user = u;
	saveToStorage();
}

export function logout() {
	authKey = null;
	user = null;
	isAuthenticated = false;
	localStorage.removeItem('stremio_auth');
}
