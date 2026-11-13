<script lang="ts">
	import AgentMark from "$lib/components/shared/AgentMark.svelte";
	import SkillCatalogDialog from "$lib/components/skills/SkillCatalogDialog.svelte";
	import { checkSkillUpdates } from "$lib/api/endpoints";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import RefreshIcon from "@lucide/svelte/icons/refresh-cw";
	import FolderIcon from "@lucide/svelte/icons/folder";
	let catalogOpen = $state(false);
	let catalogMode = $state<"install" | "create">("install");
	let checking = $state(false);
	let updates = $state<Awaited<ReturnType<typeof checkSkillUpdates>>>([]);
	let textFilter = $state("");
	let agentFilter = $state("");
	let groupFilter = $state("");
	function groupName(skill: SkillResource) {
		return skill.skill.group ?? "Ungrouped";
	}

	async function checkUpdates() {
		checking = true;
		rescanError = null;
		try {
			updates = await checkSkillUpdates(scopeQueryParams());
		} catch (e) {
			rescanError = e instanceof Error ? e.message : String(e);
		} finally {
			checking = false;
		}
	}

	import PageHeader from "$lib/components/shell/PageHeader.svelte";
	import DataTable from "$lib/components/shared/DataTable.svelte";
	import ErrorState from "$lib/components/shared/ErrorState.svelte";
	import ScopeBadge from "$lib/components/shared/ScopeBadge.svelte";
	import ValidationBadge from "$lib/components/shared/ValidationBadge.svelte";
	import SkillDetailSheet from "$lib/components/skills/SkillDetailSheet.svelte";
	import SkillImportWizard from "$lib/components/skills/import/SkillImportWizard.svelte";
	import { Button } from "$lib/components/ui/button";
	import { TableHead, TableRow, TableCell } from "$lib/components/ui/table";
	import * as Select from "$lib/components/ui/select";
	import * as Tooltip from "$lib/components/ui/tooltip";
	import { createQuery } from "$lib/state/query.svelte";
	import {
		getResourceVersion,
		getSelectedProjectId,
		invalidateResources,
		scopeQueryParams,
	} from "$lib/state/app-state.svelte";
	import { listSkills, rescanProject, scanGlobal } from "$lib/api/endpoints";
	import { SKILL_SOURCE_LABELS, type SkillResource, type SkillStatus } from "@harbor/shared";

	const STATUS_OPTIONS: { value: SkillStatus; label: string }[] = [
		{ value: "valid", label: "Valid" },
		{ value: "warning", label: "Warning" },
		{ value: "invalid", label: "Invalid" },
		{ value: "unknown", label: "Unknown" },
	];

	let statusFilter = $state<SkillStatus | undefined>(undefined);

	const skillsQuery = createQuery(() => listSkills(scopeQueryParams()));
	const groups = $derived([...new Set((skillsQuery.data ?? []).map(groupName))].sort());

	// Re-run the query whenever the selected project changes or resources are invalidated.
	$effect(() => {
		getSelectedProjectId();
		getResourceVersion();
		skillsQuery.refresh();
	});

	let importOpen = $state(false);
	let rescanning = $state(false);
	let rescanError = $state<string | null>(null);

	async function handleRescan() {
		if (rescanning) return;
		rescanning = true;
		rescanError = null;
		try {
			const projectId = getSelectedProjectId();
			if (projectId) {
				await rescanProject(projectId);
			} else {
				await scanGlobal();
			}
			invalidateResources();
			skillsQuery.refresh();
		} catch (error) {
			rescanError = error instanceof Error ? error.message : String(error);
		} finally {
			rescanning = false;
		}
	}

	function handleImported() {
		invalidateResources();
		skillsQuery.refresh();
	}

	function handleSkillChanged() {
		invalidateResources();
		skillsQuery.refresh();
	}

	const filteredSkills = $derived.by(() => {
		const skills = skillsQuery.data ?? [];
		return skills.filter(
			(s) =>
				(!statusFilter || s.skill.status === statusFilter) &&
				(!agentFilter ||
					s.agentId === agentFilter ||
					s.linkedAgents.includes(agentFilter as typeof s.agentId)) &&
				(!groupFilter || groupName(s) === groupFilter) &&
				`${s.skill.name ?? s.skill.dirName} ${s.skill.description ?? ""} ${s.path}`
					.toLowerCase()
					.includes(textFilter.toLowerCase()),
		);
	});
	const emptyDescription = $derived(
		getSelectedProjectId()
			? "Rescan the selected project to discover skills here."
			: "Rescan the global skill locations to discover skills here.",
	);

	let selectedSkill = $state<SkillResource | null>(null);
	let detailOpen = $state(false);

	function openSkill(skill: SkillResource) {
		selectedSkill = skill;
		detailOpen = true;
	}

	function truncatePath(path: string, max = 40): string {
		if (path.length <= max) return path;
		return `…${path.slice(path.length - max + 1)}`;
	}

	function relativeTime(iso: string | null): string {
		if (!iso) return "Never";
		const date = new Date(iso);
		if (Number.isNaN(date.getTime())) return "Unknown";
		const diffMs = Date.now() - date.getTime();
		const diffSec = Math.round(diffMs / 1000);
		const units: [Intl.RelativeTimeFormatUnit, number][] = [
			["year", 60 * 60 * 24 * 365],
			["month", 60 * 60 * 24 * 30],
			["day", 60 * 60 * 24],
			["hour", 60 * 60],
			["minute", 60],
		];
		const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
		for (const [unit, secondsInUnit] of units) {
			if (Math.abs(diffSec) >= secondsInUnit) {
				return rtf.format(-Math.round(diffSec / secondsInUnit), unit);
			}
		}
		return rtf.format(-diffSec, "second");
	}
