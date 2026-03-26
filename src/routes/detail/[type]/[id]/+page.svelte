<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getMeta, getCatalog, getStreams, getSubtitles, getServerStreamUrl, resolvePlayableUrl, serverHeartbeat, type StremioMeta, type StremioVideo, type StremioStream } from '$lib/api/stremio';
	import { getAuth, getAuthKey } from '$lib/stores/auth.svelte';
	import { addToLibrary, removeFromLibrary, getLibraryStore } from '$lib/stores/library.svelte';
	import { getStreamAddons, getSubtitleAddons } from '$lib/stores/addons.svelte';
	import { setStream, getLastStreamChoice, type StreamType } from '$lib/stores/player.svelte';
	import { pickBestStream } from '$lib/api/smartSelect';
	import { toast } from 'svelte-sonner';
	import StreamModal from '$lib/components/StreamModal.svelte';
	import MediaCard from '$lib/components/MediaCard.svelte';

	const auth = getAuth();
	const libraryStore = getLibraryStore();

	let libraryItem = $derived(libraryStore.items.find(i => i._id === id));
	let watchProgress = $derived(getWatchProgress());

	function getWatchProgress() {
		const item = libraryItem;
		if (!item?.state?.timeOffset || !item?.state?.duration) return null;
		const pct = Math.round((item.state.timeOffset / item.state.duration) * 100);
		if (pct < 1 || pct > 95) return null;
		return { pct, timeOffset: item.state.timeOffset, duration: item.state.duration, videoId: item.state.video_id, season: item.state.season, episode: item.state.episode };
	}

	let meta = $state<StremioMeta | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let showStreams = $state(false);
	let selectedVideoId = $state('');
	let autoPlaying = $state(false);
	let backdropLoaded = $state(false);
	let inLibrary = $derived(libraryStore.items.some(i => i._id === id));
	let descExpanded = $state(false);
	let similar = $state<StremioMeta[]>([]);
	let castImages = $state<Record<string, string>>({});

	async function loadCastImages(cast: string[]) {
		const imgs: Record<string, string> = {};
		await Promise.allSettled(cast.slice(0, 12).map(async (name) => {
			try {
				const slug = name.replace(/\s+/g, '_');
				const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`);
				if (!res.ok) return;
				const data = await res.json();
				if (data.thumbnail?.source) imgs[name] = data.thumbnail.source;
			} catch {}
		}));
		castImages = imgs;
	}

	let selectedSeason = $state(1);
	let seasons = $derived<number[]>(computeSeasons());
	let episodesForSeason = $derived<StremioVideo[]>(computeEpisodes());

	let type = $state<'movie' | 'series'>('movie');
	let id = $state('');

	function computeSeasons(): number[] {
		if (!meta?.videos?.length) return [];
		const s = new Set<number>();
		for (const v of meta.videos) { if (v.season != null && v.season > 0) s.add(v.season); }
		return [...s].sort((a, b) => a - b);
	}

	function computeEpisodes(): StremioVideo[] {
		if (!meta?.videos?.length) return [];
		return meta.videos.filter(v => v.season === selectedSeason).sort((a, b) => (a.episode || a.number || 0) - (b.episode || b.number || 0));
	}

	$effect(() => {
		const unsub = page.subscribe(p => {
			const newType = p.params.type as 'movie' | 'series';
			const newId = p.params.id ?? '';
			if (newType !== type || newId !== id) { type = newType; id = newId; loadMeta(); }
		});
		return unsub;
	});

	async function loadMeta() {
		loading = true; error = null; meta = null; backdropLoaded = false; descExpanded = false; similar = []; castImages = {};
		try {
			meta = await getMeta(type, id);
			if (meta.videos?.length) { const fs = computeSeasons()[0]; if (fs) selectedSeason = fs; }
			getCatalog(type, 'top').then(items => {
				similar = items.filter(i => i.id !== id).slice(0, 12);
			}).catch(() => {});
			if (meta.cast?.length) loadCastImages(meta.cast);
		} catch (e: any) { error = e.message || 'Failed to load'; }
		loading = false;
	}

	onMount(() => { window.scrollTo(0, 0); });

	function openStreams(videoId: string) { selectedVideoId = videoId; showStreams = true; }
	function closeStreams() { showStreams = false; selectedVideoId = ''; }

	async function handleToggleLibrary() {
		if (!meta) return;
		const key = getAuthKey();
		try {
			if (inLibrary) await removeFromLibrary(key || '', meta.id);
			else await addToLibrary(key || '', meta);
		} catch {
			toast.error('Failed to update library');
		}
	}

	async function autoPlay(videoId: string) {
		if (!meta || autoPlaying) return;
		autoPlaying = true;
		try {
			const saved = getLastStreamChoice(meta.id);
			const [online, streamAddons, subtitleAddons] = await Promise.all([serverHeartbeat(), Promise.resolve(getStreamAddons()), Promise.resolve(getSubtitleAddons())]);
			const [sr, sub] = await Promise.all([
				Promise.allSettled(streamAddons.map(a => getStreams(a.transportUrl, type, videoId))),
				Promise.allSettled(subtitleAddons.map(a => getSubtitles(a.transportUrl, type, videoId))),
			]);
			const allStreams: StremioStream[] = []; for (const r of sr) if (r.status === 'fulfilled') allStreams.push(...r.value);
			const allSubs: { url: string; lang: string }[] = []; for (const r of sub) if (r.status === 'fulfilled') allSubs.push(...r.value.map(s => ({ url: s.url, lang: s.lang })));
			let pick: StremioStream | null = null;
			if (saved) { pick = allStreams.find(s => (saved.infoHash && s.infoHash === saved.infoHash) || (saved.url && s.url === saved.url)) || null; if (pick?.infoHash && !online) pick = null; }
			if (!pick) pick = pickBestStream(allStreams, online);
			if (!pick) { toast.error('No streams available'); autoPlaying = false; return; }
			let url: string; let sType: StreamType;
			if (pick.infoHash) { const d = getServerStreamUrl(pick.infoHash, pick.fileIdx ?? 0); const r = await resolvePlayableUrl(d); url = r.url; sType = r.type; }
			else if (pick.url) { url = pick.url; sType = pick.url.includes('.m3u8') ? 'hls' : 'direct'; }
			else { autoPlaying = false; return; }
			setStream(url, sType, meta, videoId, pick, allSubs); goto('/player');
		} catch { toast.error('Failed to load streams'); }
		autoPlaying = false;
	}

	function formatEpNum(v: StremioVideo) { return `S${String(v.season||0).padStart(2,'0')}E${String(v.episode||v.number||0).padStart(2,'0')}`; }
	function formatDate(d: string | undefined | null) { if (!d) return ''; try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } }
	function ratingColor(r: string) { const n = parseFloat(r); return n >= 8 ? 'text-accent-green' : n >= 6 ? 'text-accent-yellow' : 'text-accent-red'; }
	function minsLeftText(ms: number) { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m/60)}h ${m%60}m left` : `${m}m left`; }

	let playVideoId = $derived(watchProgress?.videoId || (type === 'movie' ? id : (meta?.videos?.[0]?.id || id)));
	let remainingMs = $derived(watchProgress ? Math.max(0, watchProgress.duration - watchProgress.timeOffset) : 0);
	let playBtnHeight = $state(0);
</script>

<svelte:head>
	{#if meta}<title>{meta.name} - Scope</title>{:else}<title>Loading... - Scope</title>{/if}
</svelte:head>

<!-- Loading -->
{#if loading}
	<div class="-mt-16">
		<div class="relative h-[70vh] min-h-[500px] w-full shimmer bg-surface"></div>
		<div class="mx-auto max-w-5xl space-y-4 px-8 py-8">
			<div class="h-10 w-2/3 shimmer rounded-lg bg-surface-hover"></div>
			<div class="h-4 w-1/3 shimmer rounded bg-surface-hover"></div>
			<div class="h-12 w-48 shimmer rounded-full bg-surface-hover"></div>
			<div class="space-y-2 pt-4">
				<div class="h-3 w-full shimmer rounded bg-surface-hover"></div>
				<div class="h-3 w-5/6 shimmer rounded bg-surface-hover"></div>
			</div>
		</div>
	</div>

<!-- Error -->
{:else if error}
	<div class="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6">
		<div class="flex h-16 w-16 items-center justify-center rounded-full bg-surface">
			<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-text-muted"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
		</div>
		<h2 class="text-xl font-bold text-text">Failed to Load</h2>
		<p class="text-sm text-text-muted">{error}</p>
		<button onclick={() => loadMeta()} class="btn-dark btn-pill px-6 py-2.5 text-sm"><span class="btn-stroke"></span><span class="btn-highlight"></span><span class="relative">Try Again</span></button>
	</div>

<!-- Content -->
{:else if meta}
	<div class="-mt-16">
		<!-- ═══ HERO BACKDROP ═══ -->
		<div class="relative h-[70vh] min-h-[500px] w-full overflow-hidden">
			{#if meta.background}
				<img src={meta.background} alt="" class="absolute inset-0 h-full w-full object-cover transition-opacity duration-700 {backdropLoaded ? 'opacity-100' : 'opacity-0'}" onload={() => backdropLoaded = true} />
			{/if}
			<div class="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent"></div>
			<div class="absolute inset-0 bg-gradient-to-r from-bg/70 via-bg/20 to-transparent"></div>

			<!-- Content overlaid at bottom -->
			<div class="absolute inset-x-0 bottom-0 px-8 pb-10 md:px-12 lg:px-16">
				<div class="mx-auto max-w-5xl">
					<!-- Logo or Title -->
					{#if meta.logo}
						<img src={meta.logo} alt={meta.name} class="mb-5 max-h-24 max-w-sm object-contain drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] md:max-h-28" />
					{:else}
						<h1 class="mb-5 text-4xl font-black tracking-tight text-text drop-shadow-[0_2px_16px_rgba(0,0,0,0.5)] md:text-5xl lg:text-6xl">{meta.name}</h1>
					{/if}

					<!-- Meta chips -->
					<div class="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
						{#if meta.imdbRating}
							<span class="flex items-center gap-1">
								<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" class="text-accent-yellow"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
								<span class="{ratingColor(meta.imdbRating)} font-semibold">{meta.imdbRating}</span>
							</span>
						{/if}
						{#if meta.releaseInfo}<span class="text-text-secondary">{meta.releaseInfo}</span>{/if}
						{#if meta.runtime}<span class="text-text-muted">{meta.runtime}</span>{/if}
						{#if meta.type}<span class="rounded bg-white/10 px-2 py-0.5 text-xs font-medium text-text-secondary capitalize">{meta.type === 'series' ? 'TV Series' : 'Movie'}</span>{/if}
						{#if meta.genres?.length}
							<span class="text-text-muted">{meta.genres.slice(0, 3).join(', ')}</span>
						{/if}
					</div>

					<!-- Action row -->
					<div class="flex flex-wrap items-center gap-3">
						<div class="split-btn-wrap" bind:clientHeight={playBtnHeight}>
							<button onclick={() => autoPlay(playVideoId)} disabled={autoPlaying} class="split-btn-main">
								{#if watchProgress}<span class="split-btn-progress" style="width:{watchProgress.pct}%"></span>{/if}
								{#if autoPlaying}
									<svg class="relative h-[18px] w-[18px] animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
								{:else}
									<svg class="relative" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M232.4,114.49,88.32,26.35a16,16,0,0,0-16.2-.3A15.86,15.86,0,0,0,64,40.74V215.26a15.94,15.94,0,0,0,8.12,13.89,16,16,0,0,0,16.2-.3L232.4,141.51a16,16,0,0,0,0-27Z"/></svg>
								{/if}
								<span class="relative">
									{#if watchProgress}
										{#if type === 'series'}Resume S{String(watchProgress.season||0).padStart(2,'0')}E{String(watchProgress.episode||0).padStart(2,'0')} · {minsLeftText(remainingMs)}{:else}Resume · {minsLeftText(remainingMs)}{/if}
									{:else}Play{/if}
								</span>
							</button>
							<span class="split-btn-divider"></span>
							<button onclick={() => openStreams(playVideoId)} class="split-btn-arrow" aria-label="Choose source">
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
							</button>
						</div>

						<!-- Library -->
						<button onclick={handleToggleLibrary} class="btn-dark btn-pill inline-flex items-center gap-2 px-5 text-sm font-medium" style="height: {playBtnHeight}px">
							<span class="btn-stroke"></span>
							<span class="btn-highlight"></span>
							{#if inLibrary}
								<svg class="relative" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
								<span class="relative">In Library</span>
							{:else}
								<svg class="relative" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
								<span class="relative">Library</span>
							{/if}
						</button>

						<!-- Trailer -->
						{#if meta.trailerStreams?.length}
							<button onclick={() => window.open(`https://www.youtube.com/watch?v=${meta!.trailerStreams[0].ytId}`, '_blank')} class="btn-dark btn-pill inline-flex items-center gap-2 px-5 text-sm font-medium" style="height: {playBtnHeight}px">
								<span class="btn-stroke"></span>
								<span class="btn-highlight"></span>
								<svg class="relative" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
								<span class="relative">Trailer</span>
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- ═══ DETAILS SECTION ═══ -->
		<div class="px-8 pb-16 md:px-12 lg:px-16">
			<div class="mx-auto max-w-5xl">
			<!-- Description + Info grid -->
			<div class="grid gap-8 pt-8 md:grid-cols-[1fr_280px]">
				<!-- Left: description -->
				<div class="space-y-5">
					{#if meta.description}
						<div>
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<p
								class="text-[15px] leading-relaxed text-text-secondary/90 {descExpanded ? '' : 'line-clamp-4'}"
								onclick={() => descExpanded = !descExpanded}
								onkeydown={() => {}}
							>
								{meta.description}
							</p>
							{#if meta.description.length > 250}
								<button onclick={() => descExpanded = !descExpanded} class="mt-1.5 text-xs font-medium text-text-muted transition hover:text-text-secondary">
									{descExpanded ? 'Show less' : 'Show more'}
								</button>
							{/if}
						</div>
					{/if}

					</div>

				<!-- Right: meta info card -->
				<div class="space-y-4">
					{#if meta.director?.length}
						<div>
							<p class="text-xs text-text-muted">Director</p>
							<p class="text-sm text-text">{meta.director.join(', ')}</p>
						</div>
					{/if}
					{#if meta.genres?.length}
						<div>
							<p class="text-xs text-text-muted">Genre</p>
							<div class="mt-1 flex flex-wrap gap-1.5">
								{#each meta.genres as g}
									<span class="rounded-full border border-border px-2.5 py-0.5 text-xs text-text-secondary">{g}</span>
								{/each}
							</div>
						</div>
					{/if}
					{#if meta.country}
						<div>
							<p class="text-xs text-text-muted">Country</p>
							<p class="text-sm text-text-secondary">{meta.country}</p>
						</div>
					{/if}
					{#if meta.writer?.length}
						<div>
							<p class="text-xs text-text-muted">Writer</p>
							<p class="text-sm text-text-secondary">{meta.writer.slice(0, 3).join(', ')}</p>
						</div>
					{/if}
				</div>
			</div>

			<!-- ═══ CAST ═══ -->
			{#if meta.cast?.length}
				<div class="mt-10">
					<h2 class="mb-4 text-lg font-bold text-text">Cast</h2>
					<div class="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
						{#each meta.cast.slice(0, 12) as name}
							<a
								href="/person/{encodeURIComponent(name)}"
								class="group flex w-20 shrink-0 flex-col items-center gap-2.5 text-center"
							>
								{#if castImages[name]}
									<img
										src={castImages[name]}
										alt={name}
										class="h-20 w-20 rounded-full object-cover border border-border transition group-hover:border-[rgba(231,229,228,0.2)] group-hover:scale-105"
									/>
								{:else}
									<div class="flex h-20 w-20 items-center justify-center rounded-full bg-surface border border-border text-xl font-bold text-text-muted transition group-hover:border-[rgba(231,229,228,0.15)] group-hover:bg-surface-hover">
										{name.charAt(0).toUpperCase()}
									</div>
								{/if}
								<p class="w-full truncate text-[11px] font-medium text-text-secondary transition group-hover:text-text">{name}</p>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			<!-- ═══ SERIES EPISODES ═══ -->
			{#if type === 'series' && seasons.length > 0}
				<div class="mt-12">
					<div class="mb-4 flex items-center gap-3 overflow-x-auto scrollbar-hide">
						<h2 class="shrink-0 text-lg font-bold text-text">Episodes</h2>
						<div class="flex gap-1.5">
							{#each seasons as s}
								<button
									onclick={() => selectedSeason = s}
									class="shrink-0 rounded-full px-3.5 py-1 text-[13px] font-medium transition-all
										{selectedSeason === s
											? 'bg-white/10 text-text border border-white/10'
											: 'text-text-muted hover:text-text-secondary border border-transparent'}"
								>
									{s}
								</button>
							{/each}
						</div>
					</div>

					<div class="space-y-1">
						{#each episodesForSeason as ep, i (ep.id)}
							<button
								onclick={() => openStreams(ep.id)}
								class="group flex w-full items-start gap-4 rounded-xl p-3 text-left transition-all hover:bg-white/[0.03]"
							>
								<!-- Thumbnail -->
								<div class="relative aspect-video w-36 shrink-0 overflow-hidden rounded-lg bg-surface sm:w-44">
									{#if ep.thumbnail}
										<img src={ep.thumbnail} alt="" class="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
									{:else}
										<div class="flex h-full items-center justify-center text-text-muted">
											<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/></svg>
										</div>
									{/if}
									<div class="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30">
										<div class="flex h-8 w-8 scale-90 items-center justify-center rounded-full bg-white/90 opacity-0 transition group-hover:scale-100 group-hover:opacity-100">
											<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="black"><polygon points="5 3 19 12 5 21 5 3"/></svg>
										</div>
									</div>
								</div>

								<!-- Info -->
								<div class="flex-1 min-w-0 py-0.5">
									<div class="flex items-center gap-2 mb-1">
										<span class="text-xs font-mono font-medium text-text-muted">{formatEpNum(ep)}</span>
										{#if formatDate(ep.released || ep.firstAired)}
											<span class="text-[11px] text-text-muted/60">{formatDate(ep.released || ep.firstAired)}</span>
										{/if}
									</div>
									<h3 class="text-sm font-medium text-text transition group-hover:text-white">{ep.name || `Episode ${ep.episode || ep.number || i + 1}`}</h3>
									{#if ep.overview || ep.description}
										<p class="mt-1 line-clamp-2 text-xs leading-relaxed text-text-muted">{ep.overview || ep.description}</p>
									{/if}
								</div>
							</button>
						{/each}
					</div>

					{#if episodesForSeason.length === 0}
						<p class="py-12 text-center text-sm text-text-muted">No episodes found for this season.</p>
					{/if}
				</div>
			{/if}

			<!-- ═══ SIMILAR / RECOMMENDATIONS ═══ -->
			{#if similar.length > 0}
				<div class="mt-12">
					<h2 class="mb-4 text-lg font-bold text-text">More Like This</h2>
					<div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
						{#each similar as item, i (item.id)}
							<div class="card-fade-in" style="animation-delay: {i * 30}ms">
								<MediaCard {item} onclick={() => goto(`/detail/${item.type}/${item.id}`)} />
							</div>
						{/each}
					</div>
				</div>
			{/if}
			</div>
		</div>
	</div>
{/if}

{#if showStreams && meta}
	<StreamModal {type} videoId={selectedVideoId} {meta} onclose={closeStreams} />
{/if}

<style>
	/* ─── Split Button ─── */
	.split-btn-wrap {
		display: inline-flex;
		align-items: stretch;
		border-radius: 9999px;
		overflow: hidden;
		background: rgba(227, 227, 227, 0.8);
		box-shadow: 0 2px 4px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.16);
		transition: transform 350ms cubic-bezier(0.32, 0.72, 0, 1.05);
	}
	.split-btn-wrap:active { transform: scale(0.97); }

	.split-btn-main {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 12px 20px 12px 24px;
		font-size: 15px;
		font-weight: 600;
		color: #0f172a;
		background: transparent;
		border: none;
		cursor: pointer;
		overflow: hidden;
		transition: filter 200ms ease;
	}
	.split-btn-main:hover { filter: brightness(0.95); }
	.split-btn-main:disabled { opacity: 0.6; cursor: wait; }

	.split-btn-progress {
		position: absolute;
		bottom: 0;
		left: 0;
		height: 3px;
		background: rgba(0,0,0,0.25);
		pointer-events: none;
	}

	.split-btn-divider {
		width: 1px;
		align-self: stretch;
		margin: 8px 0;
		background: rgba(0,0,0,0.12);
	}

	.split-btn-arrow {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 14px;
		color: #0f172a;
		background: transparent;
		border: none;
		cursor: pointer;
		transition: background 150ms ease;
	}
	.split-btn-arrow:hover { background: rgba(0,0,0,0.06); }

	/* ─── Mobile ─── */
	@media (max-width: 480px) {
		.split-btn-main {
			padding: 10px 14px 10px 16px;
			font-size: 13px;
			gap: 8px;
		}
		.split-btn-arrow { padding: 0 10px; }
	}
</style>
