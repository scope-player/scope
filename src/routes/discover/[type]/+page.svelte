<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getCatalog, getManifest, type StremioMeta } from '$lib/api/stremio';
	import MediaCard from '$lib/components/MediaCard.svelte';

	let type = $state<'movie' | 'series'>('movie');
	let currentCatalog = $state<'top' | 'imdbRating'>('top');
	let currentGenre = $state<string | null>(null);
	let items = $state<StremioMeta[]>([]);
	let skip = $state(0);
	let loadingMore = $state(false);
	let loading = $state(true);
	let genres = $state<string[]>([]);

	let pageTitle = $derived(type === 'series' ? 'TV Shows' : 'Movies');

	$effect(() => {
		const unsub = page.subscribe((p) => {
			const t = p.params.type as 'movie' | 'series';
			if (t !== type) {
				type = t;
				currentCatalog = 'top';
				currentGenre = null;
				skip = 0;
				items = [];
				fetchGenres();
				fetchItems(false);
			}
		});
		return unsub;
	});

	function buildExtra(): string {
		const parts: string[] = [];
		if (currentGenre) parts.push(`genre=${encodeURIComponent(currentGenre)}`);
		if (skip > 0) parts.push(`skip=${skip}`);
		return parts.join('&');
	}

	async function fetchGenres() {
		try {
			const manifest = await getManifest('https://v3-cinemeta.strem.io/manifest.json');
			const catalog = manifest.catalogs.find(
				(c) => c.type === type && c.id === 'top'
			);
			const genreExtra = catalog?.extra?.find((e) => e.name === 'genre');
			genres = genreExtra?.options ?? [];
		} catch {
			genres = [];
		}
	}

	async function fetchItems(append: boolean) {
		if (append) {
			loadingMore = true;
		} else {
			loading = true;
		}

		try {
			const extra = buildExtra();
			const results = await getCatalog(type, currentCatalog, extra || undefined);
			if (append) {
				items = [...items, ...results];
			} else {
				items = results;
			}
		} catch {
			if (!append) items = [];
		}

		loading = false;
		loadingMore = false;
	}

	function selectCatalog(catalog: 'top' | 'imdbRating') {
		if (catalog === currentCatalog) return;
		currentCatalog = catalog;
		currentGenre = null;
		skip = 0;
		items = [];
		fetchItems(false);
	}

	function selectGenre(genre: string | null) {
		if (genre === currentGenre) return;
		currentGenre = genre;
		skip = 0;
		items = [];
		fetchItems(false);
	}

	function loadMore() {
		skip += 50;
		fetchItems(true);
	}

	onMount(() => {
		fetchGenres();
		fetchItems(false);
	});
</script>

<svelte:head>
	<title>{pageTitle} - Scope</title>
</svelte:head>

<div class="px-6 py-8 md:px-12 lg:px-16">
	<!-- Page title -->
	<h1 class="mb-6 text-3xl font-bold tracking-tight text-text">{pageTitle}</h1>

	<!-- Catalog tabs -->
	<div class="mb-5 flex gap-2">
		<button
			onclick={() => selectCatalog('top')}
			class="rounded-full px-4 py-2 text-sm font-medium transition-all {currentCatalog === 'top'
				? 'bg-white/10 text-text border border-border'
				: 'text-text-secondary hover:text-text hover:bg-white/5 border border-transparent'}"
		>
			Popular
		</button>
		<button
			onclick={() => selectCatalog('imdbRating')}
			class="rounded-full px-4 py-2 text-sm font-medium transition-all {currentCatalog === 'imdbRating'
				? 'bg-white/10 text-text border border-border'
				: 'text-text-secondary hover:text-text hover:bg-white/5 border border-transparent'}"
		>
			Featured
		</button>
	</div>

	<!-- Genre chips -->
	{#if genres.length > 0}
		<div class="scrollbar-hide -mx-6 mb-6 flex gap-2 overflow-x-auto px-6">
			<button
				onclick={() => selectGenre(null)}
				class="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all {currentGenre === null
					? 'bg-white/10 text-text border border-border'
					: 'text-text-muted hover:text-text-secondary border border-transparent hover:bg-white/5'}"
			>
				All
			</button>
			{#each genres as genre}
				<button
					onclick={() => selectGenre(genre)}
					class="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all {currentGenre === genre
						? 'bg-white/10 text-text border border-border'
						: 'text-text-muted hover:text-text-secondary border border-transparent hover:bg-white/5'}"
				>
					{genre}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Loading skeleton -->
	{#if loading && items.length === 0}
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
			{#each Array(18) as _}
				<div class="flex flex-col gap-2">
					<div class="aspect-[2/3] w-full shimmer rounded-xl bg-surface"></div>
					<div class="h-4 w-3/4 shimmer rounded bg-surface"></div>
					<div class="h-3 w-1/2 shimmer rounded bg-surface"></div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Media grid -->
	{#if items.length > 0}
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
			{#each items as item, i (item.id)}
				<div class="card-fade-in" style="animation-delay: {i * 30}ms">
					<MediaCard {item} onclick={() => goto(`/detail/${item.type}/${item.id}`)} />
				</div>
			{/each}
		</div>

		<!-- Load More -->
		<div class="mt-10 flex justify-center">
			<button
				onclick={loadMore}
				disabled={loadingMore}
				class="btn-stroke rounded-full px-8 py-2.5 text-sm font-medium transition-all disabled:opacity-50"
			>
				{#if loadingMore}
					<span class="flex items-center gap-2">
						<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
						</svg>
						Loading...
					</span>
				{:else}
					Load More
				{/if}
			</button>
		</div>
	{/if}

	<!-- Empty state -->
	{#if !loading && items.length === 0}
		<div class="flex flex-col items-center justify-center gap-3 py-20 text-center">
			<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
				<circle cx="12" cy="12" r="10"></circle>
				<path d="M8 12h8"></path>
			</svg>
			<p class="text-text-muted">No items found. Try a different catalog or genre.</p>
		</div>
	{/if}
</div>
