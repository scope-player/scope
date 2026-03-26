<script lang="ts" module>
	function lightenColor(hex: string, amount: number): string {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		const nr = Math.min(255, Math.round(r + (255 - r) * amount));
		const ng = Math.min(255, Math.round(g + (255 - g) * amount));
		const nb = Math.min(255, Math.round(b + (255 - b) * amount));
		return `rgb(${nr}, ${ng}, ${nb})`;
	}

	function darkenColor(hex: string, amount: number): string {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		const nr = Math.max(0, Math.round(r * (1 - amount)));
		const ng = Math.max(0, Math.round(g * (1 - amount)));
		const nb = Math.max(0, Math.round(b * (1 - amount)));
		return `rgb(${nr}, ${ng}, ${nb})`;
	}
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getAuth, logout } from '$lib/stores/auth.svelte';
	import { getCommandPalette } from '$lib/stores/commandPalette.svelte';

	const auth = getAuth();
	const palette = getCommandPalette();

	let pathname = $state('/');
	let mobileOpen = $state(false);
	let avatarMenuOpen = $state(false);
	let avatarMenuEl = $state<HTMLDivElement | null>(null);
	let navPillsHeight = $state(0);
	let avatarColor = $derived('#6366f1');

	$effect(() => {
		const unsub = page.subscribe(p => {
			pathname = p.url.pathname;
		});
		return unsub;
	});

	$effect(() => {
		if (!avatarMenuOpen) return;
		function handleClick(e: MouseEvent) {
			if (avatarMenuEl && !avatarMenuEl.contains(e.target as Node)) {
				avatarMenuOpen = false;
			}
		}
		document.addEventListener('click', handleClick, true);
		return () => document.removeEventListener('click', handleClick, true);
	});

	function isActive(path: string, exact = false) {
		return exact ? pathname === path : pathname.startsWith(path);
	}

	async function handleLogout() {
		avatarMenuOpen = false;
		mobileOpen = false;
		await logout();
		goto('/login');
	}

	const navLinks = [
		{ href: '/', label: 'Home', exact: true },
		{ href: '/discover/movie', label: 'Movies' },
		{ href: '/discover/series', label: 'TV Shows' },
		{ href: '/library', label: 'Library', exact: true },
	];
