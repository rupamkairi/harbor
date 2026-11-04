<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { toggleMode } from "mode-watcher";
	import SunIcon from "@lucide/svelte/icons/sun";
	import MoonIcon from "@lucide/svelte/icons/moon";
</script>

<Button variant="ghost" size="icon" class="relative size-11 sm:size-8" onclick={toggleMode} aria-label="Toggle color theme">
	<SunIcon class="size-4 scale-100 rotate-0 transition-transform motion-reduce:transition-none dark:scale-0 dark:-rotate-90" />
	<MoonIcon
		class="absolute size-4 scale-0 rotate-90 transition-transform motion-reduce:transition-none dark:scale-100 dark:rotate-0"
	/>
</Button>
