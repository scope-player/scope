<script lang="ts">
	import { goto } from '$app/navigation';
	import { getAuth, getAuthKey, login } from '$lib/stores/auth.svelte';
	import { refreshAddons, installAddon, getAddons } from '$lib/stores/addons.svelte';
	import { loadLibrary } from '$lib/stores/library.svelte';
	import { serverHeartbeat, getServerUrl, setServerUrl } from '$lib/api/stremio';
	import { toast } from 'svelte-sonner';

	const auth = getAuth();
	const addonStore = getAddons();

	let step = $state(0);
	let direction = $state(1); // 1 = forward, -1 = back
	let animating = $state(false);

	// Step 1
	let email = $state('');
	let password = $state('');
	let loggingIn = $state(false);

	// Step 2
	let serverUrl = $state(getServerUrl());
	let serverOnline = $state(false);
	let checkingServer = $state(false);
	let serverTested = $state(false);

	// Step 3
	let addonUrl = $state('');
	let installingAddon = $state(false);

	const steps = [
		{ label: 'Welcome' },
		{ label: 'Account' },
		{ label: 'Server' },
		{ label: 'Addons' },
	];

	async function go(target: number) {
		if (animating || target === step) return;
		direction = target > step ? 1 : -1;
		animating = true;
		await tick(250);
		step = target;
		await tick(50);
		animating = false;
	}

	function tick(ms: number) { return new Promise(r => setTimeout(r, ms)); }

	async function handleLogin() {
		if (!email || !password) return;
		loggingIn = true;
		try {
			await login(email, password);
			const key = getAuthKey()!;
			toast.success('Signed in');
			await Promise.allSettled([refreshAddons(key), loadLibrary(key)]);
		} catch (err: any) {
			toast.error(typeof err?.message === 'string' ? err.message : 'Login failed');
			loggingIn = false;
			return;
		}
		loggingIn = false;
		go(2);
	}

	async function checkServer() {
		if (serverUrl !== getServerUrl()) setServerUrl(serverUrl);
		checkingServer = true;
		serverOnline = await serverHeartbeat();
		checkingServer = false;
		serverTested = true;
	}

	// Auto-test when entering the server step
	$effect(() => {
		if (step === 2 && !serverTested && !checkingServer) {
			checkServer();
		}
	});

	async function handleInstallAddon() {
		if (!addonUrl.trim()) return;
		installingAddon = true;
		try {
			const key = getAuthKey();
			const manifest = await installAddon(key || '', addonUrl.trim());
			toast.success(`${manifest.name} added`);
			addonUrl = '';
		} catch (err: any) {
			toast.error(err?.message || 'Failed to install');
		}
		installingAddon = false;
	}

	function finish() {
		localStorage.setItem('scope_onboarded', 'true');
		goto('/');
	}
</script>

<svelte:head>
	<title>Welcome to Scope</title>
</svelte:head>

