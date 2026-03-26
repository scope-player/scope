<script lang="ts">
	import { goto } from '$app/navigation';
	import type { StremioMeta } from '$lib/api/stremio';
	import MediaCard from './MediaCard.svelte';

	interface Props {
		title: string;
		items: StremioMeta[];
	}

	let { title, items }: Props = $props();

	function handleClick(item: StremioMeta) {
		goto(`/detail/${item.type}/${item.id}`);
	}
</script>

{#if items.length > 0}
	<section class="space-y-3">
		<h2 class="text-lg font-medium tracking-tight text-stone-200">{title}</h2>
		<div class="relative -m-4">
			<div class="flex gap-4 overflow-x-auto scroll-smooth p-4 scrollbar-hide" style="-webkit-mask-image: linear-gradient(to right, black calc(100% - 48px), transparent); mask-image: linear-gradient(to right, black calc(100% - 48px), transparent); scroll-snap-type: x proximity;">
				{#each items as item (item.id)}
					<div class="w-36 shrink-0 sm:w-40 md:w-44" style="scroll-snap-align: start;">
						<MediaCard {item} onclick={() => handleClick(item)} />
					</div>
				{/each}
			</div>
		</div>
	</section>
{/if}
