import { dbConnect } from "../../../lib/mongodb";
import Site from "../../../models/Site";
import { getUserFromReq } from "../../../lib/auth";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  const { sites } = req.body || {};
  if (!Array.isArray(sites) || sites.length === 0) {
    return res.status(400).json({ error: "Provide a non-empty array of { name, url }" });
  }
  if (sites.length > 200) {
    return res.status(400).json({ error: "Max 200 sites per bulk upload" });
  }

  await dbConnect();

  const created = [];
  const failed = [];

  for (const entry of sites) {
    const name = (entry.name || "").trim();
    const url = (entry.url || "").trim();

    if (!name || !url) {
      failed.push({ ...entry, reason: "Missing name or url" });
      continue;
    }

    let domain;
    try {
      domain = new URL(url).hostname;
    } catch {
      failed.push({ name, url, reason: "Invalid URL" });
      continue;
    }

    try {
      const site = await Site.create({ owner: user.userId, name, url, domain });
      created.push(site);
    } catch (err) {
      failed.push({ name, url, reason: err.message });
    }
  }

  return res.status(201).json({ createdCount: created.length, failedCount: failed.length, created, failed });
}
