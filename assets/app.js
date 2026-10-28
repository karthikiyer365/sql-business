// Two screens on one page: the problem library (#) and a problem workspace (#<problem id>).
import { connect, query } from './engine.js';
import { sameResult } from './check.js';

/**
 * @typedef {{ role: string, initials: string, note: string }} Exec
 * @typedef {{ ask: string, solution: string, win: string, ordered?: boolean, expected?: Promise<import('./engine.js').Result> }} Part
 * @typedef {{ id: string, title: string, summary: string, level: 'easy' | 'medium' | 'hard', dept: string, concepts: string[],
 *   minutes: number, exec: Exec, brief: string, deliver: string, tables: string[], parts: Part[] }} Problem
 * @typedef {{ name: string, type: string, min: unknown, max: unknown, avg: number | null, median: number | null, nulls: number,
 *   distinct: number, unique: boolean, top: [unknown, number][] }} ColumnProfile
 * @typedef {{ rows: number, grain: string, columns: ColumnProfile[], sample: unknown[][] }} TableProfile
 */

const LEVELS = ['easy', 'medium', 'hard'];   // display order
const MAX_ROWS = 500;                        // result render cap; the row count still shows the full total

const $ = id => document.getElementById(id);
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const int = n => n.toLocaleString('en-US');
const cap = s => s[0].toUpperCase() + s.slice(1);
const plural = (n, word) => `${int(n)} ${word}${n === 1 ? '' : 's'}`;

/** @type {[Problem[], Record<string, TableProfile>]} */
const [problems, profile] = await Promise.all(['problems.json', 'data/profile.json'].map(url => fetch(url).then(r => r.json())));

/* ---------------- Library ---------------- */

function renderLibrary() {
  $('facts').innerHTML = [
    [int(profile.orders.rows), 'orders'],
    [Object.keys(profile).length, 'linked tables'],
    [problems.length, problems.length === 1 ? 'business problem' : 'business problems'],
    [0, 'setup · runs in browser'],
  ].map(([n, label]) => `<div><b>${n}</b><span>${label}</span></div>`).join('');

  const fill = (id, values, label = v => v) =>
    $(id).insertAdjacentHTML('beforeend', values.map(v => `<option value="${esc(v)}">${esc(label(v))}</option>`).join(''));
  fill('f-level', LEVELS.filter(l => problems.some(p => p.level === l)), cap);
  fill('f-concept', [...new Set(problems.flatMap(p => p.concepts))].sort());
  fill('f-dept', [...new Set(problems.map(p => p.dept))].sort());

  $('filters').addEventListener('change', renderCards);
  $('filters').addEventListener('reset', () => setTimeout(renderCards));
  renderCards();
}

const card = p => `
  <a class="card" href="#${esc(p.id)}">
    <div class="card-top"><span class="no">${number(p)}</span><span class="lvl ${p.level}">${p.level}</span></div>
    <h3>${esc(p.title)}</h3>
    <p class="ask">${esc(p.summary)}</p>
    <div class="card-foot">
      <span class="exec">${esc(p.exec.role)} <span>· ${esc(p.dept)}</span></span>
      <div class="tags">${p.concepts.map(c => `<span class="tag">${esc(c)}</span>`).join('')}</div>
      <div class="meta"><span>${plural(p.parts.length, 'part')}</span><span>~${p.minutes} min</span></div>
    </div>
  </a>`;

const number = p => String(problems.indexOf(p) + 1).padStart(2, '0');

