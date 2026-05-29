#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const TEXT_EXTENSIONS = new Set(['.md','.txt','.py','.js','.ts','.tsx','.jsx','.json','.yaml','.yml','.toml','.sh','.bash','.zsh','.css','.html','.xml','.csv','.sql']);

function slugify(value) {
  const slug = String(value || '').trim().toLowerCase().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'item';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

function readText(file, maxBytes = 250_000) {
  try {
    const st = fs.statSync(file);
    if (st.size > maxBytes) return { content: `[file omitted: larger than ${maxBytes.toLocaleString()} bytes]`, kind: 'text' };
    const buf = fs.readFileSync(file);
    if (buf.includes(0)) return { content: '[binary file]', kind: 'binary' };
    return { content: buf.toString('utf8'), kind: 'text' };
  } catch (err) {
    return { content: `[could not read file: ${err.message}]`, kind: 'error' };
  }
}

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return [{}, text];
  const end = text.indexOf('\n---', 3);
  if (end === -1) return [{}, text];
  const fm = text.slice(3, end).trim().split(/\r?\n/);
  const body = text.slice(end + 4).trim();
  const meta = {};
  for (let i = 0; i < fm.length;) {
    const line = fm[i];
    if (!line.trim() || line.trimStart().startsWith('#') || !line.includes(':')) { i++; continue; }
    const idx = line.indexOf(':');
    const key = line.slice(0, idx).trim();
    let raw = line.slice(idx + 1).trim();
    if (['|','>','|-','>-','|+','>+'].includes(raw)) {
      const style = raw[0];
      const block = [];
      i++;
      while (i < fm.length) {
        const nxt = fm[i];
        if (nxt.trim() && !nxt.startsWith(' ') && !nxt.startsWith('\t') && nxt.includes(':')) break;
        block.push(nxt); i++;
      }
      const indents = block.filter(x => x.trim()).map(x => x.length - x.trimStart().length);
      const trim = indents.length ? Math.min(...indents) : 0;
      const cleaned = block.map(x => x.slice(trim));
      meta[key] = style === '>' ? cleaned.map(x => x.trim()).filter(Boolean).join(' ') : cleaned.join('\n').trim();
      continue;
    }
    meta[key] = raw.replace(/^['"]|['"]$/g, '');
    i++;
  }
  return [meta, body];
}

function markdownToHtml(md) {
  md = String(md || '').replace(/\r\n/g, '\n');
  const codeBlocks = [];
  md = md.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push(`<pre><code class="language-${escapeHtml(lang || '')}">${escapeHtml(code)}</code></pre>`);
    return `\u0000CODE${codeBlocks.length - 1}\u0000`;
  });
  const out = [];
  let paragraph = [];
  let inUl = false;
  let inOl = false;
  const inline = text => escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  const flushParagraph = () => { if (paragraph.length) { out.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = []; } };
  const closeLists = () => { if (inUl) { out.push('</ul>'); inUl = false; } if (inOl) { out.push('</ol>'); inOl = false; } };
  for (const line of md.split('\n')) {
    const stripped = line.trim();
    if (!stripped) { flushParagraph(); closeLists(); continue; }
    if (stripped.startsWith('\u0000CODE')) { flushParagraph(); closeLists(); out.push(stripped); continue; }
    const h = stripped.match(/^(#{1,6})\s+(.+)$/);
    if (h) { flushParagraph(); closeLists(); const level = h[1].length; out.push(`<h${level} id="${slugify(h[2])}">${inline(h[2])}</h${level}>`); continue; }
    const ul = stripped.match(/^[-*]\s+(.+)$/);
    if (ul) { flushParagraph(); if (inOl) { out.push('</ol>'); inOl = false; } if (!inUl) { out.push('<ul>'); inUl = true; } out.push(`<li>${inline(ul[1])}</li>`); continue; }
    const ol = stripped.match(/^\d+\.\s+(.+)$/);
    if (ol) { flushParagraph(); if (inUl) { out.push('</ul>'); inUl = false; } if (!inOl) { out.push('<ol>'); inOl = true; } out.push(`<li>${inline(ol[1])}</li>`); continue; }
    if (stripped.startsWith('>')) { flushParagraph(); closeLists(); out.push(`<blockquote>${inline(stripped.replace(/^>\s*/, ''))}</blockquote>`); continue; }
    paragraph.push(stripped);
  }
  flushParagraph(); closeLists();
  let rendered = out.join('\n');
  codeBlocks.forEach((block, i) => { rendered = rendered.replace(`\u0000CODE${i}\u0000`, block); });
  return rendered;
}

function languageFor(file) {
  const ext = path.extname(file).toLowerCase().slice(1);
  return ({ py:'python', js:'javascript', ts:'typescript', sh:'bash', yml:'yaml' })[ext] || ext;
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  const walk = current => {
    for (const name of fs.readdirSync(current).sort()) {
      const p = path.join(current, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) results.push(p);
    }
  };
  walk(dir);
  return results;
}

function collectFiles(dir) {
  return walkFiles(dir).map(file => {
    const rel = path.relative(dir, file).split(path.sep).join('/');
    const st = fs.statSync(file);
    const ext = path.extname(file).toLowerCase();
    const { content, kind } = (TEXT_EXTENSIONS.has(ext) || st.size < 80_000) ? readText(file) : { content: '[binary file]', kind: 'binary' };
    return { name: rel, path: file, kind, language: languageFor(file), content };
  });
}

function discoverIn(base, group) {
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base).sort().flatMap(entry => {
    const skillDir = path.join(base, entry);
    const skillMd = path.join(skillDir, 'SKILL.md');
    const linkStat = fs.lstatSync(skillDir);
    const isSymlink = linkStat.isSymbolicLink();
    const symlinkTarget = isSymlink ? fs.realpathSync(skillDir) : '';
    if (!fs.existsSync(skillMd) || !fs.statSync(skillDir).isDirectory()) return [];
    const raw = fs.readFileSync(skillMd, 'utf8');
    const [meta, body] = parseFrontmatter(raw);
    const assetsDir = path.join(skillDir, 'assets');
    const assets = walkFiles(assetsDir).map(p => path.relative(assetsDir, p).split(path.sep).join('/')).sort();
    return [{
      id: slugify(`${group}-${entry}`),
      name: meta.name || entry,
      description: meta.description || '',
      group,
      path: skillDir,
      is_symlink: isSymlink,
      symlink_target: symlinkTarget,
      body_markdown: body,
      body_html: markdownToHtml(body),
      scripts: collectFiles(path.join(skillDir, 'scripts')),
      references: collectFiles(path.join(skillDir, 'references')),
      assets,
    }];
  });
}

function defaultSources(root) {
  const home = os.homedir();
  const candidates = [
    ['Workspace .agents', path.join(root, '.agents', 'skills')],
    ['Workspace .pi', path.join(root, '.pi', 'agent', 'skills')],
    ['Global .agents', path.join(home, '.agents', 'skills')],
    ['Global .pi', path.join(home, '.pi', 'agent', 'skills')],
  ];
  const seen = new Set();
  const unique = [];
  for (const [label, p] of candidates) {
    const resolved = fs.existsSync(p) ? fs.realpathSync(p) : path.resolve(p);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    unique.push([label, p]);
  }
  return unique;
}

function buildHtml(skills, sources) {
  const payload = JSON.stringify(skills).replace(/&/g, '\\u0026').replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  const sourcesHtml = sources.map(([label, p]) => `<li><code>${escapeHtml(label)}</code>: ${escapeHtml(p)}</li>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skill Visualizer</title>
<style>
:root{--bg:#f8fafc;--surface:#ffffff;--surface-2:#f1f5f9;--text:#0f172a;--muted:#64748b;--brand:#18181b;--brand-fg:#fafafa;--line:#e2e8f0;--code:#f8fafc;--ring:rgba(15,23,42,.12);--shadow:0 1px 2px rgba(15,23,42,.05)}
:root[data-theme="dark"]{--bg:#09090b;--surface:#0f0f12;--surface-2:#18181b;--text:#fafafa;--muted:#a1a1aa;--brand:#fafafa;--brand-fg:#09090b;--line:#27272a;--code:#09090b;--ring:rgba(250,250,250,.12);--shadow:0 1px 2px rgba(0,0,0,.35)}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;height:100vh;overflow:hidden;-webkit-font-smoothing:antialiased}
.app{display:grid;grid-template-columns:320px 1fr;height:100vh} aside{background:var(--surface);border-right:1px solid var(--line);padding:20px;overflow:auto} main{overflow:auto;padding:32px}
.sidebar-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px} .icon-btn{border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:4px;width:36px;height:36px;cursor:pointer;box-shadow:var(--shadow)} .icon-btn:hover{background:var(--surface-2)}
h1{font-size:20px;letter-spacing:-.025em;margin:0 0 6px} .subtitle{color:var(--muted);font-size:13px;line-height:1.45} .search{width:100%;margin:20px 0 14px;padding:10px 12px;border-radius:4px;border:1px solid var(--line);background:var(--surface);color:var(--text);outline:none;box-shadow:var(--shadow)} .search:focus{border-color:var(--brand);box-shadow:0 0 0 3px var(--ring)}
.group{color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:18px 0 8px} .skill-btn{width:100%;border:1px solid transparent;background:transparent;color:var(--text);text-align:left;padding:10px 11px;border-radius:4px;cursor:pointer;margin:2px 0;transition:background .15s,border-color .15s}
.skill-btn:hover{background:var(--surface-2)} .skill-btn.active{background:var(--text);border-color:var(--text);color:var(--bg)} .skill-btn strong{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;min-width:0} .skill-btn span{display:block;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px} .skill-btn.active span{color:color-mix(in srgb,var(--bg) 72%,transparent)} .symlink-icon{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;color:var(--muted)} .symlink-icon svg{width:13px;height:13px;stroke-width:2} .skill-btn.active .symlink-icon{color:var(--bg)} h2{display:flex;align-items:center;gap:8px} h2 .symlink-icon{color:var(--muted)} h2 .symlink-icon svg{width:16px;height:16px} .symlink-icon::after{content:attr(data-tooltip);position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%) translateY(2px);background:var(--text);color:var(--bg);border:1px solid var(--line);padding:4px 7px;font:500 12px/1 ui-sans-serif,system-ui,sans-serif;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .12s,transform .12s;z-index:20;box-shadow:var(--shadow)} .symlink-icon::before{content:"";position:absolute;left:50%;bottom:calc(100% + 3px);transform:translateX(-50%);border:5px solid transparent;border-top-color:var(--text);opacity:0;pointer-events:none;transition:opacity .12s;z-index:21} .symlink-icon:hover::after,.symlink-icon:focus::after,.symlink-icon:hover::before,.symlink-icon:focus::before{opacity:1;transform:translateX(-50%) translateY(0)}
.card{max-width:1080px;margin:0 auto;background:var(--surface);border:1px solid var(--line);border-radius:6px;box-shadow:var(--shadow);padding:32px}
.meta{display:flex;gap:8px;flex-wrap:wrap;margin:28px 0 0;padding-top:20px;border-top:1px solid var(--line)} .pill{font-size:12px;color:var(--muted);background:var(--surface-2);border:1px solid var(--line);border-radius:4px;padding:6px 9px}
.path{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);word-break:break-all;font-size:12px} h2{font-size:32px;letter-spacing:-.04em;margin:0 0 8px} h3{margin-top:30px;color:var(--text);letter-spacing:-.02em} a{color:var(--text);text-underline-offset:3px} p,li{line-height:1.7} blockquote{border-left:3px solid var(--line);padding-left:14px;color:var(--muted);margin-left:0}
pre{background:var(--code);border:1px solid var(--line);border-radius:4px;padding:16px;overflow:auto} code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace} :not(pre)>code{background:var(--surface-2);border:1px solid var(--line);padding:2px 5px;border-radius:3px}
.skill-tabs{display:flex;gap:4px;overflow:auto;border-bottom:1px solid var(--line);margin:22px 0 26px;padding:0} .skill-tab{flex:0 0 auto;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--muted);padding:12px 14px;margin-bottom:-1px;cursor:pointer;font-weight:600}
.skill-tab:hover{color:var(--text)} .skill-tab.active{color:var(--text);border-bottom-color:var(--text)} .tab-content{display:none} .tab-content.active{display:block} .file-box{margin:0 0 14px;border:1px solid var(--line);border-radius:4px;overflow:hidden;background:var(--surface)}
.file-header{padding:11px 13px;background:var(--surface-2);border-bottom:1px solid var(--line);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--text);font-size:12px} .file-box pre{border:0;border-radius:0;margin:0;max-height:620px} .resource-label{margin:24px 0 12px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:11px}
.empty{text-align:center;color:var(--muted);padding:80px 20px} .sources{font-size:12px;color:var(--muted);padding-left:18px;line-height:1.6} .count{color:var(--muted);font-size:12px;margin-top:12px}
@media (max-width: 820px){.app{grid-template-columns:1fr} aside{max-height:42vh;border-right:0;border-bottom:1px solid var(--line)} main{padding:18px} .card{padding:22px;border-radius:4px}}
</style></head><body><div class="app"><aside><div class="sidebar-head"><div><h1>Skill Visualizer</h1><div class="subtitle">Standalone dashboard for workspace and global agent skills.</div></div><button id="theme-toggle" class="icon-btn" type="button" aria-label="Toggle theme">◐</button></div><input id="q" class="search" placeholder="Search skills, scripts, references…"><div id="list"></div><div class="count" id="count"></div><h3>Checked sources</h3><ul class="sources">${sourcesHtml}</ul></aside><main><div id="detail" class="card"></div></main></div>
<script type="application/json" id="data">${payload}</script>
<script>
const skills = JSON.parse(document.getElementById('data').textContent);
let active = skills[0]?.id;
const list = document.getElementById('list'), detail = document.getElementById('detail'), q = document.getElementById('q'), count = document.getElementById('count'), themeToggle = document.getElementById('theme-toggle');
const savedTheme = localStorage.getItem('skill-visualizer-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.dataset.theme = savedTheme;
themeToggle.textContent = savedTheme === 'dark' ? '☾' : '☼';
themeToggle.onclick = () => {const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; localStorage.setItem('skill-visualizer-theme', next); themeToggle.textContent = next === 'dark' ? '☾' : '☼';};
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function searchable(s){return [s.name,s.description,s.group,s.path,s.is_symlink?'symlink':'',s.symlink_target,s.body_markdown,...s.scripts.map(f=>f.name+' '+f.content),...s.references.map(f=>f.name+' '+f.content),...s.assets].join(' ').toLowerCase()}
function symlinkIcon(){return '<span class="symlink-icon" data-tooltip="symlink" aria-label="symlink" tabindex="0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>'}
function renderList(){const term=q.value.toLowerCase().trim(); const shown=skills.filter(s=>!term||searchable(s).includes(term)); const groups=[...new Set(shown.map(s=>s.group))]; list.innerHTML=groups.map(g=>'<div class="group">'+esc(g)+'</div>'+shown.filter(s=>s.group===g).map(s=>'<button class="skill-btn '+(s.id===active?'active':'')+'" data-id="'+esc(s.id)+'"><strong>'+esc(s.name)+(s.is_symlink?symlinkIcon():'')+'</strong><span>'+esc(s.description)+'</span></button>').join('')).join('') || '<div class="empty">No matching skills</div>'; count.textContent=shown.length+' skill'+(shown.length===1?'':'s')+' found'; list.querySelectorAll('button').forEach(b=>b.onclick=()=>{active=b.dataset.id; render();})}
function fileBox(f){return '<div class="file-box"><div class="file-header">'+esc(f.name)+' <span class="path">'+esc(f.path)+'</span></div><pre><code class="language-'+esc(f.language)+'">'+esc(f.content)+'</code></pre></div>'}
function resources(s){let html=''; if(s.references.length){html += '<div class="resource-label">References</div>' + s.references.map(fileBox).join('')} if(s.assets.length){html += '<div class="resource-label">Assets</div><ul>' + s.assets.map(a=>'<li><code>'+esc(a)+'</code></li>').join('') + '</ul>'} return html || '<p class="path">No resources found for this skill.</p>'}
function setupTabs(){const buttons=[...detail.querySelectorAll('.skill-tab')], panels=[...detail.querySelectorAll('.tab-content')]; buttons.forEach(btn=>btn.onclick=()=>{buttons.forEach(b=>b.classList.toggle('active',b===btn)); panels.forEach(p=>p.classList.toggle('active',p.dataset.tab===btn.dataset.tab));})}
function renderDetail(){const s=skills.find(x=>x.id===active); if(!s){detail.innerHTML='<div class="empty"><h2>No skills found</h2><p>Add SKILL.md files under a checked skills directory.</p></div>'; return} const hasScripts=s.scripts.length>0, hasResources=s.references.length>0||s.assets.length>0; detail.innerHTML='<h2>'+esc(s.name)+(s.is_symlink?symlinkIcon():'')+'</h2><div class="path">'+esc(s.path)+(s.is_symlink?' → '+esc(s.symlink_target):'')+'</div><p>'+esc(s.description)+'</p><div class="skill-tabs"><button class="skill-tab active" data-tab="skill">SKILL.md</button>'+(hasScripts?'<button class="skill-tab" data-tab="scripts">Scripts ('+s.scripts.length+')</button>':'')+(hasResources?'<button class="skill-tab" data-tab="resources">Resources ('+(s.references.length+s.assets.length)+')</button>':'')+'</div><div class="tab-content active" data-tab="skill"><section>'+s.body_html+'</section></div>'+(hasScripts?'<div class="tab-content" data-tab="scripts">'+s.scripts.map(fileBox).join('')+'</div>':'')+(hasResources?'<div class="tab-content" data-tab="resources">'+resources(s)+'</div>':'')+'<div class="meta"><span class="pill">'+esc(s.group)+'</span><span class="pill">'+s.scripts.length+' scripts</span><span class="pill">'+s.references.length+' references</span><span class="pill">'+s.assets.length+' assets</span></div>'; setupTabs()}
function render(){renderList(); renderDetail()} q.oninput=render; render();
</script></body></html>`;
}

function parseArgs(argv) {
  const args = { root: process.cwd(), output: null, includes: [], open: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root') args.root = path.resolve(argv[++i]);
    else if (arg === '--output' || arg === '-o') args.output = path.resolve(argv[++i]);
    else if (arg === '--include' || arg === '-I') args.includes.push(path.resolve(argv[++i]));
    else if (arg === '--no-open' || arg === '-n') args.open = false;
    else if (arg === '--help' || arg === '-h') { printHelp(); process.exit(0); }
    else { console.error(`Unknown argument: ${arg}`); printHelp(); process.exit(2); }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: skill-visualizer [options]\n\nGenerate an HTML dashboard for local and global agent skills.\n\nOptions:\n  --root <dir>        Workspace root to scan (default: current directory)\n  -o, --output <file> Output HTML file (default: OS temp directory)\n  -I, --include <dir> Additional skills directory to scan. Can be repeated\n  -n, --no-open       Do not open the generated HTML in a browser\n  -h, --help          Show this help`);
}

function openFile(file) {
  const url = `file://${path.resolve(file)}`;
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sources = [...defaultSources(path.resolve(args.root)), ...args.includes.map((p, i) => [`Extra ${i + 1}`, p])];
  const skills = sources.flatMap(([group, p]) => discoverIn(p, group));
  const output = args.output || path.join(os.tmpdir(), 'skills-visualizer.html');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, buildHtml(skills, sources), 'utf8');
  console.log(`Wrote ${skills.length} skills to ${output}`);
  if (args.open) openFile(output);
}

main();
