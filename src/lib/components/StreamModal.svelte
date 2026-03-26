<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getStreamAddons, getSubtitleAddons, type InstalledAddon } from '$lib/stores/addons.svelte';
	import {
		getStreams,
		getSubtitles,
		getServerStreamUrl,
		serverHeartbeat,
		type StremioMeta,
		type StremioStream,
		type StremioSubtitle,
	} from '$lib/api/stremio';
	import { setStream, getLastStreamChoice, type StreamType } from '$lib/stores/player.svelte';
	import { toast } from 'svelte-sonner';

	interface Props {
		type: string;
		videoId: string;
		meta: StremioMeta;
		onclose: () => void;
		onselect?: (url: string, streamType: StreamType, stream: StremioStream, subs: { url: string; lang: string }[]) => void;
	}

	let { type, videoId, meta, onclose, onselect }: Props = $props();

	interface AddonStreams {
		addon: InstalledAddon;
		streams: StremioStream[];
	}

	let results = $state<AddonStreams[]>([]);
	let fetchedSubtitles = $state<StremioSubtitle[]>([]);
	let loading = $state(true);
	let serverAvailable = $state(false);
	let closing = $state(false);
	let hidden = $state(!!getLastStreamChoice(meta.id)); // hide UI if we might auto-select

	onMount(() => {
		fetchStreams();

		function handleKeydown(e: KeyboardEvent) {
			if (e.key === 'Escape') {
				e.preventDefault();
				handleClose();
			}
		}
		window.addEventListener('keydown', handleKeydown);

		// Lock body scroll
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		return () => {
			window.removeEventListener('keydown', handleKeydown);
			document.body.style.overflow = prev;
		};
	});

	async function fetchStreams() {
		loading = true;
		results = [];
		fetchedSubtitles = [];

		// Check server and get addons in parallel
		const [heartbeat, streamAddons, subtitleAddons] = await Promise.all([
			serverHeartbeat(),
			Promise.resolve(getStreamAddons()),
			Promise.resolve(getSubtitleAddons()),
		]);
		serverAvailable = heartbeat;

		// Fetch streams and subtitles in parallel
		const [streamResults, subResults] = await Promise.all([
			// Streams
			Promise.allSettled(
				streamAddons.map(async (addon) => {
					const streams = await getStreams(addon.transportUrl, type as 'movie' | 'series', videoId);
					return { addon, streams } as AddonStreams;
				})
			),
			// Subtitles
			Promise.allSettled(
				subtitleAddons.map(async (addon) => {
					return getSubtitles(addon.transportUrl, type as 'movie' | 'series', videoId);
				})
			),
		]);

		const collected: AddonStreams[] = [];
		let streamErrors = 0;
		for (const result of streamResults) {
			if (result.status === 'fulfilled' && result.value.streams?.length) {
				collected.push(result.value);
			} else if (result.status === 'rejected') {
				streamErrors++;
			}
		}

		const allSubs: StremioSubtitle[] = [];
		for (const result of subResults) {
			if (result.status === 'fulfilled') {
				allSubs.push(...result.value);
			}
		}

		if (streamErrors > 0 && collected.length === 0) {
			toast.error('All stream sources failed to respond');
		} else if (streamErrors > 0) {
			toast.warning(`${streamErrors} addon${streamErrors > 1 ? 's' : ''} failed to respond`);
		}

		results = collected;
		fetchedSubtitles = allSubs;
		loading = false;

		// Auto-select last used stream if available
		const saved = getLastStreamChoice(meta.id);
		if (saved) {
			for (const { streams } of collected) {
				const match = streams.find(s => {
					if (saved.infoHash && s.infoHash === saved.infoHash) return true;
					if (saved.url && s.url === saved.url) return true;
					return false;
				});
				if (match && streamIsAvailable(match)) {
					handleStreamClick(match);
					return;
				}
			}
		}
		// No auto-select — show the picker
		hidden = false;
	}

	function handleClose() {
		closing = true;
		setTimeout(() => {
			onclose();
		}, 180);
	}

	function parseQuality(stream: StremioStream): string | null {
		const text = `${stream.name || ''} ${stream.title || ''}`;
		if (/4k|2160p|uhd/i.test(text)) return '4K';
		if (/1080p|full\s*hd/i.test(text)) return '1080p';
		if (/720p|hd/i.test(text)) return '720p';
		if (/480p|sd/i.test(text)) return '480p';
		return null;
	}

	function qualityBadgeClass(quality: string): string {
		switch (quality) {
			case '4K':
				return 'bg-accent-yellow/15 text-accent-yellow border-accent-yellow/20';
			case '1080p':
				return 'bg-accent-green/15 text-accent-green border-accent-green/20';
			case '720p':
				return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
			default:
				return 'bg-[rgba(231,229,228,0.06)] text-text-muted border-border';
		}
	}

	function streamIsAvailable(stream: StremioStream): boolean {
		if (stream.infoHash && !serverAvailable) return false;
		return true;
	}

	function splitName(name: string | undefined): string[] {
		if (!name) return [];
		return name.split('\n').filter(Boolean);
	}

	async function handleStreamClick(stream: StremioStream) {
		// External URL: open in new tab
		if (stream.externalUrl) {
			window.open(stream.externalUrl, '_blank');
			return;
		}

		// Determine URL and type
		let url: string;
		let sType: StreamType;

		if (stream.infoHash) {
			if (!serverAvailable) return;
			url = getServerStreamUrl(stream.infoHash, stream.fileIdx ?? 0);
			sType = 'direct';
		} else if (stream.url) {
			url = stream.url;
			sType = stream.url.includes('.m3u8') ? 'hls' : 'direct';
		} else if (stream.ytId) {
			window.open(`https://www.youtube.com/watch?v=${stream.ytId}`, '_blank');
			return;
		} else {
			return;
		}

		// Collect subtitles from stream + addon fetches
		const streamSubs = (stream.subtitles || []).map((s) => ({ url: s.url, lang: s.lang }));
		const addonSubs = fetchedSubtitles.map((s) => ({ url: s.url, lang: s.lang }));
		const subs = [...streamSubs, ...addonSubs];

		if (onselect) {
			onselect(url, sType, stream, subs);
		} else {
			setStream(url, sType, meta, videoId, stream, subs);
			goto('/player');
		}
	}

	function totalStreamCount(): number {
		return results.reduce((sum, r) => sum + r.streams.length, 0);
	}
