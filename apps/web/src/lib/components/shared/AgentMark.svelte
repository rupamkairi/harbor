<script lang="ts">
	import FolderIcon from "@lucide/svelte/icons/folder";
	import TerminalIcon from "@lucide/svelte/icons/terminal";
	import * as Tooltip from "$lib/components/ui/tooltip";

	let {
		agent,
		label,
		compact = false,
	}: { agent: string; label: string; compact?: boolean } = $props();
	const logos: Record<string, string> = {
		"claude-code": "claude",
		codex: "openai",
		opencode: "opencode",
		cursor: "cursor",
		"gemini-cli": "googlegemini",
	};
	const logo = $derived(logos[agent]);
	const Icon = $derived(agent === "shared" ? FolderIcon : TerminalIcon);
	const tone = $derived(
		agent === "claude-code"
			? "text-orange-700 dark:text-orange-300"
			: agent === "codex"
				? "text-emerald-700 dark:text-emerald-300"
				: agent === "gemini-cli"
					? "text-blue-700 dark:text-blue-300"
					: "text-foreground",
	);
</script>

{#snippet mark()}
	{#if logo}<span
			class="size-4 bg-current"
			style={`mask: url('/agents/${logo}.svg') center / contain no-repeat; -webkit-mask: url('/agents/${logo}.svg') center / contain no-repeat;`}
			aria-hidden="true"
		></span>
	{:else}<Icon class="size-4" aria-hidden="true" />{/if}
{/snippet}

{#if compact}
	<Tooltip.Root>
		<Tooltip.Trigger class="inline-flex items-center {tone}" aria-label={label}
			>{@render mark()}</Tooltip.Trigger
		>
		<Tooltip.Content>{label}</Tooltip.Content>
	</Tooltip.Root>
{:else}
	<span class="inline-flex items-center gap-1.5 {tone}">{@render mark()}<span>{label}</span></span>
{/if}
