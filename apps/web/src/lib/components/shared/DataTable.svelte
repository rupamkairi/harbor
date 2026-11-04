<script lang="ts" generics="T">
	import {
		Table,
		TableHeader,
		TableBody,
		TableRow,
		TableCell,
	} from "$lib/components/ui/table";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import EmptyState from "./EmptyState.svelte";
	import type { Snippet } from "svelte";

	let {
		items,
		loading = false,
		columns,
		header,
		row,
		emptyTitle = "No results",
		emptyDescription,
		emptyAction,
		skeletonRows = 5,
	}: {
		items: T[] | undefined;
		loading?: boolean;
		columns: number;
		header: Snippet;
		row: Snippet<[T]>;
		emptyTitle?: string;
		emptyDescription?: string;
		emptyAction?: Snippet;
		skeletonRows?: number;
	} = $props();
</script>

<div class="data-table min-w-0 overflow-hidden rounded-lg border bg-card" aria-busy={loading}>
	<Table class="min-w-[720px]">
		<TableHeader>
			<TableRow>
				{@render header()}
			</TableRow>
		</TableHeader>
		<TableBody>
			{#if loading}
				{#each Array(skeletonRows) as _, i (i)}
					<TableRow>
						{#each Array(columns) as __, j (j)}
							<TableCell>
								<Skeleton class="h-4 w-full" />
							</TableCell>
						{/each}
					</TableRow>
				{/each}
			{:else if items && items.length > 0}
				{#each items as item, i (i)}
					{@render row(item)}
				{/each}
			{/if}
		</TableBody>
	</Table>
	{#if !loading && (!items || items.length === 0)}
		<div class="border-t p-3 sm:p-4">
			<EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
		</div>
	{/if}
</div>

<style>
	.data-table :global([data-slot="table-container"]) {
		overscroll-behavior-x: contain;
	}

	.data-table :global(tr[role="button"]:focus-visible) {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
		background: var(--muted);
	}

	@media (max-width: 639px) {
		.data-table :global(th:first-child),
		.data-table :global(td:first-child) {
			position: sticky;
			left: 0;
			z-index: 1;
			min-width: 10rem;
			max-width: 11rem;
			white-space: normal;
			overflow-wrap: anywhere;
			background: var(--card);
			border-right: 1px solid var(--border);
		}

		.data-table :global(td) {
			height: 3rem;
		}
	}
</style>
