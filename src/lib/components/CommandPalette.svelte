<script lang="ts">
	import { goto } from '$app/navigation';
	import { search, type StremioMeta } from '$lib/api/stremio';
	import { getCommandPalette } from '$lib/stores/commandPalette.svelte';

	const palette = getCommandPalette();

	let query = $state('');
	let results = $state<StremioMeta[]>([]);
	let selectedIndex = $state(0);
	let searching = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let inputEl = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (palette.open && !palette.closing) {
			query = '';
			results = [];
			selectedIndex = 0;
			setTimeout(() => inputEl?.focus(), 80);
		}
	});

	$effect(() => {
		if (debounceTimer) clearTimeout(debounceTimer);
		const q = query.trim();
		if (!q) { results = []; return; }
		debounceTimer = setTimeout(async () => {
			searching = true;
			try {
				results = (await search(q)).slice(0, 8);
				selectedIndex = 0;
			} catch {
				results = [];
			}
			searching = false;
		}, 250);
	});

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
		} else if (e.key === 'Enter' && results[selectedIndex]) {
			e.preventDefault();
			navigateTo(results[selectedIndex]);
		} else if (e.key === 'Escape') {
			palette.close();
		}
	}

	function navigateTo(item: StremioMeta) {
		const target = `/detail/${item.type}/${item.id}`;
		palette.open = false;
		if (debounceTimer) clearTimeout(debounceTimer);
		goto(target);
	}
</script>

<svelte:window onkeydown={(e) => {
	if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
		e.preventDefault();
		palette.toggle();
	}
}} />

{#if palette.open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]"
		class:palette-backdrop-in={!palette.closing}
		class:palette-backdrop-out={palette.closing}
		onclick={() => palette.close()}
		onkeydown={() => {}}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="w-full max-w-xl overflow-hidden rounded-2xl"
			class:palette-modal-in={!palette.closing}
			class:palette-modal-out={palette.closing}
			style="background: rgba(20, 18, 16, 0.97); backdrop-filter: blur(40px) saturate(1.4); -webkit-backdrop-filter: blur(40px) saturate(1.4); border: 1px solid rgba(231,229,228,0.1); box-shadow: 0 32px 64px rgba(0,0,0,0.5), 0 12px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06);"
			onclick={(e) => e.stopPropagation()}
			onkeydown={() => {}}
		>
			<!-- Search input -->
			<div class="flex items-center gap-3 border-b border-[rgba(231,229,228,0.06)] px-5 py-4">
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-text-muted">
					<circle cx="11" cy="11" r="8"></circle>
					<line x1="21" y1="21" x2="16.65" y2="16.65"></line>
				</svg>
				<input
					bind:this={inputEl}
					bind:value={query}
					onkeydown={handleKeyDown}
					type="text"
					placeholder="Search movies, TV shows..."
					class="flex-1 bg-transparent text-text text-base outline-none placeholder:text-text-muted"
				/>
				<kbd class="hidden rounded-md border border-[rgba(231,229,228,0.08)] bg-[rgba(231,229,228,0.04)] px-1.5 py-0.5 text-[10px] text-text-muted sm:inline">ESC</kbd>
			</div>

			<!-- Results -->
			{#if results.length > 0}
				<div class="max-h-80 overflow-y-auto p-2">
					{#each results as item, i}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-150 {i === selectedIndex ? 'bg-[rgba(231,229,228,0.06)]' : 'hover:bg-[rgba(231,229,228,0.03)]'}"
							onclick={() => navigateTo(item)}
							onmouseenter={() => selectedIndex = i}
							onkeydown={() => {}}
						>
							{#if item.poster}
								<img
									src={item.poster}
									alt=""
									class="h-14 w-10 shrink-0 rounded-lg object-cover"
								/>
							{:else}
								<div class="flex h-14 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-text-muted">
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>
								</div>
							{/if}
							<div class="flex-1 min-w-0">
								<p class="truncate text-sm font-medium text-text">{item.name}</p>
								<div class="flex items-center gap-2 text-xs text-text-muted mt-0.5">
									{#if item.releaseInfo}<span>{item.releaseInfo}</span>{/if}
									{#if item.imdbRating}
										<span class="text-text-muted/50">&middot;</span>
										<span>{item.imdbRating}</span>
									{/if}
								</div>
							</div>
							<span class="shrink-0 rounded-md bg-[rgba(231,229,228,0.06)] px-2 py-0.5 text-[10px] font-medium text-text-muted uppercase">{item.type === 'series' ? 'TV' : 'Movie'}</span>
						</div>
					{/each}
				</div>
			{:else if searching}
				<div class="p-2 space-y-1">
					{#each Array(4) as _}
						<div class="flex items-center gap-3 rounded-xl px-3 py-2.5">
							<div class="h-14 w-10 shrink-0 rounded-lg bg-[rgba(231,229,228,0.06)] shimmer"></div>
							<div class="flex-1 space-y-2">
								<div class="h-3.5 w-3/4 rounded bg-[rgba(231,229,228,0.06)] shimmer"></div>
								<div class="h-2.5 w-1/3 rounded bg-[rgba(231,229,228,0.04)] shimmer"></div>
							</div>
						</div>
					{/each}
				</div>
			{:else if query.trim()}
				<div class="px-4 py-10 text-center text-sm text-text-muted">No results found</div>
			{:else}
				<div class="px-4 py-10 text-center text-sm text-text-muted">Start typing to search...</div>
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
		from { background: rgba(0, 0, 0, 0); backdrop-filter: blur(0px); -webkit-backdrop-filter: blur(0px); }
		to { background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
	}
	@keyframes backdropOut {
		from { background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
		to { background: rgba(0, 0, 0, 0); backdrop-filter: blur(0px); -webkit-backdrop-filter: blur(0px); }
	}
	@keyframes modalIn {
		from { opacity: 0; filter: blur(8px); transform: scale(0.96) translateY(-8px); }
		to { opacity: 1; filter: blur(0px); transform: scale(1) translateY(0); }
	}
	@keyframes modalOut {
		from { opacity: 1; filter: blur(0px); transform: scale(1) translateY(0); }
		to { opacity: 0; filter: blur(6px); transform: scale(0.97) translateY(-6px); }
	}
</style>
