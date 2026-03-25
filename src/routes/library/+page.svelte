<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getLibraryStore, loadLibrary, getContinueWatching, getMovies, getSeries } from '$lib/stores/library.svelte';
	import { getAuth, getAuthKey } from '$lib/stores/auth.svelte';

	const auth = getAuth();
	const library = getLibraryStore();

	let activeTab = $state<'all' | 'movies' | 'series'>('all');

	let continueWatching = $derived(getContinueWatching());

	let filteredItems = $derived.by(() => {
		switch (activeTab) {
			case 'movies':
				return getMovies();
			case 'series':
				return getSeries();
			default:
				return library.items;
		}
	});

	onMount(() => {
		if (auth.isAuthenticated) {
			const key = getAuthKey();
			if (key) loadLibrary(key);
		}
	});

	function formatProgress(item: any): string {
		const s = item.state;
		if (!s?.timeOffset || !s?.duration) return '';
		const pct = Math.round((s.timeOffset / s.duration) * 100);
		return `${pct}%`;
	}
</script>

<svelte:head>
	<title>Library - Scope</title>
</svelte:head>

<div class="px-6 py-8 md:px-12 lg:px-16">
	<h1 class="mb-6 text-3xl font-bold tracking-tight text-text">Library</h1>

	<!-- Not authenticated -->
	{#if !auth.isAuthenticated}
		<div class="flex flex-col items-center justify-center gap-4 py-24 text-center">
			<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
				<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
				<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
			</svg>
			<h2 class="text-xl font-semibold text-text">Sign in to access your library</h2>
			<p class="max-w-sm text-sm text-text-muted">
				Your library syncs across devices when you sign in with your account.
			</p>
			<a
				href="/login"
				class="btn-highlight mt-2 rounded-full px-6 py-2.5 text-sm font-medium transition-all"
			>
				Sign In
			</a>
		</div>
	{:else}
		<!-- Loading -->
		{#if library.loading}
			<div class="flex items-center justify-center py-20">
				<svg class="h-8 w-8 animate-spin text-text-muted" viewBox="0 0 24 24" fill="none">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
				</svg>
			</div>
		{:else}
			<!-- Continue Watching -->
			{#if continueWatching.length > 0}
				<section class="mb-10">
					<h2 class="mb-4 text-lg font-semibold text-text">Continue Watching</h2>
					<div class="scrollbar-hide -mx-6 flex gap-4 overflow-x-auto px-6">
						{#each continueWatching as item (item._id)}
							<button
								onclick={() => goto(`/detail/${item.type}/${item._id}`)}
								class="group flex w-56 shrink-0 flex-col gap-2 text-left sm:w-64"
							>
								<div class="card-shadow relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-surface transition-all duration-200 group-hover:scale-[1.03] group-active:scale-[0.98]">
									{#if item.poster}
										<img
											src={item.poster}
											alt={item.name}
											class="h-full w-full object-cover"
											loading="lazy"
										/>
									{:else}
										<div class="flex h-full items-center justify-center text-sm text-text-muted">
											No Image
										</div>
									{/if}

									<!-- Play overlay -->
									<div class="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30">
										<div class="flex h-10 w-10 scale-90 items-center justify-center rounded-full bg-white/90 opacity-0 backdrop-blur transition group-hover:scale-100 group-hover:opacity-100">
											<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="black"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
										</div>
									</div>

									<!-- Progress bar -->
									{#if item.state?.timeOffset && item.state?.duration}
										<div class="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
											<div
												class="h-full bg-stone-50 transition-all"
												style="width: {(item.state.timeOffset / item.state.duration) * 100}%"
											></div>
										</div>
									{/if}
								</div>

								<div class="min-w-0 px-0.5">
									<p class="truncate text-sm font-medium transition group-hover:text-stone-100">{item.name}</p>
									<p class="text-xs text-text-muted">
										{item.type === 'series' && item.state?.season ? `S${item.state.season}:E${item.state.episode}` : ''}
										{formatProgress(item) ? ` - ${formatProgress(item)}` : ''}
									</p>
								</div>
							</button>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Tabs -->
			<div class="mb-6 flex gap-2">
				<button
					onclick={() => (activeTab = 'all')}
					class="rounded-full px-4 py-2 text-sm font-medium transition-all {activeTab === 'all'
						? 'bg-white/10 text-text border border-border'
						: 'text-text-secondary hover:text-text hover:bg-white/5 border border-transparent'}"
				>
					All
				</button>
				<button
					onclick={() => (activeTab = 'movies')}
					class="rounded-full px-4 py-2 text-sm font-medium transition-all {activeTab === 'movies'
						? 'bg-white/10 text-text border border-border'
						: 'text-text-secondary hover:text-text hover:bg-white/5 border border-transparent'}"
				>
					Movies
				</button>
				<button
					onclick={() => (activeTab = 'series')}
					class="rounded-full px-4 py-2 text-sm font-medium transition-all {activeTab === 'series'
						? 'bg-white/10 text-text border border-border'
						: 'text-text-secondary hover:text-text hover:bg-white/5 border border-transparent'}"
				>
					Series
				</button>
			</div>

			<!-- Library grid -->
			{#if filteredItems.length > 0}
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
					{#each filteredItems as item (item._id)}
						<button
							onclick={() => goto(`/detail/${item.type}/${item._id}`)}
							class="group flex w-full flex-col gap-2 text-left"
						>
							<div class="card-shadow relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-border bg-surface transition-all duration-200 group-hover:scale-[1.03] group-hover:border-[rgba(231,229,228,0.10)] group-active:scale-[0.98]">
								{#if item.poster}
									<img
										src={item.poster}
										alt={item.name}
										class="h-full w-full object-cover"
										loading="lazy"
									/>
								{:else}
									<div class="flex h-full items-center justify-center text-sm text-text-muted">
										No Image
									</div>
								{/if}
							</div>

							<div class="min-w-0">
								<p class="truncate text-sm font-medium transition group-hover:text-stone-100">{item.name}</p>
								<p class="text-xs text-text-muted">
									{item.year || ''}
									{item.type === 'series' ? ' - Series' : ''}
								</p>
							</div>
						</button>
					{/each}
				</div>
			{:else if library.loaded}
				<div class="flex flex-col items-center justify-center gap-3 py-20 text-center">
					<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
						<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
						<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
					</svg>
					<p class="text-text-muted">Your library is empty</p>
					<p class="max-w-xs text-xs text-text-muted">
						Start watching movies and series to build your library.
					</p>
					<a
						href="/discover/movie"
						class="btn-stroke mt-2 rounded-full px-5 py-2 text-sm font-medium transition-all"
					>
						Discover Content
					</a>
				</div>
			{/if}
		{/if}
	{/if}
</div>
