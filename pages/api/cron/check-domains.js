import tls from "tls";
import { dbConnect } from "../../../lib/mongodb";
import Site from "../../../models/Site";
import { getDomainExpiry, daysUntil } from "../../../lib/domain-expiry";

function isAuthorized(req) {
  const secret = req.query.secret || req.headers["x-cron-secret"];
  return secret && secret === process.env.CRON_SECRET;
}

// Checks the SSL cert's validTo date via a raw TLS handshake
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

// Helper to run tasks in batches
async function inBatches(items, batchSize, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(fn));
    out.push(...results);
    if (i + batchSize < items.length) await new Promise((r) => setTimeout(r, 500));
  }
  return out;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });

  await dbConnect();
  const sites = await Site.find({});

  await inBatches(sites, 6, async (site) => {
    const [domainExpiry, sslExpiry] = await Promise.all([
      getDomainExpiry(site.domain),
      getSslExpiry(site.domain),
    ]);

    const updateData = {};
    if (domainExpiry) {
      updateData.domainExpiry = domainExpiry;
      updateData.domainDaysLeft = daysUntil(domainExpiry);
    }
    if (sslExpiry) {
      updateData.sslExpiry = sslExpiry;
      updateData.sslDaysLeft = daysUntil(sslExpiry);
    }

    if (Object.keys(updateData).length > 0) {
      await Site.updateOne({ _id: site._id }, updateData);
    }
  });

  return res.status(200).json({ checked: sites.length });
}