<div class="onboarding">
	<!-- Grain texture overlay -->
	<div class="grain"></div>

	<!-- Ambient light -->
	<div class="ambient">
		<div class="orb orb-1"></div>
		<div class="orb orb-2"></div>
	</div>

	<!-- Progress bar -->
	<div class="progress-track">
		<div class="progress-fill" style="width: {((step + 1) / steps.length) * 100}%"></div>
	</div>

	<!-- Step labels (top) -->
	{#if step > 0}
		<div class="step-nav">
			{#each steps as s, i}
				{#if i > 0}
					<button
						class="step-label"
						class:step-active={i === step}
						class:step-done={i < step}
						onclick={() => i <= step && go(i)}
						disabled={i > step}
					>{s.label}</button>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- Content -->
	<div class="content" class:content-exit={animating}>

		<!-- ═══ WELCOME ═══ -->
		{#if step === 0}
			<div class="step-center">
				<!-- Logo -->
				<div class="welcome-logo">
					<svg width="56" height="56" viewBox="0 0 100 100" fill="none">
						<path d="M50 5 L90 27.5 V72.5 L50 95 L10 72.5 V27.5 Z" fill="url(#wg)"/>
						<path d="M40 30 L72 50 L40 70 Z" fill="white"/>
						<defs><linearGradient id="wg" x1="50" y1="5" x2="50" y2="95" gradientUnits="userSpaceOnUse"><stop stop-color="#8B5CF6"/><stop offset="1" stop-color="#6D28D9"/></linearGradient></defs>
					</svg>
				</div>

				<!-- Headline -->
				<h1 class="welcome-headline">Stream anything.<br/>Beautifully.</h1>

				<!-- Features -->
				<div class="welcome-features">
					<div class="wf-item">
						<div class="wf-dot"></div>
						<span>Smart source selection</span>
					</div>
					<div class="wf-item">
						<div class="wf-dot"></div>
						<span>Syncs across devices</span>
					</div>
					<div class="wf-item">
						<div class="wf-dot"></div>
						<span>Addon ecosystem</span>
					</div>
				</div>

				<button onclick={() => go(1)} class="btn-light btn-pill inline-flex items-center gap-2.5 px-8 py-3.5 text-[15px] font-semibold">
					<span class="btn-stroke"></span><span class="btn-highlight"></span>
					<span class="relative">Get Started</span>
					<svg class="relative" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
				</button>
			</div>

		<!-- ═══ ACCOUNT ═══ -->
		{:else if step === 1}
			<div class="step-form">
				<div class="step-header">
					<span class="step-num">01</span>
					<h2 class="step-title">Connect your account</h2>
					<p class="step-desc">Sign in with Stremio to sync your library, addons, and watch history across devices.</p>
				</div>

				{#if auth.isAuthenticated}
					<div class="success-card">
						<div class="success-dot"></div>
						<div>
							<p class="success-label">Connected</p>
							<p class="success-email">{auth.user?.email}</p>
						</div>
					</div>
					<button onclick={() => go(2)} class="btn-light btn-pill px-8 py-3 text-sm font-semibold">
						<span class="btn-stroke"></span><span class="btn-highlight"></span>
						<span class="relative">Continue</span>
					</button>
				{:else}
					<form onsubmit={(e) => { e.preventDefault(); handleLogin(); }} class="form-fields">
						<div class="field">
							<label for="ob-email">Email</label>
							<input id="ob-email" type="email" bind:value={email} required autocomplete="email" placeholder="your@email.com" />
						</div>
						<div class="field">
							<label for="ob-pass">Password</label>
							<input id="ob-pass" type="password" bind:value={password} required autocomplete="current-password" placeholder="Enter password" />
						</div>
						<button type="submit" disabled={loggingIn || !email || !password} class="btn-light w-full rounded-xl py-3.5 text-sm font-semibold disabled:opacity-40">
							<span class="btn-stroke"></span><span class="btn-highlight"></span>
							<span class="relative">{loggingIn ? 'Connecting...' : 'Sign In'}</span>
						</button>
					</form>
					<button onclick={() => go(2)} class="skip-link">Skip for now</button>
				{/if}
			</div>

		<!-- ═══ SERVER ═══ -->
		{:else if step === 2}
			<div class="step-form">
				<div class="step-header">
					<span class="step-num">02</span>
					<h2 class="step-title">Streaming server</h2>
					<p class="step-desc">Connect to a Stremio server for torrent playback. The default works if the Stremio app is running locally.</p>
				</div>

				<div class="server-row">
					<input
						type="url" bind:value={serverUrl} placeholder="http://127.0.0.1:11470"
						class="server-input"
					/>
					<button onclick={checkServer} disabled={checkingServer} class="btn-dark shrink-0 rounded-xl px-5 py-3.5 text-sm font-medium disabled:opacity-40">
						<span class="btn-stroke"></span><span class="btn-highlight"></span>
						<span class="relative">{checkingServer ? 'Testing...' : 'Test'}</span>
					</button>
				</div>

				{#if serverTested && !checkingServer}
					{#if serverOnline}
						<div class="server-status server-ok">
							<div class="status-dot dot-green"></div>
							Server connected
						</div>
					{:else}
						<div class="server-status server-fail">
							<div class="status-dot dot-red"></div>
							Could not reach server
						</div>
					{/if}
				{/if}

				<div class="step-actions">
					<button onclick={() => go(3)} class="btn-light btn-pill px-8 py-3 text-sm font-semibold">
						<span class="btn-stroke"></span><span class="btn-highlight"></span>
						<span class="relative">{serverOnline ? 'Continue' : 'Skip for now'}</span>
					</button>
				</div>
			</div>

		<!-- ═══ ADDONS ═══ -->
		{:else if step === 3}
			<div class="step-form">
				<div class="step-header">
					<span class="step-num">03</span>
					<h2 class="step-title">Add your sources</h2>
					<p class="step-desc">Install addons to unlock streaming sources, subtitles, and additional catalogs.</p>
				</div>

				<div class="addon-input-row">
					<input
						type="url" bind:value={addonUrl}
						onkeydown={(e) => e.key === 'Enter' && handleInstallAddon()}
						placeholder="Paste addon manifest URL"
						class="addon-input"
					/>
					<button onclick={handleInstallAddon} disabled={installingAddon || !addonUrl.trim()} class="btn-dark shrink-0 rounded-xl px-5 py-3.5 text-sm font-medium disabled:opacity-40">
						<span class="btn-stroke"></span><span class="btn-highlight"></span>
						<span class="relative">{installingAddon ? '...' : 'Install'}</span>
					</button>
				</div>

				{#if addonStore.addons.length > 0}
					<div class="addon-list">
						{#each addonStore.addons as addon (addon.manifest.id)}
							<div class="addon-item">
								{#if addon.manifest.logo}
									<img src={addon.manifest.logo} alt="" class="addon-icon" />
								{:else}
									<div class="addon-icon addon-icon-fallback">
										{addon.manifest.name.charAt(0)}
									</div>
								{/if}
								<div class="addon-info">
									<span class="addon-name">{addon.manifest.name}</span>
									<span class="addon-ver">v{addon.manifest.version}</span>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<button onclick={finish} class="btn-light btn-pill inline-flex items-center gap-2.5 px-8 py-3.5 text-[15px] font-semibold">
					<span class="btn-stroke"></span><span class="btn-highlight"></span>
					<svg class="relative" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M232.4,114.49,88.32,26.35a16,16,0,0,0-16.2-.3A15.86,15.86,0,0,0,64,40.74V215.26a15.94,15.94,0,0,0,8.12,13.89,16,16,0,0,0,16.2-.3L232.4,141.51a16,16,0,0,0,0-27Z"/></svg>
					<span class="relative">Start Watching</span>
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	/* ═══ LAYOUT ═══ */
	.onboarding {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #0c0a09;
		overflow: hidden;
	}

	/* ═══ GRAIN ═══ */
	.grain {
		position: absolute;
		inset: -50%;
		width: 200%;
		height: 200%;
		opacity: 0.025;
		pointer-events: none;
		z-index: 10;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
		background-repeat: repeat;
		background-size: 256px 256px;
	}

	/* ═══ AMBIENT ═══ */
	.ambient {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(120px);
	}
	.orb-1 {
		width: 500px;
		height: 500px;
		top: -15%;
		right: -10%;
		background: #7c3aed;
		opacity: 0.06;
		animation: drift1 20s ease-in-out infinite alternate;
	}
	.orb-2 {
		width: 400px;
		height: 400px;
		bottom: -10%;
		left: -10%;
		background: #4c1d95;
		opacity: 0.04;
		animation: drift2 25s ease-in-out infinite alternate;
	}
	@keyframes drift1 {
		from { transform: translate(0, 0); }
		to { transform: translate(-40px, 30px); }
	}
	@keyframes drift2 {
		from { transform: translate(0, 0); }
		to { transform: translate(30px, -20px); }
	}

	/* ═══ PROGRESS ═══ */
	.progress-track {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 2px;
		background: rgba(255, 255, 255, 0.04);
		z-index: 20;
	}
	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #8B5CF6, #a78bfa);
		transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* ═══ STEP NAV ═══ */
	.step-nav {
		position: absolute;
		top: 28px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 32px;
		z-index: 20;
	}
	.step-label {
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.2);
		background: none;
		border: none;
		cursor: pointer;
		transition: color 0.3s ease;
		padding: 0;
	}
	.step-label:disabled { cursor: default; }
	.step-done { color: rgba(255, 255, 255, 0.35); }
	.step-active { color: rgba(255, 255, 255, 0.9); }

	/* ═══ CONTENT ═══ */
	.content {
		position: relative;
		z-index: 15;
		width: 100%;
		max-width: 440px;
		padding: 0 24px;
		animation: contentIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}
	.content-exit {
		animation: contentOut 0.25s ease-in forwards;
	}

	@keyframes contentIn {
		from { opacity: 0; transform: translateY(16px); }
		to { opacity: 1; transform: translateY(0); }
	}
	@keyframes contentOut {
		from { opacity: 1; transform: translateY(0); }
		to { opacity: 0; transform: translateY(-8px); }
	}

	/* ═══ WELCOME STEP ═══ */
	.step-center {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}
	/* ═══ WELCOME ═══ */
	.welcome-logo {
		margin-bottom: 40px;
		filter: drop-shadow(0 12px 32px rgba(139, 92, 246, 0.3));
	}

	.welcome-headline {
		font-size: 44px;
		font-weight: 800;
		line-height: 1.05;
		letter-spacing: -0.035em;
		color: #fafaf9;
		margin-bottom: 32px;
	}

	.welcome-features {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 44px;
	}
	.wf-item {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
		color: rgba(250, 250, 249, 0.4);
	}
	.wf-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #8B5CF6;
		flex-shrink: 0;
	}

	/* ═══ FORM STEPS ═══ */
	.step-form {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.step-header {
		margin-bottom: 4px;
	}
	.step-num {
		display: inline-block;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		color: #8B5CF6;
		margin-bottom: 12px;
		font-variant-numeric: tabular-nums;
	}
	.step-title {
		font-size: 28px;
		font-weight: 700;
		letter-spacing: -0.03em;
		color: #fafaf9;
		line-height: 1.15;
		margin-bottom: 8px;
	}
	.step-desc {
		font-size: 14px;
		line-height: 1.6;
		color: rgba(250, 250, 249, 0.35);
		max-width: 380px;
	}

	/* ═══ FORM FIELDS ═══ */
	.form-fields {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.field label {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: rgba(250, 250, 249, 0.3);
	}
	.field input,
	.server-input,
	.addon-input {
		width: 100%;
		padding: 14px 16px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(255, 255, 255, 0.03);
		color: #fafaf9;
		font-size: 14px;
		outline: none;
		transition: all 0.2s ease;
	}
	.field input::placeholder,
	.server-input::placeholder,
	.addon-input::placeholder {
		color: rgba(255, 255, 255, 0.15);
	}
	.field input:focus,
	.server-input:focus,
	.addon-input:focus {
		border-color: rgba(139, 92, 246, 0.4);
		background: rgba(255, 255, 255, 0.04);
		box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.08);
	}

	/* (buttons use global btn-light/btn-dark primitives) */

	.skip-link {
		margin-top: 8px;
		font-size: 13px;
		color: rgba(255, 255, 255, 0.25);
		background: none;
		border: none;
		cursor: pointer;
		transition: color 0.2s ease;
		align-self: center;
	}
	.skip-link:hover { color: rgba(255, 255, 255, 0.5); }

	/* ═══ SUCCESS CARD ═══ */
	.success-card {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 16px 20px;
		border-radius: 14px;
		background: rgba(34, 197, 94, 0.06);
		border: 1px solid rgba(34, 197, 94, 0.12);
	}
	.success-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #22c55e;
		box-shadow: 0 0 12px rgba(34, 197, 94, 0.4);
		flex-shrink: 0;
	}
	.success-label {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: rgba(34, 197, 94, 0.8);
	}
	.success-email {
		font-size: 14px;
		color: #fafaf9;
		margin-top: 2px;
	}

	/* ═══ SERVER ═══ */
	.server-row, .addon-input-row {
		display: flex;
		gap: 10px;
	}
	.server-input, .addon-input {
		flex: 1;
		font-family: ui-monospace, 'SF Mono', monospace;
		font-size: 13px;
	}
	.server-status {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		padding: 4px 0;
	}
	.server-ok { color: #22c55e; }
	.server-fail { color: #ef4444; }
	.status-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	.dot-green {
		background: #22c55e;
		box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
	}
	.dot-red { background: #ef4444; }

	.step-actions {
		display: flex;
		justify-content: flex-start;
	}

	/* ═══ ADDON LIST ═══ */
	.addon-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 180px;
		overflow-y: auto;
		border-radius: 14px;
		border: 1px solid rgba(255, 255, 255, 0.04);
		background: rgba(255, 255, 255, 0.02);
		padding: 6px;
	}
	.addon-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 10px;
		transition: background 0.15s ease;
	}
	.addon-item:hover { background: rgba(255, 255, 255, 0.03); }
	.addon-icon {
		width: 28px;
		height: 28px;
		border-radius: 8px;
		object-fit: contain;
		flex-shrink: 0;
	}
	.addon-icon-fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.3);
		font-size: 12px;
		font-weight: 700;
	}
	.addon-info {
		display: flex;
		align-items: baseline;
		gap: 6px;
		min-width: 0;
	}
	.addon-name {
		font-size: 13px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.8);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.addon-ver {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.2);
		flex-shrink: 0;
	}

	/* ═══ MOBILE ═══ */
	@media (max-width: 480px) {
		.welcome-headline { font-size: 34px; }
		.step-title { font-size: 24px; }
		.step-nav { gap: 20px; }
		.step-label { font-size: 11px; }
	}
</style>
