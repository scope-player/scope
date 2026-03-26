<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getCatalog, getMeta, type StremioMeta } from '$lib/api/stremio';
	import { getAuth, getAuthKey } from '$lib/stores/auth.svelte';
	import { getLibraryStore, loadLibrary, getContinueWatching, type LibraryItem } from '$lib/stores/library.svelte';
	import HeroBanner from '$lib/components/HeroBanner.svelte';
	import MediaRow from '$lib/components/MediaRow.svelte';
	import StreamModal from '$lib/components/StreamModal.svelte';

	const auth = getAuth();
	const library = getLibraryStore();

	let showResumeStream = $state(false);
	let resumeItem = $state<LibraryItem | null>(null);
	let resumeMeta = $state<StremioMeta | null>(null);

	async function handleContinueWatching(item: LibraryItem) {
		// Fetch full meta, then open stream modal
		resumeItem = item;
		try {
			resumeMeta = await getMeta(item.type as 'movie' | 'series', item._id);
		} catch {
			// Fallback: construct minimal meta
			resumeMeta = { id: item._id, type: item.type, name: item.name, poster: item.poster } as StremioMeta;
		}
		showResumeStream = true;
	}

	let popularMovies = $state<StremioMeta[]>([]);
	let featuredMovies = $state<StremioMeta[]>([]);
	let popularSeries = $state<StremioMeta[]>([]);
	let featuredSeries = $state<StremioMeta[]>([]);
	let hero = $state<StremioMeta | null>(null);
	let continueWatching = $derived(getContinueWatching());
	let loaded = $state(false);

	// Reactively load library whenever auth changes
	$effect(() => {
		if (auth.isAuthenticated && !library.loaded) {
			const key = getAuthKey();
			if (key) loadLibrary(key);
		}
	});

	onMount(async () => {
		// Also try loading on mount
		if (auth.isAuthenticated) {
			const key = getAuthKey();
			if (key && !library.loaded) loadLibrary(key);
		}

		const [pm, fm, ps, fs] = await Promise.allSettled([
			getCatalog('movie', 'top'),
			getCatalog('movie', 'imdbRating'),
			getCatalog('series', 'top'),
			getCatalog('series', 'imdbRating'),
		]);

		if (pm.status === 'fulfilled') { popularMovies = pm.value.slice(0, 20); hero = pm.value[0] || null; }
		if (fm.status === 'fulfilled') featuredMovies = fm.value.slice(0, 20);
		if (ps.status === 'fulfilled') popularSeries = ps.value.slice(0, 20);
		if (fs.status === 'fulfilled') featuredSeries = fs.value.slice(0, 20);
		loaded = true;
	});
</script>

<svelte:head>
	<title>Scope</title>
</svelte:head>

{#if !loaded}
	<!-- Loading skeleton -->
	<div class="-mt-16 h-[85vh] min-h-[600px] w-full shimmer bg-surface"></div>
	<div class="space-y-10 px-8 md:px-12 lg:px-16 py-8">
		{#each Array(4) as _}
			<section class="space-y-3">
				<div class="h-5 w-40 shimmer rounded-lg bg-surface-hover"></div>
				<div class="flex gap-4 overflow-hidden">
					{#each Array(6) as __}
						<div class="w-40 shrink-0 sm:w-44 md:w-48">
							<div class="aspect-[2/3] w-full shimmer rounded-xl bg-surface-hover"></div>
							<div class="mt-2 h-3 w-3/4 shimmer rounded bg-surface-hover"></div>
						</div>
					{/each}
				</div>
			</section>
		{/each}
	</div>
{:else}

{#if hero}
	<HeroBanner item={hero} />
{/if}

<div class="space-y-10 px-8 md:px-12 lg:px-16 py-8">
	{#if continueWatching.length > 0}
		<section class="space-y-3">
			<h2 class="text-lg font-medium tracking-tight text-stone-200">Continue Watching</h2>
			<div class="relative -m-4">
				<div class="flex gap-4 overflow-x-auto scroll-smooth p-4 scrollbar-hide" style="-webkit-mask-image: linear-gradient(to right, black calc(100% - 48px), transparent); mask-image: linear-gradient(to right, black calc(100% - 48px), transparent);">
					{#each continueWatching as item (item._id)}
						<button
							onclick={() => handleContinueWatching(item)}
							class="group flex w-64 shrink-0 flex-col gap-1.5 text-left sm:w-72"
						>
							<div class="card-shadow relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-surface transition-all duration-200 group-hover:scale-[1.03] group-hover:border-[rgba(231,229,228,0.10)] group-active:scale-[0.98]">
								{#if item.background || item.poster}
									<img
										src={item.background || item.poster}
										alt={item.name}
										class="h-full w-full object-cover transition group-hover:scale-105"
										loading="lazy"
									/>
								{:else}
									<div class="flex h-full items-center justify-center text-sm text-text-muted">No Image</div>
								{/if}
								<div class="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30">
									<div class="flex h-12 w-12 scale-90 items-center justify-center rounded-full bg-white/90 opacity-0 backdrop-blur transition group-hover:scale-100 group-hover:opacity-100">
										<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="black"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
									</div>
								</div>
								{#if item.state?.timeOffset && item.state?.duration}
									<div class="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
										<div class="h-full bg-stone-50 transition-all" style="width: {Math.round((item.state.timeOffset / item.state.duration) * 100)}%"></div>
									</div>
								{/if}
							</div>
							<div class="min-w-0 px-0.5">
								<p class="truncate text-sm font-medium transition group-hover:text-stone-100">{item.name}</p>
								<div class="flex items-center gap-1.5 text-xs text-text-muted">
									{#if item.state?.season && item.state?.episode}
										<span>S{String(item.state.season).padStart(2, '0')}E{String(item.state.episode).padStart(2, '0')}</span>
										<span class="text-text-muted/40">&middot;</span>
									{/if}
									{#if item.state?.timeOffset && item.state?.duration}
										{@const remaining = Math.max(0, item.state.duration - item.state.timeOffset)}
										{@const mins = Math.floor(remaining / 60000)}
										{#if mins >= 60}
											<span>{Math.floor(mins / 60)}h {mins % 60}m left</span>
										{:else}
											<span>{mins}m left</span>
										{/if}
									{/if}
								</div>
							</div>
						</button>
					{/each}
				</div>
			</div>
		</section>
	{/if}

	<MediaRow title="Popular Movies" items={popularMovies} />
	<MediaRow title="Featured Movies" items={featuredMovies} />
	<MediaRow title="Popular Series" items={popularSeries} />
	<MediaRow title="Featured Series" items={featuredSeries} />

	{#if loaded && popularMovies.length === 0 && popularSeries.length === 0}
		<div class="flex flex-col items-center justify-center gap-4 py-20 text-center">
			<h2 class="text-2xl font-bold tracking-tight text-text">Welcome to Scope</h2>
			<p class="text-text-muted">Unable to fetch catalogs. Check your connection.</p>
		</div>
	{/if}
</div>

<!-- Resume stream modal -->
{#if showResumeStream && resumeMeta && resumeItem}
	<StreamModal
		type={resumeItem.type}
		videoId={resumeItem.state?.video_id || resumeItem._id}
		meta={resumeMeta}
		onclose={() => { showResumeStream = false; resumeItem = null; resumeMeta = null; }}
	/>
{/if}

{/if}
