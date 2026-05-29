# Skill Visualizer NPX

A standalone `npx` CLI that scans local and global agent skill folders and generates a self-contained HTML dashboard.

## Usage

```bash
npx skill-visualizer-sh
```

Local checkout:

```bash
npx ../skill-visualizer.sh --no-open
```

Common options:

```bash
npx skill-visualizer-sh --output skills.html --no-open
npx skill-visualizer-sh --root /path/to/project
npx skill-visualizer-sh --include /extra/skills/dir
```

By default it checks workspace and global skill directories such as:

- `./.agents/skills`
- `./.pi/agent/skills`
- `~/.agents/skills`
- `~/.pi/agent/skills`

The generated UI shows each skill's `SKILL.md`, scripts, references, and assets with search, tabs, source grouping, and light/dark mode.

## License

MIT. See [LICENSE](LICENSE).
