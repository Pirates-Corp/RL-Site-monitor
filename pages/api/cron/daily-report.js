import { Resend } from "resend";
import { dbConnect } from "../../../lib/mongodb";
import Site from "../../../models/Site";
import CheckLog from "../../../models/CheckLog";

function isAuthorized(req) {
  const secret = req.query.secret || req.headers["x-cron-secret"];
  return secret && secret === process.env.CRON_SECRET;
}

function buildReportHTML(rows, summary) {
  const rowHtml = rows
    .map(
      (r) => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:8px;">${r.name}</td>
        <td style="padding:8px;">
          <span style="color:${r.status === "up" ? "#16a34a" : "#dc2626"};font-weight:600;">
            ${r.status === "up" ? "UP" : "DOWN"}
          </span>
        </td>
        <td style="padding:8px;">${r.uptimePct}%</td>
        <td style="padding:8px;color:${r.domainDaysLeft != null && r.domainDaysLeft <= 30 ? "#dc2626" : "#374151"};">
          ${r.domainDaysLeft != null ? r.domainDaysLeft + "d" : "-"}
        </td>
        <td style="padding:8px;color:${r.sslDaysLeft != null && r.sslDaysLeft <= 30 ? "#dc2626" : "#374151"};">
          ${r.sslDaysLeft != null ? r.sslDaysLeft + "d" : "-"}
        </td>
      </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
      <h2>Site Monitor - Daily Report</h2>
      <p style="font-size:15px;color:#374151;">
        <strong>${summary.up}/${summary.total} sites up.</strong>
        ${summary.down > 0 ? `${summary.down} down. ` : ""}
        ${summary.expiringDomains > 0 ? `${summary.expiringDomains} domain(s) expiring within 30 days. ` : ""}
        ${summary.expiringSsl > 0 ? `${summary.expiringSsl} SSL cert(s) expiring within 30 days.` : ""}
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="text-align:left;border-bottom:2px solid #111827;">
            <th style="padding:8px;">Site</th>
            <th style="padding:8px;">Status</th>
            <th style="padding:8px;">Uptime 24h</th>
            <th style="padding:8px;">Domain exp.</th>
            <th style="padding:8px;">SSL exp.</th>
          </tr>
        </thead>
        <tbody>${rowHtml}</tbody>
      </table>
    </div>`;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });

  await dbConnect();
  const sites = await Site.find({});
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = [];
  let up = 0,
    down = 0,
    expiringDomains = 0,
    expiringSsl = 0;

  for (const site of sites) {
    const logs = await CheckLog.find({ site: site._id, checkedAt: { $gte: since } });
    const upCount = logs.filter((l) => l.up).length;
    const uptimePct = logs.length ? ((upCount / logs.length) * 100).toFixed(1) : "N/A";

    if (site.status === "up") up++;
    else down++;
    if (site.domainDaysLeft != null && site.domainDaysLeft <= 30) expiringDomains++;
    if (site.sslDaysLeft != null && site.sslDaysLeft <= 30) expiringSsl++;

    rows.push({
      name: site.name,
      status: site.status,
      uptimePct,
      domainDaysLeft: site.domainDaysLeft,
      sslDaysLeft: site.sslDaysLeft,
    });
  }

  const summary = { total: sites.length, up, down, expiringDomains, expiringSsl };
  const html = buildReportHTML(rows, summary);

  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.REPORT_FROM_EMAIL,
    to: process.env.REPORT_TO_EMAIL,
    subject: `Site Monitor Report - ${up}/${sites.length} up - ${new Date().toDateString()}`,
    html,
  });

  return res.status(200).json({ ok: true, summary });
}