</script>

	<nav class="fixed top-0 left-0 right-0 z-50">
		<!-- Progressive blur layer -->
		<div class="nav-blur-layer pointer-events-none absolute left-0 w-full top-0 select-none"></div>
		<div class="pointer-events-none absolute left-0 w-full top-0 select-none" style="height: 120px; background: linear-gradient(to bottom, #0c0a09 0%, rgba(12,10,9,0.8) 25%, transparent 100%);"></div>

		<!-- Nav content -->
		<div class="relative mx-auto flex max-w-7xl items-center h-16 px-6 md:px-8">
			<!-- Left: Logo -->
			<div class="flex items-center shrink-0">
				<a href="/" class="flex items-center gap-2.5 text-base font-semibold tracking-tight text-text">
					<svg width="22" height="22" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M50 5 L90 27.5 V72.5 L50 95 L10 72.5 V27.5 Z" fill="url(#scope-nav-grad)" />
						<path d="M40 30 L72 50 L40 70 Z" fill="white" />
						<defs>
							<linearGradient id="scope-nav-grad" x1="50" y1="5" x2="50" y2="95" gradientUnits="userSpaceOnUse">
								<stop stop-color="#8B5CF6"/>
								<stop offset="1" stop-color="#6D28D9"/>
							</linearGradient>
						</defs>
					</svg>
					Scope
				</a>
			</div>

			<!-- Center: Nav pills + Search (desktop only) -->
			<div class="hidden md:flex flex-1 items-center justify-center gap-2.5">
				<div class="nav-island inline-flex gap-0.5 p-1 rounded-full" bind:clientHeight={navPillsHeight}>
					{#each navLinks as link}
						<a
							href={link.href}
							class="nav-pill {isActive(link.href, link.exact) ? 'nav-pill-active' : ''}"
						>{link.label}</a>
					{/each}
				</div>
				<button
					onclick={() => palette.toggle()}
					class="nav-island search-island"
					style="width: {navPillsHeight}px; height: {navPillsHeight}px;"
					aria-label="Search"
					title="Search (⌘K)"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-text-secondary"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
				</button>
			</div>

			<!-- Right: Avatar + Hamburger -->
			<div class="flex items-center gap-3 ml-auto shrink-0">
				<!-- Mobile search -->
				<button
					onclick={() => palette.toggle()}
					class="md:hidden rounded-full p-2 text-text-secondary hover:text-text transition"
					aria-label="Search"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
				</button>

				<!-- Avatar + dropdown -->
				<div class="relative" bind:this={avatarMenuEl}>
					<button
						onclick={() => avatarMenuOpen = !avatarMenuOpen}
						class="relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white avatar-ring transition-all duration-200 overflow-hidden"
						aria-label="Profile menu"
					>
						<div
							class="absolute inset-0"
							style="background: linear-gradient(180deg, {lightenColor(avatarColor, 0.2)} 0%, {avatarColor} 50%, {darkenColor(avatarColor, 0.3)} 100%)"
						></div>
						<div class="absolute inset-0" style="background: radial-gradient(ellipse at 35% 25%, rgba(255,255,255,0.25) 0%, transparent 60%)"></div>
						<span class="relative z-10">{auth.isAuthenticated ? (auth.user?.email ?? '?').charAt(0).toUpperCase() : '?'}</span>
					</button>

					{#if avatarMenuOpen}
						<div class="nav-dropdown absolute right-0 top-full mt-2 min-w-[200px] rounded-xl p-1.5" style="background: rgba(20, 18, 16, 0.97); backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px); border: 1px solid rgba(231,229,228,0.1); box-shadow: 0 16px 48px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06);">
							{#if auth.isAuthenticated}
								<div class="px-3 py-2.5 border-b border-[rgba(231,229,228,0.06)] mb-1">
									<p class="text-sm font-medium text-text">{auth.user?.email ?? 'Account'}</p>
								</div>
							{/if}
							<a href="/settings" onclick={() => avatarMenuOpen = false}
								class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary transition-all hover:bg-[rgba(231,229,228,0.06)] hover:text-text">
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
								Settings
							</a>
							<a href="https://github.com/scope-player/scope" target="_blank" rel="noopener noreferrer"
								class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary transition-all hover:bg-[rgba(231,229,228,0.06)] hover:text-text">
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
								GitHub
							</a>
							<div class="mt-1 border-t border-[rgba(231,229,228,0.06)] pt-1">
								{#if auth.isAuthenticated}
									<button onclick={handleLogout}
										class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary transition-all hover:bg-[rgba(231,229,228,0.06)] hover:text-text">
										<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
										Sign Out
									</button>
								{:else}
									<a href="/login" onclick={() => avatarMenuOpen = false}
										class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary transition-all hover:bg-[rgba(231,229,228,0.06)] hover:text-text">
										<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
										Sign In
									</a>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- Hamburger: MOBILE ONLY -->
				<button
					onclick={() => mobileOpen = !mobileOpen}
					class="hamburger md:hidden"
					class:hamburger-active={mobileOpen}
					aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
				>
					<span class="hamburger-line hamburger-line-1"></span>
					<span class="hamburger-line hamburger-line-2"></span>
					<span class="hamburger-line hamburger-line-3"></span>
				</button>
			</div>
		</div>
	</nav>

	<!-- Mobile slide panel -->
	<div class="md:hidden mobile-menu fixed inset-0 z-40" class:mobile-menu-open={mobileOpen} class:mobile-menu-closed={!mobileOpen}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="mobile-backdrop absolute inset-0" onclick={() => mobileOpen = false} onkeydown={(e) => e.key === 'Escape' && (mobileOpen = false)}></div>
		<div class="mobile-panel absolute bottom-0 left-0 right-0">
			<div class="flex justify-center pt-3 pb-2">
				<div class="w-8 h-1 rounded-full" style="background: rgba(231, 229, 228, 0.15);"></div>
			</div>
			<nav class="px-6 pt-2 pb-6">
				{#each navLinks as link}
					<a
						href={link.href}
						onclick={() => mobileOpen = false}
						class="mobile-nav-item"
						class:mobile-nav-active={isActive(link.href, link.exact)}
					>
						<span>{link.label}</span>
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor" class="mobile-nav-arrow"><path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z"/></svg>
					</a>
				{/each}
				{#if auth.user?.is_admin}
					<a href="/admin" onclick={() => mobileOpen = false} class="mobile-nav-item" class:mobile-nav-active={isActive('/admin')}>
						<span>Admin</span>
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor" class="mobile-nav-arrow"><path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z"/></svg>
					</a>
				{/if}

				<button
					onclick={() => { palette.toggle(); mobileOpen = false; }}
					class="mt-4 w-full btn-primary rounded-xl px-4 py-3 text-sm font-medium text-center"
				>Search</button>

				<button onclick={handleLogout}
					class="mt-2 w-full rounded-xl px-4 py-3 text-sm text-text-muted text-center transition hover:text-text"
				>Sign Out</button>
			</nav>
		</div>
	</div>

<style>
	.nav-blur-layer {
		height: 120px;
		mask-image: linear-gradient(to bottom, black 0%, black 15%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.2) 70%, transparent 100%);
		-webkit-mask-image: linear-gradient(to bottom, black 0%, black 15%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.2) 70%, transparent 100%);
		backdrop-filter: blur(12px) saturate(1.2);
		-webkit-backdrop-filter: blur(12px) saturate(1.2);
	}

	.nav-island {
		background: rgba(12, 10, 9, 0.6);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(231, 229, 228, 0.08);
		box-shadow:
			0px 1px 3px rgba(0, 0, 0, 0.3),
			inset 0 1px 0 rgba(255, 255, 255, 0.04),
			inset 0 -1px 2px rgba(0, 0, 0, 0.2);
	}

	.search-island {
		border-radius: 9999px;
		display: grid;
		place-items: center;
		cursor: pointer;
		padding: 0;
		flex-shrink: 0;
		transition: all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
	}
	.search-island:hover {
		background: rgba(231, 229, 228, 0.08);
	}
	.search-island:hover svg {
		color: var(--color-text);
	}

	.nav-pill {
		font-size: 0.8125rem;
		padding: 0.375rem 0.875rem;
		border-radius: 9999px;
		border: 1px solid transparent;
		color: var(--color-text-secondary);
		transition: all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
		white-space: nowrap;
		text-decoration: none;
	}

	.nav-pill:hover {
		background: rgba(231, 229, 228, 0.04);
		color: var(--color-text);
	}

	.nav-pill-active {
		background: rgba(231, 229, 228, 0.08) !important;
		border-color: rgba(231, 229, 228, 0.08) !important;
		color: var(--color-text) !important;
		font-weight: 600;
		box-shadow: 0px 1px 2px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(231, 229, 228, 0.06);
	}

	.nav-dropdown {
		animation: dropdownIn 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
	}
	@keyframes dropdownIn {
		from { opacity: 0; transform: translateY(-4px) scale(0.97); }
		to { opacity: 1; transform: translateY(0) scale(1); }
	}

	.hamburger {
		width: 24px;
		height: 24px;
		position: relative;
	}
	.hamburger-line {
		position: absolute;
		left: 2px;
		top: 50%;
		width: 20px;
		height: 1.5px;
		background: var(--color-text);
		border-radius: 1px;
		transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
	}
	.hamburger-line-1 { transform: translateY(calc(-50% - 6px)); }
	.hamburger-line-2 { transform: translateY(-50%); }
	.hamburger-line-3 { transform: translateY(calc(-50% + 6px)); }
	.hamburger-active .hamburger-line-1 { transform: translateY(-50%) rotate(45deg); }
	.hamburger-active .hamburger-line-2 { opacity: 0; transform: translateY(-50%) scaleX(0); }
	.hamburger-active .hamburger-line-3 { transform: translateY(-50%) rotate(-45deg); }

	.mobile-menu { pointer-events: none; }
	.mobile-menu-open { pointer-events: auto; }

	.mobile-backdrop {
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		opacity: 0;
		transition: opacity 0.3s ease;
	}
	.mobile-menu-open .mobile-backdrop { opacity: 1; }
	.mobile-menu-closed .mobile-backdrop { pointer-events: none; }

	.mobile-panel {
		background: #1a1714;
		border-top: 1px solid rgba(231, 229, 228, 0.08);
		border-radius: 1.25rem 1.25rem 0 0;
		transform: translateY(100%);
		transition: transform 0.35s cubic-bezier(0.23, 1, 0.32, 1);
		box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.4);
	}
	.mobile-menu-open .mobile-panel { transform: translateY(0); }

	.mobile-nav-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 0;
		border-bottom: 1px solid rgba(231, 229, 228, 0.06);
		text-decoration: none;
		font-size: 1rem;
		color: var(--color-text-secondary);
		transition: all 0.2s;
	}
	.mobile-nav-item:last-of-type { border-bottom: none; }
	.mobile-nav-item:hover, .mobile-nav-active { color: var(--color-text); }
	.mobile-nav-active { font-weight: 500; }

	.mobile-nav-arrow {
		color: var(--color-text-muted);
		opacity: 0.4;
		transition: all 0.2s;
	}
	.mobile-nav-item:hover .mobile-nav-arrow {
		opacity: 0.7;
		transform: translateX(2px);
	}

	@supports (padding-bottom: env(safe-area-inset-bottom)) {
		.mobile-panel nav {
			padding-bottom: calc(1.5rem + env(safe-area-inset-bottom));
		}
	}
</style>
