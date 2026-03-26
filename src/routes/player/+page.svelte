<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { getPlayer, clearStream, setStream, getLastStreamChoice, type StreamType } from '$lib/stores/player.svelte';
	import { getAuthKey } from '$lib/stores/auth.svelte';
	import { updateWatchProgress, getLibraryStore } from '$lib/stores/library.svelte';
	import { getStreamAddons, getSubtitleAddons } from '$lib/stores/addons.svelte';
	import { getStreams, getSubtitles, getServerStreamUrl, serverHeartbeat, type StremioStream } from '$lib/api/stremio';
	import { pickBestStream } from '$lib/api/smartSelect';
	import { isHLSProvider, type MediaProviderChangeEvent } from 'vidstack';
	import type { MediaPlayerElement } from 'vidstack/elements';
	import { toast } from 'svelte-sonner';
	import StreamModal from '$lib/components/StreamModal.svelte';

	const player = getPlayer();
	let progressInterval: ReturnType<typeof setInterval> | null = null;
	let lastSavedTime = 0;
	let lastSavedDuration = 0;
	let resumeOffset = 0;

	function computeResumeOffset(): number {
		const libraryStore = getLibraryStore();
		const meta = player.meta;
		const videoId = player.videoId;
		if (!meta) return 0;
		const item = libraryStore.items.find(i => i._id === meta.id);
		if (!item?.state?.timeOffset || !item?.state?.duration) return 0;
		if (item.state.video_id && videoId && item.state.video_id !== videoId) return 0;
		const pct = (item.state.timeOffset / item.state.duration) * 100;
		if (pct > 95 || pct < 1) return 0;
		// Stremio stores timeOffset in ms, video.currentTime is in seconds
		return item.state.timeOffset / 1000;
	}

	let playerEl = $state<MediaPlayerElement | null>(null);
	let ready = $state(false);
	let src = $state('');
	let srcType = $state('');

	// 2x speed hold
	let isSpeeding = $state(false);
	let speedBeforeHold = 1;

	function startSpeed() {
		if (isSpeeding) return;
		const video = playerEl?.querySelector('video');
		if (!video) return;
		speedBeforeHold = video.playbackRate;
		video.playbackRate = 2;
		if (video.paused) video.play().catch(() => {});
		isSpeeding = true;
	}

	function stopSpeed() {
		if (!isSpeeding) return;
		const video = playerEl?.querySelector('video');
		if (video) video.playbackRate = speedBeforeHold;
		isSpeeding = false;
	}

	let stalled = $state(false);
	let stallTimer: ReturnType<typeof setTimeout> | null = null;
	let hasPlayed = $state(false);
	let showSourcePicker = $state(false);
	let subsLoaded = $state(0);
	let subsTotal = $state(0);

	let title = $derived(player.meta?.name ?? 'Unknown');
	let episodeInfo = $derived(parseEpisodeInfo());
	let nextEpisode = $derived(findNextEpisode());
	let showNextEpisode = $state(false);
	let nextEpisodeAutoTimer: ReturnType<typeof setTimeout> | null = null;
	let autoPlayCountdown = $state(0);
	let playingNextEpisode = $state(false);

	function parseEpisodeInfo(): string | null {
		const vid = player.videoId;
		if (!vid || player.meta?.type !== 'series') return null;
		const parts = vid.split(':');
		if (parts.length >= 3) {
			const season = parseInt(parts[1], 10);
			const episode = parseInt(parts[2], 10);
			const label = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
			const videos = player.meta?.videos;
			if (videos) {
				const info = videos.find((v) => v.id === vid);
				if (info?.name) return `${label} – ${info.name}`;
			}
			return label;
		}
		return null;
	}

	function findNextEpisode() {
		const vid = player.videoId;
		const videos = player.meta?.videos;
		if (!vid || !videos?.length || player.meta?.type !== 'series') return null;

		const parts = vid.split(':');
		if (parts.length < 3) return null;
		const curSeason = parseInt(parts[1], 10);
		const curEpisode = parseInt(parts[2], 10);

		// Sort all episodes
		const sorted = [...videos]
			.filter(v => v.season != null && (v.episode != null || v.number != null))
			.sort((a, b) => {
				if (a.season !== b.season) return a.season - b.season;
				return (a.episode || a.number || 0) - (b.episode || b.number || 0);
			});

		// Find current index
		const curIdx = sorted.findIndex(v => v.season === curSeason && (v.episode || v.number) === curEpisode);
		if (curIdx === -1 || curIdx >= sorted.length - 1) return null;

		return sorted[curIdx + 1];
	}

	async function playNextEpisode() {
		if (!nextEpisode || !player.meta || playingNextEpisode) return;
		playingNextEpisode = true;
		showNextEpisode = false;
		if (nextEpisodeAutoTimer) { clearInterval(nextEpisodeAutoTimer); nextEpisodeAutoTimer = null; }

		const videoId = nextEpisode.id;
		const meta = player.meta;

		try {
			const saved = getLastStreamChoice(meta.id);
			const [online, streamAddons, subtitleAddons] = await Promise.all([
				serverHeartbeat(),
				Promise.resolve(getStreamAddons()),
				Promise.resolve(getSubtitleAddons()),
			]);

			const [streamResults, subResults] = await Promise.all([
				Promise.allSettled(streamAddons.map(async (a) => getStreams(a.transportUrl, meta.type as 'movie' | 'series', videoId))),
				Promise.allSettled(subtitleAddons.map(async (a) => getSubtitles(a.transportUrl, meta.type as 'movie' | 'series', videoId))),
			]);

			const allStreams: StremioStream[] = [];
			for (const r of streamResults) if (r.status === 'fulfilled') allStreams.push(...r.value);
			const allSubs: { url: string; lang: string }[] = [];
			for (const r of subResults) if (r.status === 'fulfilled') allSubs.push(...r.value.map(s => ({ url: s.url, lang: s.lang })));

			let pick: StremioStream | null = null;
			if (saved) {
				pick = allStreams.find(s => (saved.infoHash && s.infoHash === saved.infoHash) || (saved.url && s.url === saved.url)) || null;
				if (pick?.infoHash && !online) pick = null;
			}
			if (!pick) pick = pickBestStream(allStreams, online);

			if (!pick) { toast.error('No streams for next episode'); playingNextEpisode = false; return; }

			let url: string;
			let sType: StreamType;
			if (pick.infoHash) { url = getServerStreamUrl(pick.infoHash, pick.fileIdx ?? 0); sType = 'direct'; }
			else if (pick.url) { url = pick.url; sType = pick.url.includes('.m3u8') ? 'hls' : 'direct'; }
			else { playingNextEpisode = false; return; }

			// Save current progress before switching
			saveProgress();

			setStream(url, sType, meta, videoId, pick, allSubs);
			srcType = determineSrcType(url, sType);
			src = url;
			resumeOffset = 0;
			hasPlayed = false;
			stalled = false;
			startStallTimer();

			requestAnimationFrame(() => {
				if (playerEl) (playerEl as any).src = { src: url, type: srcType };
				loadSubtitles();
			});
		} catch {
			toast.error('Failed to load next episode');
		}
		playingNextEpisode = false;
	}

	function startAutoPlayCountdown() {
		autoPlayCountdown = 15;
		if (nextEpisodeAutoTimer) clearInterval(nextEpisodeAutoTimer);
		nextEpisodeAutoTimer = setInterval(() => {
			autoPlayCountdown--;
			if (autoPlayCountdown <= 0) {
				if (nextEpisodeAutoTimer) clearInterval(nextEpisodeAutoTimer);
				playNextEpisode();
			}
		}, 1000);
	}

	function cancelAutoPlay() {
		if (nextEpisodeAutoTimer) { clearInterval(nextEpisodeAutoTimer); nextEpisodeAutoTimer = null; }
		showNextEpisode = false;
	}

	function goBack() { history.back(); }
	function startStallTimer() {
		if (stallTimer) clearTimeout(stallTimer);
		stallTimer = setTimeout(() => { if (!hasPlayed) stalled = true; }, 45000);
	}
	function clearStallTimer() {
		if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
		stalled = false;
	}

	function langLabel(lang: string): string {
		const map: Record<string, string> = {
			eng: 'English', en: 'English', spa: 'Spanish', es: 'Spanish',
			fre: 'French', fr: 'French', ger: 'German', de: 'German',
			por: 'Portuguese', pt: 'Portuguese', ita: 'Italian', it: 'Italian',
			jpn: 'Japanese', ja: 'Japanese', kor: 'Korean', ko: 'Korean',
			chi: 'Chinese', zh: 'Chinese', ara: 'Arabic', ar: 'Arabic',
			hin: 'Hindi', hi: 'Hindi', rus: 'Russian', ru: 'Russian',
			tur: 'Turkish', tr: 'Turkish', pol: 'Polish', pl: 'Polish',
			dut: 'Dutch', nl: 'Dutch', swe: 'Swedish', sv: 'Swedish',
			nor: 'Norwegian', no: 'Norwegian', dan: 'Danish', da: 'Danish',
			fin: 'Finnish', fi: 'Finnish', ell: 'Greek', el: 'Greek',
			heb: 'Hebrew', he: 'Hebrew', tha: 'Thai', th: 'Thai',
			vie: 'Vietnamese', vi: 'Vietnamese', rum: 'Romanian', ro: 'Romanian',
			cze: 'Czech', cs: 'Czech', hun: 'Hungarian', hu: 'Hungarian',
		};
		return map[lang.toLowerCase()] || lang;
	}

	function dedupeSubs(subs: { url: string; lang: string }[]) {
		const seen = new Map<string, { url: string; lang: string }>();
		for (const sub of subs) {
			const lang = sub.lang?.toLowerCase() || 'unknown';
			if (!seen.has(lang)) seen.set(lang, sub);
		}
		return [...seen.values()];
	}

	function srtToVtt(srt: string): string {
		let vtt = 'WEBVTT\n\n';
		vtt += srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/g, '$1:$2:$3.$4');
		return vtt;
	}

	async function loadSubtitles() {
		if (!playerEl) return;
		const subs = dedupeSubs(player.subtitles || []);
		subsTotal = subs.length;
		if (subs.length === 0) return;

		await customElements.whenDefined('media-player');
		await new Promise((r) => setTimeout(r, 1500));
		if (!playerEl) return;

		let firstEng = true;
		for (const sub of subs) {
			const langCode = sub.lang.slice(0, 2).toLowerCase();
			const isEng = sub.lang.toLowerCase().startsWith('en');
			try {
				const res = await fetch(sub.url);
				if (!res.ok) continue;
				const srtContent = await res.text();
				if (!srtContent.trim() || !playerEl) continue;
				playerEl.textTracks.add({
					content: srtToVtt(srtContent),
					label: langLabel(sub.lang),
					language: langCode,
					kind: 'subtitles',
					type: 'vtt',
					default: isEng && firstEng,
				});
				subsLoaded++;
				if (isEng) firstEng = false;
			} catch {}
		}
	}

	function determineSrcType(url: string, streamType: string): string {
		if (streamType === 'hls' || url.includes('.m3u8')) return 'application/x-mpegurl';
		return 'video/mp4';
	}

	function handleSourceSelect(url: string, sType: StreamType, stream: StremioStream, subs: { url: string; lang: string }[]) {
		showSourcePicker = false;
		hasPlayed = false;
		stalled = false;
		setStream(url, sType, player.meta!, player.videoId!, stream, subs);
		srcType = determineSrcType(url, sType);
		src = url;
		startStallTimer();
		requestAnimationFrame(() => {
			if (playerEl) (playerEl as any).src = { src: url, type: srcType };
			loadSubtitles();
		});
	}

	onMount(async () => {
		if (!browser) return;
		if (!player.streamUrl) { goto('/'); return; }

		resumeOffset = computeResumeOffset();

		await import('vidstack/player');
		await import('vidstack/player/layouts');
		await import('vidstack/player/ui');

		srcType = determineSrcType(player.streamUrl, player.streamType);
		src = player.streamUrl;
		ready = true;
		startStallTimer();

		await customElements.whenDefined('media-player');
		await new Promise((r) => requestAnimationFrame(r));
		await new Promise((r) => requestAnimationFrame(r));

		if (playerEl) {
			playerEl.addEventListener('provider-change', ((e: Event) => {
				const provider = (e as any).detail;
				if (isHLSProvider(provider)) {
					provider.config = { enableWorker: false, lowLatencyMode: false };
				}
			}) as EventListener);
			playerEl.addEventListener('end', () => { saveProgress(); goBack(); });
			playerEl.addEventListener('playing', () => { hasPlayed = true; clearStallTimer(); });

			// Resume from saved position — use events + timeout fallback
			if (resumeOffset > 0) {
				const doSeek = () => {
					const video = playerEl?.querySelector('video');
					if (video && video.readyState >= 1 && video.duration > 0 && resumeOffset > 0) {
						video.currentTime = resumeOffset;
						resumeOffset = 0;
						cleanup();
						return true;
					}
					return false;
				};

				let resumeTimeout: ReturnType<typeof setTimeout> | null = null;
				let eventCleanups: (() => void)[] = [];

				const cleanup = () => {
					if (resumeTimeout) { clearTimeout(resumeTimeout); resumeTimeout = null; }
					for (const fn of eventCleanups) fn();
					eventCleanups = [];
				};

				const tryFromEvent = () => { doSeek(); };

				// Poll via rAF as before
				const seekToResume = () => {
					if (resumeOffset <= 0) return;
					if (doSeek()) return;
					requestAnimationFrame(seekToResume);
				};

				// Also listen for video element events
				const attachVideoListeners = () => {
					const video = playerEl?.querySelector('video');
					if (video) {
						video.addEventListener('loadedmetadata', tryFromEvent);
						video.addEventListener('canplay', tryFromEvent);
						eventCleanups.push(
							() => video.removeEventListener('loadedmetadata', tryFromEvent),
							() => video.removeEventListener('canplay', tryFromEvent),
						);
					}
				};

				// Timeout fallback: give up after 10 seconds
				resumeTimeout = setTimeout(() => {
					resumeOffset = 0;
					cleanup();
				}, 10000);

				setTimeout(() => {
					attachVideoListeners();
					seekToResume();
				}, 500);
			}

			// Track current time + trigger next episode near end
			playerEl.addEventListener('time-update', () => {
				const video = playerEl?.querySelector('video');
				if (video && video.currentTime > 1) {
					lastSavedTime = video.currentTime;
					lastSavedDuration = video.duration || 0;

					// Show next episode card when 60s from end
					if (nextEpisode && video.duration > 0 && !showNextEpisode && !playingNextEpisode) {
						const remaining = video.duration - video.currentTime;
						if (remaining <= 60 && remaining > 0) {
							showNextEpisode = true;
							startAutoPlayCountdown();
						}
					}
				}
			});
		}

		// Set up long-press 2x speed on the player element
		setupPointerHold();

		// Save progress every 30 seconds
		progressInterval = setInterval(saveProgress, 30000);

		loadSubtitles();
	});

	function saveProgress() {
		if (!player.meta || !player.videoId) return;
		const video = playerEl?.querySelector('video');
		const currentTime = video?.currentTime ?? lastSavedTime;
		const duration = video?.duration ?? lastSavedDuration;
		if (!currentTime || currentTime < 2 || !duration || duration === Infinity) return;
		lastSavedTime = currentTime;
		lastSavedDuration = duration;
		const authKey = getAuthKey();
		// Convert seconds to milliseconds for Stremio API
		updateWatchProgress(authKey || '', player.meta, player.videoId, currentTime * 1000, duration * 1000);
	}

	onDestroy(() => {
		if (!browser) return;
		if (lastSavedTime > 2 && lastSavedDuration > 0 && player.meta && player.videoId) {
			const authKey = getAuthKey();
			updateWatchProgress(authKey || '', player.meta, player.videoId, lastSavedTime * 1000, lastSavedDuration * 1000);
		}
		if (progressInterval) clearInterval(progressInterval);
		if (nextEpisodeAutoTimer) clearInterval(nextEpisodeAutoTimer);
		clearStallTimer();
		clearStream();
	});

	let spaceHoldTimer: ReturnType<typeof setTimeout> | null = null;
	let spaceIsHolding = false;
	let spaceDown = false;

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			if (showSourcePicker) showSourcePicker = false;
			else goBack();
		}

		if (e.code === 'Space') {
			// We fully own the space key — prevent vidstack from seeing it
			e.preventDefault();
			e.stopPropagation();

			if (spaceDown) return; // ignore repeat
			spaceDown = true;

			spaceHoldTimer = setTimeout(() => {
				spaceIsHolding = true;
				startSpeed();
			}, 200);
		}
	}

	function handleKeyup(e: KeyboardEvent) {
		if (e.code === 'Space') {
			e.preventDefault();
			e.stopPropagation();
			spaceDown = false;

			if (spaceHoldTimer) { clearTimeout(spaceHoldTimer); spaceHoldTimer = null; }

			if (spaceIsHolding) {
				// Was a hold — stop speed
				stopSpeed();
				spaceIsHolding = false;
			} else {
				// Was a tap — toggle play/pause manually
				const video = playerEl?.querySelector('video');
				if (video) {
					if (video.paused) video.play().catch(() => {});
					else video.pause();
				}
			}
		}
	}

	// Long press on touch/mouse
	let pointerHoldTimer: ReturnType<typeof setTimeout> | null = null;
	let pointerIsHolding = false;

	function setupPointerHold() {
		if (!playerEl) return;

		// Disable vidstack's built-in gesture for tap-to-pause
		// We add an overlay that intercepts all pointer events on the video area
		const overlay = document.createElement('div');
		overlay.style.cssText = 'position:absolute;inset:0;z-index:1;';
		playerEl.appendChild(overlay);

		let tapTimeout: ReturnType<typeof setTimeout> | null = null;

		overlay.addEventListener('pointerdown', (e: PointerEvent) => {
			pointerHoldTimer = setTimeout(() => {
				pointerIsHolding = true;
				startSpeed();
			}, 400);
		});

		overlay.addEventListener('pointerup', () => {
			if (pointerHoldTimer) { clearTimeout(pointerHoldTimer); pointerHoldTimer = null; }
			if (pointerIsHolding) {
				// Was a hold — just stop speed, don't toggle pause
				stopSpeed();
				pointerIsHolding = false;
			} else {
				// Was a tap — toggle play/pause
				const video = playerEl?.querySelector('video');
				if (video) {
					if (video.paused) video.play().catch(() => {});
					else video.pause();
				}
			}
		});

		overlay.addEventListener('pointerleave', () => {
			if (pointerHoldTimer) { clearTimeout(pointerHoldTimer); pointerHoldTimer = null; }
			if (pointerIsHolding) {
				stopSpeed();
				pointerIsHolding = false;
			}
		});

		overlay.addEventListener('dblclick', () => {
			if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
			else document.documentElement.requestFullscreen().catch(() => {});
		});
	}
