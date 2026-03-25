<script lang="ts">
	import { goto } from '$app/navigation';
	import { getStreams, getSubtitles, getServerStreamUrl, serverHeartbeat, type StremioMeta, type StremioStream } from '$lib/api/stremio';
	import { getAuthKey } from '$lib/stores/auth.svelte';
	import { addToLibrary, removeFromLibrary, getLibraryStore } from '$lib/stores/library.svelte';
	import { getStreamAddons, getSubtitleAddons } from '$lib/stores/addons.svelte';
	import { setStream, getLastStreamChoice, type StreamType } from '$lib/stores/player.svelte';
	import { pickBestStream } from '$lib/api/smartSelect';
	import { toast } from 'svelte-sonner';
	import StreamModal from '$lib/components/StreamModal.svelte';

	interface Props {
		item: StremioMeta;
	}

	let { item }: Props = $props();

	let backdropLoaded = $state(false);
	let playHeight = $state(0);
	let autoPlaying = $state(false);
	let showStreams = $state(false);

	const libraryStore = getLibraryStore();
	let inLibrary = $derived(libraryStore.items.some(i => i._id === item.id));

	async function handleToggleLibrary() {
		const key = getAuthKey();
		if (inLibrary) {
			await removeFromLibrary(key || '', item.id);
		} else {
			await addToLibrary(key || '', item);
		}
	}

	$effect(() => {
		if (item) backdropLoaded = false;
	});

	function metaLine(): string {
		const parts: string[] = [];
		if (item.type) parts.push(item.type === 'series' ? 'TV Series' : 'Movie');
		if (item.genres?.length) parts.push(...item.genres.slice(0, 2));
		return parts.join(' \u00B7 ');
	}

	function subLine(): string {
		const parts: string[] = [];
		if (item.releaseInfo) parts.push(item.releaseInfo);
		if (item.runtime) parts.push(item.runtime);
		return parts.join(' \u00B7 ');
	}

	async function autoPlay() {
		if (autoPlaying) return;
		autoPlaying = true;

		try {
			const videoId = item.id;
			const saved = getLastStreamChoice(item.id);

			const [online, streamAddons, subtitleAddons] = await Promise.all([
				serverHeartbeat(),
				Promise.resolve(getStreamAddons()),
				Promise.resolve(getSubtitleAddons()),
			]);

			const [streamResults, subResults] = await Promise.all([
				Promise.allSettled(
					streamAddons.map(async (addon) => getStreams(addon.transportUrl, item.type as 'movie' | 'series', videoId))
				),
				Promise.allSettled(
					subtitleAddons.map(async (addon) => getSubtitles(addon.transportUrl, item.type as 'movie' | 'series', videoId))
				),
			]);

			const allStreams: StremioStream[] = [];
			for (const r of streamResults) {
				if (r.status === 'fulfilled') allStreams.push(...r.value);
			}

			const allSubs: { url: string; lang: string }[] = [];
			for (const r of subResults) {
				if (r.status === 'fulfilled') allSubs.push(...r.value.map(s => ({ url: s.url, lang: s.lang })));
			}

			let pick: StremioStream | null = null;
			if (saved) {
				pick = allStreams.find(s => {
					if (saved.infoHash && s.infoHash === saved.infoHash) return true;
					if (saved.url && s.url === saved.url) return true;
					return false;
				}) || null;
				if (pick && pick.infoHash && !online) pick = null;
			}
			if (!pick) pick = pickBestStream(allStreams, online);

			if (!pick) {
				toast.error('No streams available');
				autoPlaying = false;
				return;
			}

			let url: string;
			let sType: StreamType;
			if (pick.infoHash) {
				url = getServerStreamUrl(pick.infoHash, pick.fileIdx ?? 0);
				sType = 'direct';
			} else if (pick.url) {
				url = pick.url;
				sType = pick.url.includes('.m3u8') ? 'hls' : 'direct';
			} else {
				toast.error('No playable stream found');
				autoPlaying = false;
				return;
			}

			setStream(url, sType, item, videoId, pick, allSubs);
			goto('/player');
		} catch {
			toast.error('Failed to load streams');
		}

		autoPlaying = false;
	}
</script>

