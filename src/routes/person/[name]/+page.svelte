<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { search, type StremioMeta } from '$lib/api/stremio';
	import MediaCard from '$lib/components/MediaCard.svelte';

	let name = $state('');
	let movies = $state<StremioMeta[]>([]);
	let series = $state<StremioMeta[]>([]);
	let loading = $state(true);
	let photo = $state('');
	let bio = $state('');

	$effect(() => {
		const unsub = page.subscribe(p => {
			const newName = decodeURIComponent(p.params.name ?? '');
			if (newName !== name) { name = newName; loadPerson(); }
		});
		return unsub;
	});

	async function loadPerson() {
		loading = true;
		movies = [];
		series = [];
		photo = '';
		bio = '';

		// Fetch Wikipedia photo + bio
		try {
			const slug = name.replace(/\s+/g, '_');
			const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`);
			if (wikiRes.ok) {
				const wiki = await wikiRes.json();
				if (wiki.thumbnail?.source) photo = wiki.thumbnail.source;
				if (wiki.extract) bio = wiki.extract;
			}
		} catch {}

		try {
			const results = await search(name);
			// Filter results where this person is in the cast
			const matching = results.filter(r =>
				r.cast?.some(c => c.toLowerCase() === name.toLowerCase()) ||
				r.director?.some(d => d.toLowerCase() === name.toLowerCase()) ||
				r.writer?.some(w => w.toLowerCase() === name.toLowerCase())
			);
			movies = matching.filter(r => r.type === 'movie');
			series = matching.filter(r => r.type === 'series');

			// If search didn't return cast info (search results are minimal), show all results
			if (movies.length === 0 && series.length === 0) {
				movies = results.filter(r => r.type === 'movie').slice(0, 12);
				series = results.filter(r => r.type === 'series').slice(0, 12);
			}
		} catch {}
		loading = false;
	}

	onMount(() => { window.scrollTo(0, 0); });
</script>

<svelte:head>
	<title>{name || 'Person'} – Scope</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-8 py-8 md:px-12 lg:px-16">
	<!-- Header -->
	<div class="mb-10 flex items-start gap-6">
		{#if photo}
			<img src={photo} alt={name} class="h-28 w-28 shrink-0 rounded-full object-cover border-2 border-border shadow-lg" />
		{:else}
			<div class="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-surface border border-border text-4xl font-bold text-text-muted">
				{name.charAt(0).toUpperCase()}
			</div>
		{/if}
		<div class="pt-1">
			<h1 class="text-3xl font-black tracking-tight text-text md:text-4xl">{name}</h1>
			{#if bio}
				<p class="mt-2 max-w-xl text-sm leading-relaxed text-text-secondary line-clamp-3">{bio}</p>
			{:else}
				<p class="mt-1 text-sm text-text-muted">Actor, Director, Writer</p>
			{/if}
		</div>
	</div>

	{#if loading}
		<div class="space-y-8">
			<div>
				<div class="mb-4 h-6 w-32 shimmer rounded-lg bg-surface-hover"></div>
				<div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
					{#each Array(6) as _}
						<div>
							<div class="aspect-[2/3] w-full shimmer rounded-xl bg-surface-hover"></div>
							<div class="mt-2 h-3 w-3/4 shimmer rounded bg-surface-hover"></div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{:else}
		{#if movies.length === 0 && series.length === 0}
			<div class="flex flex-col items-center justify-center gap-4 py-20 text-center">
				<p class="text-text-muted">No results found for "{name}"</p>
				<button onclick={() => history.back()} class="btn-dark btn-pill px-5 py-2 text-sm">
					<span class="btn-stroke"></span><span class="btn-highlight"></span><span class="relative">Go Back</span>
				</button>
			</div>
		{/if}

		{#if movies.length > 0}
			<div class="mb-10">
				<h2 class="mb-4 text-lg font-bold text-text">Movies</h2>
				<div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
					{#each movies as item, i (item.id)}
						<div class="card-fade-in" style="animation-delay: {i * 30}ms">
							<MediaCard {item} onclick={() => goto(`/detail/${item.type}/${item.id}`)} />
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if series.length > 0}
			<div class="mb-10">
				<h2 class="mb-4 text-lg font-bold text-text">TV Shows</h2>
				<div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
					{#each series as item, i (item.id)}
						<div class="card-fade-in" style="animation-delay: {i * 30}ms">
							<MediaCard {item} onclick={() => goto(`/detail/${item.type}/${item.id}`)} />
					</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
