<script lang="ts">
	import type { StremioMeta } from '$lib/api/stremio';

	interface Props {
		item: StremioMeta;
		onclick?: () => void;
	}

	let { item, onclick }: Props = $props();

	let loaded = $state(false);
</script>

<button
	{onclick}
	class="group flex w-full flex-col gap-2 text-left"
>
	<div class="card-shadow relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-border bg-surface transition-all duration-300 ease-out group-hover:scale-[1.03] group-hover:-translate-y-1 group-hover:border-[rgba(231,229,228,0.10)] group-active:scale-[0.98]">
		{#if item.poster}
			{#if !loaded}
				<div class="absolute inset-0 shimmer bg-surface-hover"></div>
			{/if}
			<img
				src={item.poster}
				alt={item.name}
				class="h-full w-full object-cover transition duration-300 {loaded ? 'opacity-100' : 'opacity-0'}"
				loading="lazy"
				onload={() => loaded = true}
			/>
		{:else}
			<div class="flex h-full items-center justify-center text-sm text-text-muted">
				No Image
			</div>
		{/if}

		{#if item.imdbRating}
			<div class="absolute bottom-2 right-2 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
				{item.imdbRating}
			</div>
		{/if}
	</div>

	<div class="min-w-0">
		<p class="truncate text-sm font-medium transition group-hover:text-stone-100">{item.name}</p>
		<p class="text-xs text-text-muted">{item.releaseInfo || ''}</p>
	</div>
</button>
