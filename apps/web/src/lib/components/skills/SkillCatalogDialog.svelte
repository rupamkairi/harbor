<script lang="ts">
	import AgentMark from "$lib/components/shared/AgentMark.svelte";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Checkbox } from "$lib/components/ui/checkbox";
	import {
		browseSkillRepository,
		searchSkillCatalog,
		installSkillImport,
		createNewSkill,
	} from "$lib/api/endpoints";
	import {
		SKILL_SOURCE_IDS,
		SKILL_SOURCE_LABELS,
		type SkillLoadResult,
		type InstallTarget,
	} from "@harbor/shared";
	import { getSelectedProjectId } from "$lib/state/app-state.svelte";
	let {
		open = $bindable(false),
		mode = "install",
		onChanged,
	}: {
		open?: boolean;
		mode?: "install" | "create";
		onChanged: () => void;
	} = $props();
	let query = $state("");
	let repository = $state("");
	let searchOutput = $state("");
	let searchResults = $state<{ repository: string; name: string }[]>([]);
	let skills = $state<SkillLoadResult[]>([]);
	let selected = $state<string[]>([]);
	let agents = $state<string[]>([]);
	let project = $state(false);
	let successfulTargets = $state<Record<string, string[]>>({});
	let name = $state("");
	let description = $state("");
	let instructions = $state("");
	let busy = $state(false);
	let error = $state("");
	let result = $state("");
	async function task(fn: () => Promise<void>) {
		busy = true;
		error = "";
		result = "";
		try {
			await fn();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
	function targets(): InstallTarget[] {
		return SKILL_SOURCE_IDS.filter((id) => agents.includes(id)).map((agentId) =>
			project
				? { agentId, scope: "project", projectId: getSelectedProjectId()! }
				: { agentId, scope: "global" },
		);
	}
	async function install() {
		await task(async () => {
			const outcomes =
				mode === "create"
					? [
							await createNewSkill({
								name,
								description,
								instructions,
								targets: targets(),
							}),
						]
					: await (async () => {
							const responses = [];
							for (const id of selected) {
								const remaining = targets().filter(
									(target) => !(successfulTargets[id] ?? []).includes(JSON.stringify(target)),
								);
								if (!remaining.length) continue;
								const response = await installSkillImport(id, remaining);
								responses.push(response);
								successfulTargets[id] = [
									...(successfulTargets[id] ?? []),
									...response.results.filter((r) => r.ok).map((r) => JSON.stringify(r.target)),
								];
								if (response.results.every((r) => r.ok))
									selected = selected.filter((value) => value !== id);
							}
							return responses;
						})();
			onChanged();
			const results = outcomes.flatMap((r) => r.results);
			result = `${results.filter((r) => r.ok).length} installations completed.`;
			const failures = results.filter((r) => !r.ok);
			if (failures.length)
				error = failures.map((r) => `${r.target.agentId}: ${r.error}`).join("\n");
		});
	}
</script>

<Dialog.Dialog bind:open>
	<Dialog.DialogContent class="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
		<Dialog.DialogHeader
			><Dialog.DialogTitle
				>{mode === "create" ? "Create skill" : "Find & install skills"}</Dialog.DialogTitle
			><Dialog.DialogDescription
				>{mode === "create"
					? "Write reusable instructions and choose where to install them."
					: "Search the skills directory or load an entire GitHub collection."}</Dialog.DialogDescription
			></Dialog.DialogHeader
		>
		<fieldset disabled={busy} class="space-y-4">
			{#if mode === "create"}
				<div class="space-y-2">
					<Label for="skill-name">Name</Label><Input
						id="skill-name"
						bind:value={name}
						placeholder="review-my-code"
					/>
					<p class="text-xs text-muted-foreground">
						Lowercase letters, numbers, and hyphens; up to 64 characters.
					</p>
				</div>
				<div class="space-y-2">
					<Label for="skill-description">Description</Label><Input
						id="skill-description"
						bind:value={description}
						placeholder="When should an agent use this skill?"
					/>
				</div>
				<div class="space-y-2">
					<Label for="skill-instructions">Instructions</Label><textarea
						id="skill-instructions"
						bind:value={instructions}
						rows={8}
						class="w-full rounded-md border bg-background p-3 text-sm"></textarea>
				</div>
			{:else}
				<form
					class="flex gap-2"
					onsubmit={(event) => {
						event.preventDefault();
						task(async () => {
							const response = await searchSkillCatalog(query);
							searchOutput = response.output;
							searchResults = response.results;
						});
					}}
				>
					<Input
						aria-label="Search skills directory"
						bind:value={query}
						placeholder="Search skills…"
					/><Button type="submit" variant="outline" disabled={query.trim().length < 2}
						>Search</Button
					>
				</form>
				{#if searchResults.length}
					<div class="max-h-48 overflow-y-auto divide-y rounded-md border">
						{#each searchResults as item (`${item.repository}@${item.name}`)}<div
								class="flex items-center justify-between gap-3 p-3"
							>
								<span class="min-w-0 text-sm"
									><span class="block truncate">{item.name}</span><span
										class="text-muted-foreground text-xs">{item.repository}</span
									></span
								><Button
									size="sm"
									variant="outline"
									onclick={() =>
										task(async () => {
											repository = item.repository;
											skills = [];
											selected = [];
											successfulTargets = {};
											const catalog = await browseSkillRepository(repository);
											skills = catalog.skills;
											selected = skills
												.filter((s) => s.name === item.name && s.installable)
												.map((s) => s.stagingId);
										})}>Choose</Button
								>
							</div>{/each}
					</div>
				{:else if searchOutput}<p class="text-sm text-muted-foreground">
						No skills found. Try another search or load a repository below.
					</p>{/if}
				<form
					class="flex gap-2"
					onsubmit={(event) => {
						event.preventDefault();
						task(async () => {
							skills = [];
							selected = [];
							successfulTargets = {};
							const catalog = await browseSkillRepository(repository);
							skills = catalog.skills;
						});
					}}
				>
					<Input
						aria-label="GitHub repository"
						bind:value={repository}
						placeholder="owner/repository"
					/><Button type="submit" variant="outline" disabled={!repository.trim()}
						>Load collection</Button
					>
				</form>
				{#if skills.length}
					<div class="flex items-center justify-between">
						<span class="text-sm">{skills.length} skills · {selected.length} selected</span><Button
							variant="ghost"
							size="sm"
							onclick={() =>
								(selected = selected.length
									? []
									: skills.filter((s) => s.installable).map((s) => s.stagingId))}
							>{selected.length ? "Clear selection" : "Select all"}</Button
						>
					</div>
					<div class="max-h-56 overflow-y-auto divide-y rounded-md border">
						{#each skills as skill (skill.stagingId)}<label class="flex items-start gap-3 p-3"
								><Checkbox
									disabled={!skill.installable}
									checked={selected.includes(skill.stagingId)}
									onCheckedChange={(checked) =>
										(selected = checked
											? [...selected, skill.stagingId]
											: selected.filter((id) => id !== skill.stagingId))}
								/><span class="text-sm" title={skill.description ?? undefined}
									>{skill.name}{#if !skill.installable}<span class="text-destructive">
											· Validation failed</span
										>{/if}</span
								></label
							>{/each}
					</div>
				{/if}
			{/if}
			<div class="space-y-3">
				<p class="text-sm font-medium">Install to</p>
				<div class="flex flex-wrap gap-4">
					{#each SKILL_SOURCE_IDS as agent}<label class="flex items-center gap-2 text-sm"
							><Checkbox
								checked={agents.includes(agent)}
								onCheckedChange={(checked) =>
									(agents = checked ? [...agents, agent] : agents.filter((id) => id !== agent))}
							/><AgentMark {agent} label={SKILL_SOURCE_LABELS[agent]} /></label
						>{/each}
				</div>
				<label class="flex items-center gap-2 text-sm"
					><Checkbox
						checked={project}
						disabled={!getSelectedProjectId()}
						onCheckedChange={(checked) => (project = checked === true)}
					/>Selected project
					<span class="text-muted-foreground">(otherwise global)</span></label
				>
			</div>
		</fieldset>
		{#if busy}<p role="status" class="text-sm text-muted-foreground">
				Working… Repository loading can take up to two minutes.
			</p>{/if}
		{#if error}<p role="alert" class="whitespace-pre-wrap text-sm text-destructive">
				{error}
			</p>{/if}
		{#if result}<p role="status" class="text-sm">{result}</p>{/if}
		<Dialog.DialogFooter
			><Button variant="outline" disabled={busy} onclick={() => (open = false)}>Close</Button
			><Button
				disabled={busy ||
					!agents.length ||
					(project && !getSelectedProjectId()) ||
					(mode === "install"
						? !selected.length
						: !name || !description.trim() || !instructions.trim())}
				onclick={install}
				>{mode === "create"
					? "Create & install"
					: `Install ${selected.length || "selected"} skills`}</Button
			></Dialog.DialogFooter
		>
	</Dialog.DialogContent>
</Dialog.Dialog>
