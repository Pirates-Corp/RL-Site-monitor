import { dbConnect } from "../../../lib/mongodb";
import Site from "../../../models/Site";

// No auth check here on purpose - this powers the public /status page.
// Only fields safe to expose publicly are selected (no owner, no internal IDs beyond what's needed).
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  await dbConnect();

  const sites = await Site.find({ isPublic: true })
    .select("name url domain status lastChecked lastResponseTime domainDaysLeft sslDaysLeft")
    .sort({ name: 1 });

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
  return res.status(200).json(sites);
}