function renderCards() {
  const f = { level: $('f-level').value, concept: $('f-concept').value, dept: $('f-dept').value };
  for (const k in f) $(`f-${k}`).classList.toggle('on', !!f[k]);
  const hits = problems.filter(p => (!f.level || p.level === f.level) && (!f.concept || p.concepts.includes(f.concept)) && (!f.dept || p.dept === f.dept));

  $('count').textContent = hits.length === problems.length
    ? [plural(problems.length, 'problem'), ...LEVELS.map(l => [problems.filter(p => p.level === l).length, l]).filter(([n]) => n).map(([n, l]) => `${n} ${l}`)].join(' · ')
    : `Showing ${hits.length} of ${plural(problems.length, 'problem')}`;

  $('groups').innerHTML = hits.length
    ? LEVELS.map(l => {
        const group = hits.filter(p => p.level === l);
        return group.length ? `<section class="group ${l}"><div class="group-head"><i></i><h3>${cap(l)}</h3><span>${group.length}</span></div><div class="grid">${group.map(card).join('')}</div></section>` : '';
      }).join('')
    : `<div class="empty">No problems match these filters yet.<button type="button" class="clear" data-clear>Clear filters</button></div>`;
}
$('groups').addEventListener('click', e => e.target.closest('[data-clear]') && $('filters').reset());

/* ---------------- Problem workspace ---------------- */

/** @type {{ problem: Problem, solved: string[], view: number }} solved[i] = short answer for part i; parts unlock in order. */
let state;

function openProblem(problem) {
  state = { problem, solved: [], view: 0 };
  $('p-no').textContent = number(problem);
  $('p-title').textContent = problem.title;
  $('p-initials').textContent = problem.exec.initials;
  $('p-role').textContent = problem.exec.role;
  $('p-note').textContent = problem.exec.note;
  $('p-brief').textContent = `"${problem.brief}"`;
  $('p-deliver').textContent = problem.deliver;
  $('sql').value = '';
  syncLines();
  $('result').innerHTML = '<p class="placeholder">Run a query to see results here.</p>';
  verdict('idle', 'Nothing reported yet.', 'Run as many queries as you like. Runs stay private. When you think you have the answer, use Report / Ask Exec.');
  renderParts();
  renderTables(problem.tables);

  setStatus('Loading DuckDB…');
  connect(Object.keys(profile)).then(() => { setStatus('Ready'); $('run').disabled = $('report').disabled = false; showExpected(); },
                                    e => setStatus(`Could not load the database: ${e.message}`));
}

const currentPart = () => state.problem.parts[state.solved.length];

function renderParts() {
  const { parts } = state.problem, done = state.solved.length, total = parts.length;
  $('p-parts').innerHTML = parts.map((_, i) => {
    const kind = i < done ? 'done' : i === done ? 'now' : 'lock';
    return `<button type="button" class="pbtn ${kind}${i === state.view ? ' viewing' : ''}" data-part="${i}"${kind === 'lock' ? ' disabled' : ''}
      title="Part ${i + 1} · ${kind === 'done' ? 'solved' : kind === 'now' ? 'in progress' : 'unlocks after the part before it'}"${kind === 'now' ? ' aria-current="step"' : ''}>${i + 1}</button>`;
  }).join('');
  $('p-segs').innerHTML = parts.map((_, i) => `<i class="${i < done ? 'done' : i === done ? 'now' : ''}"></i>`).join('');
  $('p-progress').textContent = done === total ? 'All parts solved' : `Part ${done + 1} of ${total}`;
  $('p-sql-label').textContent = done === total ? 'Your SQL · explore freely' : `Your SQL · Part ${done + 1}`;
  const v = state.view;
  $('p-ask-label').textContent = `Part ${v + 1} of ${total} · ${v < done ? `solved: ${state.solved[v]}` : 'now'}`;
  $('p-ask').innerHTML = esc(parts[v].ask).replace(/`([^`]+)`/g, '<code>$1</code>'); // `label` → highlighted name the answer must use
}

$('p-parts').addEventListener('click', e => {
  const btn = e.target.closest('[data-part]');
  if (btn && !btn.disabled) { state.view = Number(btn.dataset.part); renderParts(); }
});

/** Expected result for a part: the solution runs once, in the browser, and is reused. */
const expected = part => part.expected ??= query(part.solution);

async function showExpected() {
  const part = currentPart();
  if (!part) return $('expect').textContent = '';
  const res = await expected(part);
  $('expect').innerHTML = `Expected shape: <b>${plural(res.rows.length, 'row')} · ${plural(res.columns.length, 'column')}</b> (${esc(res.columns.join(', '))})`;
}

/* ---------------- Tables ---------------- */

function renderTables(tables) {
  document.querySelectorAll('#schema .mnode').forEach(g => g.classList.toggle('used', tables.includes(g.dataset.table)));
  $('tabs').innerHTML = [['schema', 'DATABASE SCHEMA'], ...tables.map(t => [t, t])]
    .map(([id, label], i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-tab="${id}"${i === 0 ? ' class="tab-map"' : ''}>${esc(label)}</button>`).join('');
  $('panes').innerHTML = tables.map(t => tablePane(t, profile[t])).join('');
  selectTab('schema');
}

