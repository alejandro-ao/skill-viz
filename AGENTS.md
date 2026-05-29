# AGENTS.md

Guidance for coding agents working in this repository.

## Project

This is a standalone Node.js / NPX version of the Skill Visualizer CLI. It scans workspace and global agent skill directories, then generates a self-contained HTML dashboard.

## Commands

Run locally:

```bash
npx . --no-open
```

Generate to a specific file:

```bash
npx . --no-open --output /tmp/skills-visualizer.html
```

Syntax check:

```bash
node --check index.js
```

## Structure

- `index.js` — entire CLI implementation and generated HTML template.
- `package.json` — NPX/bin metadata.
- `README.md` — user-facing usage docs.
- `LICENSE` — MIT license.

## Development Notes

- Keep the tool dependency-free; it should run with Node.js built-ins only.
- The generated HTML must remain self-contained and work offline.
- Preserve CLI compatibility with the UV/Python version where practical:
  - `--root <dir>`
  - `--output` / `-o <file>`
  - `--include` / `-I <dir>`
  - `--no-open` / `-n`
- When changing the generated UI, test both the Node script and generated browser JavaScript:

```bash
node --check index.js
npx . --no-open --output /tmp/skills-visualizer.html
```

## Skill Discovery

Default scanned directories:

- `./.agents/skills`
- `./.pi/agent/skills`
- `~/.agents/skills`
- `~/.pi/agent/skills`

A skill is a directory containing a direct `SKILL.md` file. Optional child directories:

- `scripts/`
- `references/`
- `assets/`
