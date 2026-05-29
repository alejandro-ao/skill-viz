# skill-viz

A standalone `npx` CLI that scans local and global agent skill folders and serves a live, self-contained HTML dashboard.

## Usage

```bash
npx skill-viz
```

Local checkout:

```bash
npx ../skill-visualizer.sh --no-open
```

Common options:

```bash
npx skill-viz --no-open
npx skill-viz --port 48765
npx skill-viz --agent claude
npx skill-viz --agent pi
npx skill-viz --root /path/to/project
npx skill-viz --include /extra/skills/dir
npx skill-viz --once --output skills.html
```

By default the CLI starts a local server, opens it in your browser, and reloads automatically when project or global skills change. Use `--once` to write a static HTML file and exit.

By default it starts with the `common` profile, which shows shared `.agents` / `.config/agents` skills. The UI scans known profiles and includes an agent selector so you can switch agent views. Some agent views also include shared `common` skills when that agent's docs say it loads `.agents/skills`:

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

Current shared-skill behavior:

- `pi` includes `common` skills (`.agents/skills`) plus Pi-specific skill directories.
- `codex` includes `common` skills, because OpenAI Codex documents `.agents/skills` as repository/user skill locations.
- `antigravity` includes `common` workspace skills, because Google Antigravity documents workspace skills under `.agents/skills`.
- `claude` does **not** include `common`; Claude Code documents `.claude/skills` for personal/project skills.

The generated UI shows each skill's `SKILL.md`, scripts, references, and assets with search, source grouping, a contents sidebar, symlink indicators, and light/dark mode.

## Publishing to npm / npx

`npx` runs packages from the npm registry. To publish this package:

```bash
npm login
npm publish --access public
```

Before publishing, check the package contents:

```bash
npm pack --dry-run
```

After publishing, run it with:

```bash
npx skill-viz
```

For updates, bump the version in `package.json` first:

```bash
npm version patch
npm publish
```

## License

MIT. See [LICENSE](LICENSE).
