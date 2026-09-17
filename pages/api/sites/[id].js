import { dbConnect } from "../../../lib/mongodb";
import Site from "../../../models/Site";
import CheckLog from "../../../models/CheckLog";
import { getUserFromReq } from "../../../lib/auth";

export default async function handler(req, res) {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  await dbConnect();
  const { id } = req.query;

  const site = await Site.findOne({ _id: id, owner: user.userId });
  if (!site) return res.status(404).json({ error: "Site not found" });

  if (req.method === "GET") {
    const history = await CheckLog.find({ site: site._id }).sort({ checkedAt: -1 }).limit(100);
    return res.status(200).json({ site, history });
  }

  if (req.method === "DELETE") {
    await Site.deleteOne({ _id: id });
    await CheckLog.deleteMany({ site: id });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "PATCH") {
    const { isPublic, name, url, domainExpiry, sslExpiry } = req.body || {};
    if (typeof isPublic === "boolean") site.isPublic = isPublic;
    if (name) site.name = name.trim();
    if (url) site.url = url.trim();
    if (domainExpiry !== undefined) {
      if (domainExpiry) {
        const d = new Date(domainExpiry);
        site.domainExpiry = d;
        site.domainDaysLeft = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      } else {
        site.domainExpiry = null;
        site.domainDaysLeft = null;
      }
    }
    if (sslExpiry !== undefined) {
      if (sslExpiry) {
        const d = new Date(sslExpiry);
        site.sslExpiry = d;
        site.sslDaysLeft = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      } else {
        site.sslExpiry = null;
        site.sslDaysLeft = null;
      }
    }
    await site.save();
    return res.status(200).json(site);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
