# Skills management

## Plan and implemented behavior

- Keep the existing daemon as the owner of discovery, validation, installation, audit history, and rescans.
- Search the skills directory with `npx --yes skills find <query>`. Load GitHub collections by owner/repository into a disposable project with the skills CLI. Never let the CLI write to actual agent roots.
- Preview every discovered skill and its validation status. Select multiple skills and agent targets, with global or selected-project scope. Route each installation through Harbor's existing staging and path guards; show partial failures and allow retry.
- Create a skill from name, description, and Markdown instructions, then validate and install through the same pipeline.
- Record repository provenance in existing install audit metadata. Read existing CLI project/global lockfiles for provenance where available. Check upstream content against recorded baseline; distinguish local edits when Harbor has a baseline. Untracked skills and network errors remain explicit.
- Discover skills inside repository containers within configured scan depth; containers do not inflate skill counts. Group by source repository, falling back to discovered collection directory.
- Count each canonical skill once in a scope and once for each linked agent. Agent filtering includes symlink consumers. Normalize physical paths before deduplication.
- Keep the installed table compact: descriptions live in tooltips, collections and agent identities remain visible, and update status includes text as well as color.

## Compatibility and limits

Cursor and Gemini are skill discovery/install targets; runtime detection remains limited to Harbor's existing three agent adapters. Brand marks cover Claude, OpenAI/Codex, OpenCode, Cursor, and Gemini.

No database migration. Existing imports, copies, synchronization, and deletion remain available. Sources lacking repository information are explicitly untracked. Search and repository loading require Node.js/npx and network access on the daemon host. Commands have a two-minute timeout. Collections expose at most 100 skills. Update checks do not automatically overwrite installed skills. New creation/catalog installations reject existing target directories, and retries skip completed targets. Lockfile-only differences are labeled "Source differs" because local edits cannot be distinguished without a Harbor baseline.