</script>

<svelte:head>
	<title>{title}{episodeInfo ? ` – ${episodeInfo}` : ''} – Scope</title>
	{@html `<link rel="stylesheet" href="https://cdn.vidstack.io/player/theme.css" />`}
	{@html `<link rel="stylesheet" href="https://cdn.vidstack.io/player/video.css" />`}
</svelte:head>

<svelte:window onkeydowncapture={handleKeydown} onkeyupcapture={handleKeyup} />

<div class="fixed inset-0 z-[100] bg-black">
	{#if ready}
		<media-player
			bind:this={playerEl}
			title={episodeInfo ? `${title} – ${episodeInfo}` : title}
			src={{ src, type: srcType }}
			crossOrigin
			playsInline
			autoPlay
			class="player"
		>
			<media-provider>
				<!-- No gestures — we handle click/hold ourselves -->
			</media-provider>
			<media-video-layout colorScheme="dark"></media-video-layout>
		</media-player>
	{:else}
		<div class="flex h-full w-full flex-col items-center justify-center gap-5">
			<div class="h-14 w-14 animate-spin rounded-full border-[3px] border-white/10 border-t-white/80"></div>
			<p class="text-sm font-medium text-white/70">Loading player...</p>
		</div>
	{/if}

	<!-- 2x speed indicator -->
	{#if isSpeeding}
		<div class="speed-pill">
			<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 19 22 12 13 5 13 19"></polygon><polygon points="2 19 11 12 2 5 2 19"></polygon></svg>
			2x
		</div>
	{/if}

	<!-- Top overlay: back button + title (visible when controls are shown) -->
	<div class="top-overlay">
		<button onclick={goBack} class="back-btn" aria-label="Go back">
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none">
				<path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</button>
		<div class="title-info">
			<span class="player-title">{title}</span>
			{#if episodeInfo}
				<span class="player-episode">{episodeInfo}</span>
			{/if}
		</div>
	</div>

	<!-- Source change button (fixed position, visible with controls) -->
	<button
		onclick={() => showSourcePicker = true}
		class="source-btn"
		aria-label="Change source"
	>
		<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
	</button>

	<!-- Sub loading indicator -->
	{#if subsTotal > 0 && subsLoaded < subsTotal}
		<div class="subs-indicator">
			Loading subs {subsLoaded}/{subsTotal}
		</div>
	{/if}

	<!-- Next episode card -->
	{#if showNextEpisode && nextEpisode}
		<div class="next-ep-card">
			<div class="next-ep-inner">
				<div class="next-ep-text">
					<p class="next-ep-label">Up Next</p>
					<p class="next-ep-title">
						S{String(nextEpisode.season).padStart(2, '0')}E{String(nextEpisode.episode || nextEpisode.number).padStart(2, '0')} – {nextEpisode.name || 'Next Episode'}
					</p>
				</div>
				<div class="next-ep-actions">
					<button onclick={playNextEpisode} class="next-ep-play" disabled={playingNextEpisode}>
						{#if playingNextEpisode}
							<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M232.4,114.49,88.32,26.35a16,16,0,0,0-16.2-.3A15.86,15.86,0,0,0,64,40.74V215.26a15.94,15.94,0,0,0,8.12,13.89,16,16,0,0,0,16.2-.3L232.4,141.51a16,16,0,0,0,0-27Z"/></svg>
						{/if}
						<span>Play Now</span>
						{#if autoPlayCountdown > 0 && !playingNextEpisode}
							<span class="next-ep-countdown">{autoPlayCountdown}</span>
						{/if}
					</button>
					<button onclick={cancelAutoPlay} class="next-ep-cancel">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Stall overlay -->
	{#if stalled && !showSourcePicker}
		<div class="absolute inset-0 z-[120] flex flex-col items-center justify-center stall-in">
			<div class="stall-card">
				<div class="stall-icon">
					<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-white/50"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>
				</div>
				<div class="text-center space-y-2">
					<h2 class="text-lg font-semibold text-white">Stream is taking a while</h2>
					<p class="text-sm text-white/50 max-w-xs">The source might be slow or unavailable. Try a different one.</p>
				</div>
				<div class="flex items-center gap-3">
					<button onclick={() => { showSourcePicker = true; stalled = false; }} class="btn-light btn-pill inline-flex items-center gap-2.5 px-7 py-3">
						<span class="btn-stroke"></span><span class="btn-highlight"></span>
						<span class="relative">Change Source</span>
					</button>
					<button onclick={() => { stalled = false; startStallTimer(); }} class="btn-dark btn-pill px-6 py-3">
						<span class="btn-stroke"></span><span class="btn-highlight"></span>
						<span class="relative">Keep Waiting</span>
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Source picker -->
	{#if showSourcePicker && player.meta}
		<div class="absolute inset-0 z-[130]">
			<StreamModal
				type={player.meta.type}
				videoId={player.videoId || ''}
				meta={player.meta}
				onclose={() => showSourcePicker = false}
				onselect={handleSourceSelect}
			/>
		</div>
	{/if}
</div>

<style>
	/* ─── 2x Speed Pill ─── */
	.speed-pill {
		position: absolute;
		top: 24px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 120;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 16px;
		border-radius: 9999px;
		background: rgba(255, 255, 255, 0.12);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		color: white;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.02em;
		pointer-events: none;
		animation: speedPillIn 0.15s ease-out;
	}

	@keyframes speedPillIn {
		from { opacity: 0; transform: translateX(-50%) scale(0.9); }
		to { opacity: 1; transform: translateX(-50%) scale(1); }
	}

	/* ─── Next Episode Card ─── */
	.next-ep-card {
		position: absolute;
		bottom: 100px;
		right: 24px;
		z-index: 115;
		animation: nextEpIn 0.35s cubic-bezier(0.25, 0.1, 0.25, 1);
	}
	@media (max-width: 640px) {
		.next-ep-card {
			bottom: 80px;
			left: 16px;
			right: 16px;
		}
		.next-ep-inner {
			flex-direction: column;
			gap: 12px;
			align-items: stretch;
		}
		.next-ep-title {
			max-width: none;
		}
		.next-ep-actions {
			justify-content: flex-end;
		}
	}

	.next-ep-inner {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 14px 16px;
		border-radius: 14px;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
	}

	.next-ep-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.next-ep-label {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.4);
	}

	.next-ep-title {
		font-size: 14px;
		font-weight: 500;
		color: white;
		max-width: 240px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.next-ep-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.next-ep-play {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		border-radius: 9999px;
		background: white;
		color: black;
		font-size: 13px;
		font-weight: 600;
		border: none;
		cursor: pointer;
		transition: transform 200ms ease, filter 200ms ease;
	}
	.next-ep-play:hover { filter: brightness(0.9); }
	.next-ep-play:active { transform: scale(0.96); }
	.next-ep-play:disabled { opacity: 0.7; cursor: wait; }

	.next-ep-countdown {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.15);
		font-size: 11px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.next-ep-cancel {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.5);
		border: none;
		cursor: pointer;
		transition: all 150ms ease;
	}
	.next-ep-cancel:hover {
		background: rgba(255, 255, 255, 0.15);
		color: white;
	}

	@keyframes nextEpIn {
		from { opacity: 0; transform: translateX(20px); }
		to { opacity: 1; transform: translateX(0); }
	}

	/* ─── Player ─── */
	.player {
		width: 100%;
		height: 100%;
		--video-brand: #e50914;
		--video-focus-ring-color: rgba(229, 9, 20, 0.5);
		--video-border-radius: 0;
		--video-slider-track-fill-bg: #e50914;
		--video-slider-thumb-bg: #e50914;

		/* Captions */
		--media-cue-font-size: clamp(20px, 2.8vw, 36px);
		--media-cue-color: white;
		--media-cue-bg: rgba(0, 0, 0, 0.75);
		--media-cue-padding-x: 0.5em;
		--media-cue-padding-y: 0.25em;
		--media-cue-border-radius: 4px;
	}

	/* ─── Top Overlay ─── */
	.top-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 110;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 20px;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.7) 0%, transparent 100%);
		opacity: 1;
		transition: opacity 0.3s ease;
		pointer-events: auto;
	}

	/* Hide top overlay when vidstack hides controls */
	:global([data-media-player]:not([data-controls]) ~ .top-overlay),
	:global([data-media-player][data-started]:not([data-controls])) ~ .top-overlay {
		opacity: 0;
		pointer-events: none;
	}

	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		color: rgba(255, 255, 255, 0.85);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}
	.back-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.title-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.player-title {
		font-size: 17px;
		font-weight: 600;
		color: white;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
	}
	.player-episode {
		font-size: 13px;
		color: rgba(255, 255, 255, 0.5);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ─── Source Button ─── */
	.source-btn {
		position: absolute;
		top: 20px;
		right: 20px;
		z-index: 110;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		color: rgba(255, 255, 255, 0.8);
		border: none;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.source-btn:hover {
		background: rgba(0, 0, 0, 0.6);
		color: white;
	}

	:global([data-media-player][data-started]:not([data-controls])) ~ .source-btn {
		opacity: 0;
		pointer-events: none;
	}

	/* ─── Subs Indicator ─── */
	.subs-indicator {
		position: absolute;
		top: 68px;
		right: 20px;
		z-index: 110;
		border-radius: 9999px;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		padding: 4px 12px;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.6);
	}

	/* ─── Stall Card ─── */
	.stall-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 24px;
		padding: 40px;
		border-radius: 24px;
		background: rgba(12, 10, 9, 0.85);
		backdrop-filter: blur(40px);
		-webkit-backdrop-filter: blur(40px);
		border: 1px solid rgba(231, 229, 228, 0.08);
		box-shadow: 0 32px 64px rgba(0, 0, 0, 0.5);
	}

	.stall-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.05);
	}

	.stall-in {
		animation: fadeIn 0.4s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}
</style>
