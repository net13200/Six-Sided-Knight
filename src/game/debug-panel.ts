/**
 * Hidden KPI panel (open with #debug or ?debug). Summarizes the local event
 * log: sessions, retention proxies, per-level win/undo rates and times, a
 * fail heatmap, the tutorial funnel and the KPI hypotheses.
 */
import { computeKpis, type KpiReport, type LevelKpi } from '../meta/kpi';
import { BUILD_DATE, BUILD_SHA, VERSION_LABEL } from '../version';
import type { Game } from './game';
import { el } from './ui';

const fmtPct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`);
const fmtSec = (ms: number | null) => (ms === null ? '–' : `${(ms / 1000).toFixed(1)}s`);
const fmtBool = (b: boolean | null) => (b === null ? 'not yet' : b ? 'yes' : 'no');

function table(
  headers: string[],
  rows: Array<Array<string | Node>>,
  testId?: string,
): HTMLTableElement {
  const t = el('table', testId ? { testId } : {});
  t.append(
    el('thead', {}, [
      el(
        'tr',
        {},
        headers.map((h) => el('th', { text: h })),
      ),
    ]),
  );
  t.append(
    el(
      'tbody',
      {},
      rows.map((r) =>
        el(
          'tr',
          {},
          r.map((c) => el('td', {}, [c])),
        ),
      ),
    ),
  );
  return t;
}

function section(title: string, ...children: Array<Node | string>): HTMLElement {
  return el('section', {}, [el('h2', { text: title }), ...children]);
}

export function openDebugPanel(game: Game): void {
  document.querySelector('.debug-panel')?.remove();
  const tz = new Date().getTimezoneOffset();
  const report: KpiReport = computeKpis(
    game.analytics.events,
    game.levels.map((l) => l.id),
    game.tutorialLevels,
    game.platform.now(),
    tz,
  );
  const panel = el('div', { className: 'debug-panel', testId: 'debug-panel' });
  const close = el('button', {
    className: 'dbg-btn',
    text: 'Close',
    testId: 'debug-close',
    onClick: () => panel.remove(),
  });
  const exportBtn = el('button', {
    className: 'dbg-btn',
    text: 'Copy data (JSON)',
    onClick: () => {
      const text = game.analytics.export();
      void navigator.clipboard?.writeText(text).then(
        () => (exportBtn.textContent = 'Copied'),
        () => {
          raw.value = text;
          raw.hidden = false;
        },
      );
    },
  });
  const raw = el('textarea', { className: 'dbg-raw' });
  raw.hidden = true;
  raw.readOnly = true;
  let armed = false;
  const clearBtn = el('button', {
    className: 'dbg-btn danger',
    text: 'Clear event log',
    onClick: () => {
      if (!armed) {
        armed = true;
        clearBtn.textContent = 'Tap again to clear';
        return;
      }
      game.analytics.clear();
      openDebugPanel(game);
    },
  });

  const levelRow = (l: LevelKpi, i: number) => [
    `${i + 1}. ${l.level}`,
    String(l.attempts),
    String(l.completes),
    fmtPct(l.winRate),
    fmtPct(l.undoRate),
    fmtSec(l.medianTimeMs),
    l.flag ? el('span', { className: 'flag', text: l.flag }) : '',
  ];

  // Fail heatmap: levels x turn buckets.
  const buckets = ['1-2', '3-5', '6-10', '11-20', '21+'];
  const bucketOf = (turn: number) =>
    turn <= 2 ? 0 : turn <= 5 ? 1 : turn <= 10 ? 2 : turn <= 20 ? 3 : 4;
  const failLevels = [...new Set(report.failHeatmap.map((f) => f.level))];
  const maxCount = Math.max(1, ...report.failHeatmap.map((f) => f.count));
  const heatRows = failLevels.map((level) => {
    const counts = buckets.map(() => 0);
    for (const f of report.failHeatmap) if (f.level === level) counts[bucketOf(f.turn)]! += f.count;
    return [
      level,
      ...counts.map((c) => {
        const cell = el('span', { className: 'heat', text: c ? String(c) : '' });
        cell.style.background = `rgba(255,90,106,${c / maxCount})`;
        return cell;
      }),
    ];
  });

  const r = report.retention;
  panel.append(
    el('header', {}, [
      el('h1', { text: 'KPI panel' }),
      el('p', {
        testId: 'debug-version',
        text: `${VERSION_LABEL}${BUILD_SHA !== 'local' ? ` (${BUILD_SHA})` : ''}${BUILD_DATE ? `, built ${BUILD_DATE}` : ''}`,
      }),
      el('p', {
        text: `Local data from this device only. ${game.analytics.events.length} events stored${
          game.analyticsEnabled ? '' : ' · recording is OFF (player opted out)'
        }.`,
      }),
      el('div', { className: 'dbg-actions' }, [exportBtn, clearBtn, close]),
      raw,
    ]),
    section(
      'Hypotheses (targets to validate, not facts)',
      table(
        ['Hypothesis', 'Target', 'Now', 'Status'],
        report.hypotheses.map((h) => [
          h.name,
          h.target,
          h.value,
          el('span', { className: `status ${h.status.replace(/ /g, '-')}`, text: h.status }),
        ]),
        'debug-hypotheses',
      ),
    ),
    section(
      'Sessions',
      table(
        ['Sessions', 'Avg length', 'Levels / session', 'Days active'],
        [
          [
            String(report.sessions.count),
            fmtSec(report.sessions.avgLengthMs),
            report.sessions.avgLevelsPerSession === null
              ? '–'
              : report.sessions.avgLevelsPerSession.toFixed(1),
            String(r.daysActive),
          ],
        ],
        'debug-sessions',
      ),
      table(
        ['Day', 'Sessions'],
        report.sessions.perDay.map((d) => [
          new Date(d.day * 86_400_000 + tz * 60_000).toISOString().slice(0, 10),
          String(d.count),
        ]),
      ),
    ),
    section(
      'Return proxies (D1 / D7 / D30)',
      el('p', {
        className: 'note',
        text: 'Exact = played on that day after the first session. Rolling = played on that day or any later day.',
      }),
      table(
        ['', 'D1', 'D7', 'D30'],
        [
          ['Exact', fmtBool(r.d1), fmtBool(r.d7), fmtBool(r.d30)],
          ['Rolling', fmtBool(r.d1Rolling), fmtBool(r.d7Rolling), fmtBool(r.d30Rolling)],
        ],
        'debug-retention',
      ),
    ),
    section(
      'Levels (win band 60–90%)',
      table(
        ['Level', 'Attempts', 'Wins', 'Win rate', 'Undo rate', 'Median time', 'Flag'],
        report.levels.map(levelRow),
        'debug-levels',
      ),
    ),
    section(
      'Fail heatmap (level × turn)',
      failLevels.length
        ? table(['Level', ...buckets.map((b) => `turn ${b}`)], heatRows, 'debug-heatmap')
        : el('p', { className: 'note', text: 'No fails recorded yet.' }),
    ),
    section(
      'Tutorial funnel',
      table(
        ['Step', 'Level', 'Completed'],
        report.tutorial.map((s) => [String(s.step), s.level, s.completed ? '✓' : '·']),
        'debug-tutorial',
      ),
    ),
    section(
      'Latest events',
      table(
        ['Time', 'Event', 'Props'],
        [...game.analytics.events]
          .slice(-40)
          .reverse()
          .map((e) => [new Date(e.t).toLocaleTimeString(), `${e.n} v${e.v}`, JSON.stringify(e.p)]),
      ),
    ),
  );
  document.body.append(panel);
}
