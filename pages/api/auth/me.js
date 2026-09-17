import { getUserFromReq } from "../../../lib/auth";

export default async function handler(req, res) {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  return res.status(200).json({ email: user.email });
}