{#if item}
	<div class="relative -mt-16 h-[85vh] min-h-[600px] w-full overflow-hidden">
		{#if item.background}
			<img
				src={item.background}
				alt={item.name}
				class="absolute inset-0 h-full w-full object-cover transition-opacity duration-700 {backdropLoaded ? 'opacity-100' : 'opacity-0'}"
				onload={() => backdropLoaded = true}
			/>
		{/if}

		<div class="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-transparent"></div>
		<div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(12,10,9,0.6)_100%)]"></div>

		<div class="relative flex h-full flex-col items-center justify-end pb-16 md:pb-20 px-6">
			<div class="flex flex-col items-center text-center space-y-4 max-w-xl">
				{#if item.logo}
					<img
						src={item.logo}
						alt={item.name}
						class="max-h-28 max-w-[280px] object-contain drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] md:max-h-36 md:max-w-sm"
					/>
				{:else}
					<h1 class="text-5xl font-black tracking-tight leading-none md:text-6xl drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
						{item.name}
					</h1>
				{/if}

				{#if metaLine()}
					<p class="text-sm text-text-secondary/80 tracking-wide">{metaLine()}</p>
				{/if}

				<!-- Action buttons -->
				<div class="flex items-center gap-3 pt-1">
					<!-- Split Play button -->
					<div class="split-btn-wrap" bind:clientHeight={playHeight}>
						<button
							onclick={autoPlay}
							disabled={autoPlaying}
							class="split-btn-main"
						>
							{#if autoPlaying}
								<svg class="relative h-[18px] w-[18px] animate-spin" viewBox="0 0 24 24" fill="none">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
								</svg>
							{:else}
								<svg class="relative" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M232.4,114.49,88.32,26.35a16,16,0,0,0-16.2-.3A15.86,15.86,0,0,0,64,40.74V215.26a15.94,15.94,0,0,0,8.12,13.89,16,16,0,0,0,16.2-.3L232.4,141.51a16,16,0,0,0,0-27Z"/></svg>
							{/if}
							<span class="relative">Play</span>
						</button>
						<span class="split-btn-divider"></span>
						<button
							onclick={() => showStreams = true}
							class="split-btn-arrow"
							aria-label="Choose source"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
						</button>
					</div>

					<!-- Library button -->
					<button
						onclick={handleToggleLibrary}
						class="btn-dark btn-pill !p-0 flex items-center justify-center"
						style="width: {playHeight}px; height: {playHeight}px;"
						aria-label={inLibrary ? 'Remove from library' : 'Add to library'}
					>
						<span class="btn-stroke"></span>
						<span class="btn-highlight"></span>
						{#if inLibrary}
							<svg class="relative" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
						{:else}
							<svg class="relative" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
						{/if}
					</button>
				</div>

				{#if item.description}
					<p class="line-clamp-2 max-w-md text-sm leading-relaxed text-text-secondary/70">{item.description}</p>
				{/if}

				{#if subLine()}
					<p class="text-xs text-text-muted tracking-wide">{subLine()}</p>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Stream picker modal -->
{#if showStreams}
	<StreamModal
		type={item.type}
		videoId={item.id}
		meta={item}
		onclose={() => showStreams = false}
	/>
{/if}

<style>
	.split-btn-wrap {
		display: inline-flex;
		align-items: stretch;
		border-radius: 9999px;
		overflow: hidden;
		background: rgba(227, 227, 227, 0.8);
		box-shadow:
			0 2px 4px rgba(0, 0, 0, 0.10),
			0 0 0 1px rgba(0, 0, 0, 0.16);
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
		transition: filter 200ms ease;
	}
	.split-btn-main:hover { filter: brightness(0.95); }
	.split-btn-main:disabled { opacity: 0.6; cursor: wait; }

	.split-btn-divider {
		width: 1px;
		align-self: stretch;
		margin: 8px 0;
		background: rgba(0, 0, 0, 0.12);
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
	.split-btn-arrow:hover { background: rgba(0, 0, 0, 0.06); }

	@media (max-width: 480px) {
		.split-btn-main {
			padding: 10px 14px 10px 16px;
			font-size: 13px;
			gap: 8px;
		}
		.split-btn-arrow {
			padding: 0 10px;
		}
	}
</style>
