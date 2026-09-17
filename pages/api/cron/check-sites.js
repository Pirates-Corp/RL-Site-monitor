import axios from "axios";
import { dbConnect } from "../../../lib/mongodb";
import Site from "../../../models/Site";
import CheckLog from "../../../models/CheckLog";

// Protect this endpoint so only your scheduler (cron-job.org / GitHub Actions /
// Vercel Cron) can trigger it - pass ?secret=... or header x-cron-secret matching CRON_SECRET
function isAuthorized(req) {
  const secret = req.query.secret || req.headers["x-cron-secret"];
  return secret && secret === process.env.CRON_SECRET;
}

async function checkOne(site) {
  const start = Date.now();
  try {
    const res = await axios.get(site.url, {
      timeout: 25000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      validateStatus: () => true, // don't throw on 4xx/5xx, we handle it ourselves
    });
    const responseTime = Date.now() - start;
    const up = res.status < 400;
    return { site, up, statusCode: res.status, responseTime };
  } catch (err) {
    return {
      site,
      up: false,
      statusCode: 0,
      responseTime: Date.now() - start,
      error: err.code || err.message,
    };
  }
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });

  await dbConnect();
  const sites = await Site.find({});

  // Ping every site in parallel - keeps us well under Vercel's 10s function timeout
  const results = await Promise.allSettled(sites.map(checkOne));

  const summary = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { site, up, statusCode, responseTime, error } = r.value;

    await CheckLog.create({ site: site._id, up, statusCode, responseTime, error });
    await Site.updateOne(
      { _id: site._id },
      { status: up ? "up" : "down", lastChecked: new Date(), lastResponseTime: responseTime }
    );
    summary.push({ name: site.name, url: site.url, up, statusCode, responseTime });
  }

  return res.status(200).json({ checked: summary.length, results: summary });
}
