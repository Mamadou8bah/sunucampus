import { buildRange, buildReport } from '../services/stats.js';
import { reportToCsv } from '../services/csv.js';
import { recordAudit } from '../utils/audit.js';

const sectionsFrom = (section) => (section && section !== 'all' ? [section] : undefined);

export async function report(req, res) {
  const { from, to, interval, section } = req.validated.query;
  const range = buildRange({ from, to, interval });
  res.json(await buildReport(range, sectionsFrom(section)));
}

export async function exportCsv(req, res) {
  const { from, to, interval, section } = req.validated.query;
  const range = buildRange({ from, to, interval });
  const data = await buildReport(range, sectionsFrom(section));
  const name = `sunucampus-${section ?? 'all'}-${range.from.toISOString().slice(0, 10)}-to-${range.to.toISOString().slice(0, 10)}.csv`;

  await recordAudit(req.user, 'report.exported', 'User', req.user._id, { section: section ?? 'all', from: range.from, to: range.to });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  // BOM so Excel opens the file as UTF-8.
  res.send(`﻿${reportToCsv(data)}`);
}