</script>

{#if !hidden}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-[70] flex items-center justify-center p-4 md:p-6"
	class:palette-backdrop-in={!closing}
	class:palette-backdrop-out={closing}
	onclick={handleClose}
	onkeydown={() => {}}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="glass-deep relative flex h-[85vh] max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl sm:max-h-[85vh]"
		class:palette-modal-in={!closing}
		class:palette-modal-out={closing}
		onclick={(e) => e.stopPropagation()}
		onkeydown={() => {}}
	>
		<!-- Header -->
		<div class="flex shrink-0 items-center justify-between border-b border-[rgba(231,229,228,0.06)] px-5 py-4">
			<div class="flex items-center gap-3">
				<h2 class="text-base font-semibold text-text">Select Stream</h2>
				{#if !loading}
					<span class="rounded-full bg-[rgba(231,229,228,0.06)] px-2 py-0.5 text-xs text-text-muted">
						{totalStreamCount()} stream{totalStreamCount() !== 1 ? 's' : ''}
					</span>
				{/if}
			</div>
			<button
				onclick={handleClose}
				class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-[rgba(231,229,228,0.06)] hover:text-text"
				aria-label="Close"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="18" y1="6" x2="6" y2="18"></line>
					<line x1="6" y1="6" x2="18" y2="18"></line>
				</svg>
			</button>
		</div>

		<!-- Server status banner -->
		{#if !loading && !serverAvailable}
			<div class="flex items-center gap-2 border-b border-[rgba(231,229,228,0.06)] bg-accent-yellow/5 px-5 py-2.5">
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-accent-yellow">
					<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
					<line x1="12" y1="9" x2="12" y2="13"></line>
					<line x1="12" y1="17" x2="12.01" y2="17"></line>
				</svg>
				<span class="text-xs text-accent-yellow">Streaming server offline — torrent streams unavailable</span>
			</div>
		{/if}

		<!-- Content -->
		<div class="flex-1 overflow-y-auto scrollbar-hide">
			{#if loading}
				<!-- Skeleton -->
				<div class="space-y-1 p-3">
					{#each Array(3) as _}
						<div class="mb-3">
							<div class="flex items-center gap-2 px-3 pb-2 pt-3">
								<div class="h-4 w-4 shimmer rounded bg-[rgba(231,229,228,0.06)]"></div>
								<div class="h-3 w-24 shimmer rounded bg-[rgba(231,229,228,0.06)]"></div>
							</div>
							<div class="space-y-0.5">
								{#each Array(2) as __}
									<div class="flex items-start gap-3 rounded-xl px-3 py-2.5">
										<div class="flex-1 min-w-0 space-y-1">
											<div class="h-3.5 w-3/4 shimmer rounded bg-[rgba(231,229,228,0.06)]"></div>
											<div class="h-2.5 w-1/2 shimmer rounded bg-[rgba(231,229,228,0.04)]"></div>
										</div>
										<div class="h-5 w-12 shimmer rounded-full bg-[rgba(231,229,228,0.06)]"></div>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>

			{:else if results.length === 0}
				<div class="flex flex-col items-center justify-center gap-3 px-6 py-16">
					<div class="flex h-14 w-14 items-center justify-center rounded-full bg-surface">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
							<circle cx="12" cy="12" r="10"></circle>
							<line x1="8" y1="15" x2="16" y2="15"></line>
							<line x1="9" y1="9" x2="9.01" y2="9"></line>
							<line x1="15" y1="9" x2="15.01" y2="9"></line>
						</svg>
					</div>
					<p class="text-sm font-medium text-text">No streams found</p>
					<p class="text-xs text-text-muted">Try installing more addons for better results.</p>
				</div>

			{:else}
				<div class="space-y-1 p-3">
					{#each results as { addon, streams }}
						<!-- Addon group -->
						<div class="mb-3">
							<div class="flex items-center gap-2 px-3 pb-2 pt-3">
								{#if addon.manifest.logo}
									<img
										src={addon.manifest.logo}
										alt=""
										class="h-4 w-4 shrink-0 rounded object-contain"
									/>
								{/if}
								<h3 class="text-xs font-semibold uppercase tracking-wider text-text-muted">
									{addon.manifest.name}
								</h3>
								<span class="text-[10px] text-text-muted/50">{streams.length}</span>
							</div>

							<div class="space-y-0.5">
								{#each streams as stream}
									{@const quality = parseQuality(stream)}
									{@const available = streamIsAvailable(stream)}
									{@const nameParts = splitName(stream.name)}
									<button
										onclick={() => handleStreamClick(stream)}
										disabled={!available}
										class="group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150
											{available
												? 'hover:bg-[rgba(231,229,228,0.04)] cursor-pointer'
												: 'opacity-40 cursor-not-allowed'}"
									>
										<div class="flex-1 min-w-0 space-y-1">
											<!-- Stream name (split by newline) -->
											{#if nameParts.length > 0}
												<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
													{#each nameParts as part, pi}
														<span class="{pi === 0 ? 'text-sm font-medium text-text' : 'text-xs text-text-secondary'}">
															{part}
														</span>
													{/each}
												</div>
											{/if}
											<!-- Stream title (file info) -->
											{#if stream.title}
												<p class="text-xs leading-relaxed text-text-muted line-clamp-2">
													{stream.title}
												</p>
											{/if}
											<!-- Filename hint -->
											{#if stream.behaviorHints?.filename}
												<p class="truncate text-[11px] text-text-muted/60">
													{stream.behaviorHints.filename}
												</p>
											{/if}
										</div>

										<!-- Badges -->
										<div class="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
											{#if quality}
												<span class="rounded-md border px-2 py-0.5 text-[10px] font-bold {qualityBadgeClass(quality)}">
													{quality}
												</span>
											{/if}
											{#if stream.externalUrl}
												<span class="rounded-md border border-border bg-[rgba(231,229,228,0.06)] px-2 py-0.5 text-[10px] font-medium text-text-muted">
													External
												</span>
											{/if}
											{#if stream.infoHash && !serverAvailable}
												<span class="rounded-md border border-accent-red/20 bg-accent-red/10 px-2 py-0.5 text-[10px] font-medium text-accent-red">
													Server offline
												</span>
											{/if}
										</div>
									</button>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Footer hint -->
		{#if !loading && results.length > 0}
			<div class="shrink-0 border-t border-[rgba(231,229,228,0.06)] px-5 py-3">
				<div class="flex items-center justify-between">
					<span class="text-[11px] text-text-muted">
						Click a stream to start playback
					</span>
					<kbd class="hidden rounded-md border border-[rgba(231,229,228,0.08)] bg-[rgba(231,229,228,0.04)] px-1.5 py-0.5 text-[10px] text-text-muted sm:inline">
						ESC
					</kbd>
				</div>
			</div>
		{/if}
	</div>
</div>
{/if}

<style>
	.palette-backdrop-in {
		animation: backdropIn 0.2s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
	}
	.palette-modal-in {
		animation: modalIn 0.25s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
	}
	.palette-backdrop-out {
		animation: backdropOut 0.18s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
	}
	.palette-modal-out {
		animation: modalOut 0.18s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
	}

	@keyframes backdropIn {
		from {
			background: rgba(0, 0, 0, 0);
			backdrop-filter: blur(0px);
			-webkit-backdrop-filter: blur(0px);
		}
		to {
			background: rgba(0, 0, 0, 0.5);
			backdrop-filter: blur(12px);
			-webkit-backdrop-filter: blur(12px);
		}
	}
	@keyframes backdropOut {
		from {
			background: rgba(0, 0, 0, 0.5);
			backdrop-filter: blur(12px);
			-webkit-backdrop-filter: blur(12px);
		}
		to {
			background: rgba(0, 0, 0, 0);
			backdrop-filter: blur(0px);
			-webkit-backdrop-filter: blur(0px);
		}
	}
	@keyframes modalIn {
		from {
			opacity: 0;
			filter: blur(8px);
			transform: scale(0.96) translateY(-8px);
		}
		to {
			opacity: 1;
			filter: blur(0px);
			transform: scale(1) translateY(0);
		}
	}
	@keyframes modalOut {
		from {
			opacity: 1;
			filter: blur(0px);
			transform: scale(1) translateY(0);
		}
		to {
			opacity: 0;
			filter: blur(6px);
			transform: scale(0.97) translateY(-6px);
		}
	}
</style>
