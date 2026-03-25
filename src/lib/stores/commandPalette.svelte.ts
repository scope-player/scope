let open = $state(false);
let closing = $state(false);

export function getCommandPalette() {
	return {
		get open() { return open; },
		set open(v: boolean) { open = v; },
		get closing() { return closing; },
		toggle() {
			if (open) {
				closing = true;
				setTimeout(() => { open = false; closing = false; }, 180);
			} else {
				open = true;
			}
		},
		close() {
			if (!open) return;
			closing = true;
			setTimeout(() => { open = false; closing = false; }, 180);
		},
	};
}
