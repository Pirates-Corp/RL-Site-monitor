import { dbConnect } from "../../../lib/mongodb";
import Site from "../../../models/Site";
import { getUserFromReq } from "../../../lib/auth";

export default async function handler(req, res) {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  await dbConnect();

  if (req.method === "GET") {
    const sites = await Site.find({ owner: user.userId }).sort({ createdAt: -1 });
    return res.status(200).json(sites);
  }

  if (req.method === "POST") {
    const { name, url } = req.body || {};
    if (!name || !url) return res.status(400).json({ error: "Name and URL are required" });

    let domain;
    try {
      domain = new URL(url).hostname;
    } catch {
      return res.status(400).json({ error: "URL must be a valid URL, e.g. https://example.com" });
    }

    const site = await Site.create({ owner: user.userId, name, url, domain });
    return res.status(201).json(site);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