function selectTab(id) {
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === id));
  document.querySelectorAll('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== id);
}
$('tabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) selectTab(t.dataset.tab); });

/** @param {TableProfile} p */
function tablePane(name, p) {
  const dash = '<td class="n dim">—</td>';
  const isTime = c => c.type.startsWith('timestamp');
  const stat = (c, v) => v == null ? dash : `<td class="n">${isTime(c) ? esc(String(v).slice(0, 10)) : fmtNumber(v, c.type)}</td>`;
  const values = c => {
    const tags = c.top.map(([v, n]) => `<span class="val" title="${esc(v)}">${esc(short(v))} <i>${int(n)}</i></span>`).join('');
    if (c.top.length) return tags + (c.distinct > c.top.length ? `<span class="many">+${int(c.distinct - c.top.length)} more</span>` : '');
    return `<span class="many">${c.unique ? `all unique · ${int(c.distinct)}` : `${int(c.distinct)} distinct`}</span>`;
  };
  const rows = p.columns.map(c => `<tr><td class="col">${esc(c.name)}</td><td class="ty">${esc(c.type)}</td>${stat(c, c.min)}${stat(c, c.max)}${stat(c, c.avg)}${stat(c, c.median)}<td class="n">${int(c.nulls)}</td><td class="uq">${values(c)}</td></tr>`).join('');
  return `
    <div class="tbl-pane" data-pane="${esc(name)}" hidden>
      <p class="grain"><span class="eyebrow">Each row is</span>${esc(p.grain)}</p>
      <div class="totals"><span><b>${int(p.rows)}</b> rows</span><span><b>${p.columns.length}</b> columns</span></div>
      <div class="snip"><table class="profile"><tr><th>column</th><th>type</th><th>min</th><th>max</th><th>avg</th><th>median</th><th>nulls</th><th>values (top 5 · count)</th></tr>${rows}</table></div>
      <span class="sub">Sample · first ${p.sample.length} rows</span>
      <div class="snip">${tableHTML(p.columns.map(c => c.name), p.sample, true)}</div>
    </div>`;
}

const short = v => { const s = String(v); return s.length > 14 ? `${s.slice(0, 8)}…` : s; };
const fmtNumber = (v, type) => type === 'double' && !Number.isInteger(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : int(v);

/** Data table; `truncate` shortens long ids (full value on hover). */
function tableHTML(columns, rows, truncate = false) {
  const td = v => v == null ? '<td class="null">NULL</td>'
    : typeof v === 'number' ? `<td class="n">${v}</td>`
    : truncate && String(v).length > 14 ? `<td title="${esc(v)}">${esc(short(v))}</td>` : `<td>${esc(v)}</td>`;
  return `<table><tr>${columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(td).join('')}</tr>`).join('')}</table>`;
}

/* ---------------- Run / Report ---------------- */

const setStatus = text => $('status').textContent = text;

function verdict(kind, title, say, why = '') {
  const el = $('verdict');
  el.className = `verdict ${kind}`;
  [el.children[0].textContent, el.children[1].textContent, el.children[2].textContent] = [title, say, why];
}

function showResult(res) {
  $('result').innerHTML = tableHTML(res.columns, res.rows.slice(0, MAX_ROWS));
  return `${plural(res.rows.length, 'row')}${res.rows.length > MAX_ROWS ? ` (showing ${MAX_ROWS})` : ''} · ${res.ms} ms`;
}

/** Runs the editor SQL; shows the result or the error. Returns the result, or null on error. */
async function runEditor(tag) {
  const sql = $('sql').value.trim();
  if (!sql) return null;
  setStatus('Running…');
  try {
    const res = await query(sql);
    setStatus(`${showResult(res)} · ${tag}`);
    return res;
  } catch (e) {
    $('result').innerHTML = `<p class="placeholder err-text">${esc(e.message)}</p>`;
    setStatus(`Error · ${tag}`);
    return null;
  }
}

async function report() {
  const part = currentPart();
  if (!part) return;
  const res = await runEditor('reported');
  if (!res) return verdict('err', 'Query error', 'Your query did not run, so there is nothing to report yet. Fix it and try again.', $('result').textContent);
  const want = await expected(part);
  if (!sameResult(res, want, part.ordered)) {
    // ponytail: shape-only feedback for now; error translation, mistake rules and the hint ladder plug in here.
    const shape = r => `${plural(r.rows.length, 'row')} and ${plural(r.columns.length, 'column')}`;
    const say = res.rows.length === want.rows.length && res.columns.length === want.columns.length
      ? 'Right shape, but those numbers don\'t match what I\'m seeing. Check your joins and filters.'
      : `I was expecting ${shape(want)}. You gave me ${shape(res)}.`;
    return verdict('hint', 'Not quite.', say);
  }
  const i = state.solved.length, total = state.problem.parts.length;
  state.solved.push(res.rows.length === 1 && res.columns.length === 1 ? String(res.rows[0][0]) : plural(res.rows.length, 'row'));
  state.view = Math.min(i + 1, total - 1);
  verdict('ok', i + 1 === total ? 'Problem solved.' : 'That\'s it.', part.win, i + 1 === total ? 'All parts solved' : `Part ${i + 1} solved · Part ${i + 2} unlocked`);
  renderParts();
  showExpected();
}

$('run').addEventListener('click', () => runEditor('not reported'));
$('sql').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runEditor('not reported'); } });

// Editor line numbers follow the text and its scroll position.
function syncLines() {
  $('lines').textContent = Array.from({ length: $('sql').value.split('\n').length }, (_, i) => i + 1).join('\n');
}
$('sql').addEventListener('input', syncLines);
$('sql').addEventListener('scroll', () => $('lines').scrollTop = $('sql').scrollTop);

// Report / Ask Exec: the dialog must be visible for 2 s before a click counts.
const reportBtn = $('report'), reportWrap = $('report-wrap');
let armTimer;
function arm() {
  if (reportBtn.disabled || reportWrap.classList.contains('show')) return;
  reportWrap.classList.add('show');
  armTimer = setTimeout(() => { reportWrap.classList.add('armed'); reportBtn.setAttribute('aria-disabled', 'false'); }, 2000);
}
function disarm() {
  clearTimeout(armTimer);
  reportWrap.classList.remove('show', 'armed');
  reportBtn.setAttribute('aria-disabled', 'true');
}
reportWrap.addEventListener('pointerenter', arm);
reportWrap.addEventListener('pointerleave', e => e.pointerType !== 'touch' && disarm());
reportBtn.addEventListener('focus', arm);
reportBtn.addEventListener('blur', disarm);
document.addEventListener('pointerdown', e => !reportWrap.contains(e.target) && disarm());
reportBtn.addEventListener('click', () => {
  if (reportBtn.getAttribute('aria-disabled') === 'true') return arm();
  disarm();
  report();
});

/* ---------------- Router ---------------- */

function route() {
  const problem = problems.find(p => p.id === location.hash.slice(1));
  $('landing').hidden = !!problem;
  $('problem').hidden = !problem;
  if (problem && state?.problem !== problem) { openProblem(problem); scrollTo(0, 0); }
}

document.querySelectorAll('#schema [data-rows]').forEach(t => t.textContent = `${int(profile[t.closest('[data-table]').dataset.table].rows)} rows`);
renderLibrary();
addEventListener('hashchange', route);
route();
