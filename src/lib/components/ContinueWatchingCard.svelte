<script lang="ts">
	interface Props {
		item: {
			library_item_id: string;
			tmdb_id: number;
			media_type: string;
			title: string;
			poster_path: string | null;
			backdrop_path: string | null;
			position: number;
			duration: number;
			progress_pct: number;
		};
		onclick?: () => void;
	}

	let { item, onclick }: Props = $props();

	const TMDB_IMG = 'https://image.tmdb.org/t/p';

	function backdrop() {
		return item.backdrop_path ? `${TMDB_IMG}/w780${item.backdrop_path}` : null;
	}

	function poster() {
		return item.poster_path ? `${TMDB_IMG}/w342${item.poster_path}` : null;
	}

	function formatRemaining(): string {
		const remaining = Math.max(0, item.duration - item.position);
		const m = Math.floor(remaining / 60);
		if (m < 60) return `${m}m left`;
		const h = Math.floor(m / 60);
		const mins = m % 60;
		return `${h}h ${mins}m left`;
	}
</script>

<button
	{onclick}
	class="group flex w-64 shrink-0 flex-col gap-1.5 text-left sm:w-72"
>
	<div class="card-shadow relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-surface transition-all duration-200 group-hover:scale-[1.03] group-hover:border-[rgba(231,229,228,0.10)] group-active:scale-[0.98]">
		{#if backdrop()}
			<img
				src={backdrop()}
				alt={item.title}
				class="h-full w-full object-cover transition group-hover:scale-105"
				loading="lazy"
			/>
		{:else if poster()}
			<img
				src={poster()}
				alt={item.title}
				class="h-full w-full object-cover transition group-hover:scale-105"
				loading="lazy"
			/>
		{:else}
			<div class="flex h-full items-center justify-center text-sm text-text-muted">
				No Image
			</div>
		{/if}

		<!-- Play icon overlay -->
		<div class="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30">
			<div class="flex h-12 w-12 scale-90 items-center justify-center rounded-full bg-white/90 opacity-0 backdrop-blur transition group-hover:scale-100 group-hover:opacity-100">
				<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="black"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
			</div>
		</div>

		<!-- Progress bar -->
		<div class="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
			<div
				class="h-full bg-stone-50 transition-all"
				style="width: {item.progress_pct}%"
			></div>
		</div>
	</div>

	<div class="min-w-0 px-0.5">
		<p class="truncate text-sm font-medium transition group-hover:text-stone-100">{item.title}</p>
		<p class="text-xs text-text-muted">{formatRemaining()}</p>
	</div>
</button>
