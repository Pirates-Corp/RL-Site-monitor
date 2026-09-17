import axios from "axios";
import tls from "tls";
import { dbConnect } from "../../../lib/mongodb";
import Site from "../../../models/Site";
import CheckLog from "../../../models/CheckLog";
import { getUserFromReq } from "../../../lib/auth";
import { getDomainExpiry, daysUntil } from "../../../lib/domain-expiry";

function getSslExpiry(hostname) {
  return new Promise((resolve) => {
    const socket = tls.connect(443, hostname, { servername: hostname, timeout: 12000 }, () => {
      try {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (cert && cert.valid_to) {
          const d = new Date(cert.valid_to);
          resolve(isNaN(d.getTime()) ? null : d);
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(null);
    });
  });
}

async function checkSite(site) {
  const start = Date.now();
  let up = false;
  let statusCode = 0;
  let error = null;

  try {
    const res = await axios.get(site.url, {
      timeout: 25000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      validateStatus: () => true,
    });
    statusCode = res.status;
    up = res.status < 400;
  } catch (err) {
    up = false;
    statusCode = 0;
    error = err.code || err.message;
  }
  const responseTime = Date.now() - start;

  // SSL and Domain check in parallel
  const [domainExpiry, sslExpiry] = await Promise.all([
    getDomainExpiry(site.domain),
    getSslExpiry(site.domain),
  ]);

  await CheckLog.create({ site: site._id, up, statusCode, responseTime, error });

  const updateData = {
    status: up ? "up" : "down",
    lastChecked: new Date(),
    lastResponseTime: responseTime,
  };

  if (domainExpiry) {
    updateData.domainExpiry = domainExpiry;
    updateData.domainDaysLeft = daysUntil(domainExpiry);
  }
  if (sslExpiry) {
    updateData.sslExpiry = sslExpiry;
    updateData.sslDaysLeft = daysUntil(sslExpiry);
  }

  await Site.updateOne({ _id: site._id }, updateData);

  return {
    name: site.name,
    url: site.url,
    up,
    statusCode,
    responseTime,
    domainDaysLeft: updateData.domainDaysLeft ?? site.domainDaysLeft,
    sslDaysLeft: updateData.sslDaysLeft ?? site.sslDaysLeft,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });

  await dbConnect();

  const sites = await Site.find({ owner: user.userId });
  if (sites.length === 0) {
    return res.status(200).json({ message: "No sites to check", checkedCount: 0 });
  }

  const results = [];
  for (let i = 0; i < sites.length; i += 6) {
    const batch = sites.slice(i, i + 6);
    const batchResults = await Promise.allSettled(batch.map(checkSite));
    for (const r of batchResults) {
      if (r.status === "fulfilled") results.push(r.value);
    }
  }

  return res.status(200).json({
    message: `Checked ${results.length} sites successfully`,
    checkedCount: results.length,
    results,
  });
}
