<script lang="ts">
	import { page } from '$app/stores';
</script>

<svelte:head>
	<title>Error {$page.status} - Scope</title>
</svelte:head>

<div class="flex min-h-[80vh] flex-col items-center justify-center gap-6 px-6 text-center">
	<div class="flex h-20 w-20 items-center justify-center rounded-full bg-surface">
		<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
			<circle cx="12" cy="12" r="10"></circle>
			<line x1="12" y1="8" x2="12" y2="12"></line>
			<line x1="12" y1="16" x2="12.01" y2="16"></line>
		</svg>
	</div>

	<div class="space-y-2">
		<h1 class="text-5xl font-black tracking-tight text-text">{$page.status}</h1>
		<p class="text-lg text-text-muted">{$page.error?.message || 'Something went wrong'}</p>
	</div>

	<a
		href="/"
		class="btn-dark btn-pill inline-flex items-center gap-2 px-6 py-3 text-sm font-medium"
	>
		<span class="btn-stroke"></span>
		<span class="btn-highlight"></span>
		<svg class="relative" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
			<polyline points="9 22 9 12 15 12 15 22"></polyline>
		</svg>
		<span class="relative">Go Home</span>
	</a>
</div>