</script>

<div class="page-stack">
	<PageHeader title="Skills" description="Skills discovered across agents.">
		{#snippet actions()}
			<Button variant="outline" onclick={handleRescan} disabled={rescanning}>
				{rescanning ? "Rescanning…" : "Rescan"}
			</Button>
			<Button variant="outline" disabled={checking} onclick={checkUpdates}
				><RefreshIcon class="size-4" />{checking ? "Checking…" : "Check updates"}</Button
			>
			<Button
				variant="outline"
				onclick={() => {
					catalogMode = "create";
					catalogOpen = true;
				}}><PlusIcon class="size-4" />Create skill</Button
			>
			<Button variant="outline" onclick={() => (importOpen = true)}>Import</Button>
			<Button
				onclick={() => {
					catalogMode = "install";
					catalogOpen = true;
				}}><DownloadIcon class="size-4" />Find & install</Button
			>
		{/snippet}
	</PageHeader>

	<div class="flex flex-wrap items-center gap-3">
		<input
			aria-label="Filter installed skills"
			class="h-9 rounded-md border bg-background px-3 text-sm"
			bind:value={textFilter}
			placeholder="Filter skills…"
		/>
		<select
			aria-label="Filter by agent"
			class="h-9 rounded-md border bg-background px-2 text-sm"
			bind:value={agentFilter}
			><option value="">All agents</option
			>{#each Object.entries(SKILL_SOURCE_LABELS) as [id, label]}<option value={id}
					>{label} ({(skillsQuery.data ?? []).filter(
						(s) => s.agentId === id || s.linkedAgents.some((a) => a === id),
					).length})</option
				>{/each}</select
		>
		<select
			aria-label="Filter by collection"
			class="h-9 w-56 max-w-full min-w-0 rounded-md border bg-background px-2 text-sm"
			bind:value={groupFilter}
			><option value="">All collections</option>{#each groups as group}<option value={group}
					>{group}</option
				>{/each}</select
		>
		<span class="text-muted-foreground text-sm"
			>{filteredSkills.length} of {skillsQuery.data?.length ?? 0} skills</span
		>
		<Select.Root
			type="single"
			value={statusFilter ?? ""}
			onValueChange={(value) => {
				statusFilter = (value || undefined) as SkillStatus | undefined;
			}}
		>
			<Select.Trigger class="w-48" aria-label="Filter skills by validation status">
				{statusFilter
					? (STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? "All statuses")
					: "All statuses"}
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="">All statuses</Select.Item>
				{#each STATUS_OPTIONS as option (option.value)}
					<Select.Item value={option.value}>{option.label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		{#if rescanError}
			<p class="text-destructive text-sm">Rescan failed: {rescanError}</p>
		{/if}
	</div>

	{#if skillsQuery.error}
		<ErrorState message={skillsQuery.error} onRetry={skillsQuery.refresh} />
	{:else}
		<DataTable
			items={filteredSkills}
			loading={skillsQuery.loading}
			columns={7}
			emptyTitle={statusFilter ? "No matching skills" : "No skills found"}
			emptyDescription={statusFilter ? "Try another status to see more skills." : emptyDescription}
		>
			{#snippet emptyAction()}
				<Button variant="outline" size="sm" onclick={handleRescan} disabled={rescanning}>
					{rescanning ? "Rescanning…" : "Rescan"}
				</Button>
			{/snippet}
			{#snippet header()}
				<TableHead>Name</TableHead>
				<TableHead>Collection</TableHead>
				<TableHead>Scope</TableHead>
				<TableHead>Agent</TableHead>
				<TableHead>Validation</TableHead>
				<TableHead>Path</TableHead>
				<TableHead>Modified</TableHead>
			{/snippet}
			{#snippet row(skill: SkillResource)}
				<TableRow
					class="cursor-pointer"
					role="button"
					tabindex={0}
					onclick={() => openSkill(skill)}
					onkeydown={(event) => {
						if (event.target !== event.currentTarget) return;
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							openSkill(skill);
						}
					}}
				>
					<TableCell class="font-medium"
						><Tooltip.Root
							><Tooltip.Trigger class="text-left"
								>{skill.skill.name ?? skill.skill.dirName}</Tooltip.Trigger
							><Tooltip.Content class="max-w-sm"
								>{skill.skill.description ?? "No description provided"}</Tooltip.Content
							></Tooltip.Root
						></TableCell
					>
					<TableCell
						><span class="inline-flex items-center gap-2 text-sm"
							><FolderIcon class="size-4 text-muted-foreground" />{groupName(skill)}</span
						></TableCell
					>
					<TableCell><ScopeBadge scope={skill.scope} /></TableCell>
					<TableCell
						><span class="flex min-w-max items-center gap-2"
							>{#each skill.linkedAgents.length ? skill.linkedAgents : [skill.agentId] as agent}<AgentMark
									{agent}
									label={SKILL_SOURCE_LABELS[agent]}
									compact
								/>{/each}</span
						></TableCell
					>
					<TableCell
						><ValidationBadge status={skill.skill.status} />
						{@const update = updates.find((u) => u.resourceId === skill.id)}
						{#if update}<span
								title={update.message ?? update.repository ?? ""}
								class="ml-2 text-xs"
								class:text-amber-700={update.status === "available"}
								class:text-destructive={update.status === "error"}
								>{update.status === "available"
									? "Update available"
									: update.status === "different"
										? "Source differs"
										: update.status}{update.locallyModified ? " · Local edits" : ""}</span
							>{/if}
					</TableCell>
					<TableCell>
						<Tooltip.Root>
							<Tooltip.Trigger class="font-mono text-xs">
								{truncatePath(skill.path)}
							</Tooltip.Trigger>
							<Tooltip.Content>{skill.path}</Tooltip.Content>
						</Tooltip.Root>
					</TableCell>
					<TableCell>
						<Tooltip.Root>
							<Tooltip.Trigger class="text-muted-foreground text-xs">
								{relativeTime(skill.mtime)}
							</Tooltip.Trigger>
							<Tooltip.Content>{skill.mtime ?? "Unknown"}</Tooltip.Content>
						</Tooltip.Root>
					</TableCell>
				</TableRow>
			{/snippet}
		</DataTable>
	{/if}
</div>

<SkillDetailSheet bind:open={detailOpen} skill={selectedSkill} onChanged={handleSkillChanged} />
<SkillImportWizard bind:open={importOpen} onInstalled={handleImported} />

<SkillCatalogDialog bind:open={catalogOpen} mode={catalogMode} onChanged={handleSkillChanged} />
