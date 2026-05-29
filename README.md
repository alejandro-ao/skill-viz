# Skill Visualizer NPX

A standalone `npx` CLI that scans local and global agent skill folders and serves a live, self-contained HTML dashboard.

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
npx skill-visualizer-sh --no-open
npx skill-visualizer-sh --port 48765
npx skill-visualizer-sh --agent claude
npx skill-visualizer-sh --agent pi
npx skill-visualizer-sh --root /path/to/project
npx skill-visualizer-sh --include /extra/skills/dir
npx skill-visualizer-sh --once --output skills.html
```

By default the CLI starts a local server, opens it in your browser, and reloads automatically when project or global skills change. Use `--once` to write a static HTML file and exit.

By default it starts with the `common` profile, which shows shared `.agents` / `.config/agents` skills. The UI scans known profiles and includes an agent selector so you can switch to one agent at a time:

- common
- Pi
- Claude Code
- Codex
- Antigravity
- Copilot
- Mavis
- MiniMax
- Hermes

Use `--agent <name>` to choose the initially selected profile.

The generated UI shows each skill's `SKILL.md`, scripts, references, and assets with search, source grouping, a contents sidebar, symlink indicators, and light/dark mode.

## License

MIT. See [LICENSE](LICENSE).
