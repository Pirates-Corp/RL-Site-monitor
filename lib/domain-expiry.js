import https from "https";
import axios from "axios";
import whois from "whois-json";

const httpsAgent = new https.Agent({ keepAlive: false });

export function daysUntil(date) {
  if (!date) return null;
  const target = new Date(date).getTime();
  if (isNaN(target)) return null;
  return Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24));
}

/**
 * Resolves domain expiration date using multi-tier RDAP + WHOIS fallback
 * with precise detection of registrar suspension (e.g. SUSPENSION nameservers or clientHold).
 * @param {string} domain - e.g. "example.com"
 * @returns {Promise<Date|null>}
 */
export async function getDomainExpiry(domain) {
  if (!domain) return null;
  const cleanDomain = domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");

  // 1. Try RDAP endpoints
  const rdapUrls = [
    `https://rdap.org/domain/${cleanDomain}`,
    cleanDomain.endsWith(".com") ? `https://rdap.verisign.com/com/v1/domain/${cleanDomain}` : null,
    cleanDomain.endsWith(".net") ? `https://rdap.verisign.com/net/v1/domain/${cleanDomain}` : null,
  ].filter(Boolean);

  for (const url of rdapUrls) {
    try {
      const res = await axios.get(url, {
        httpsAgent,
        timeout: 6000,
        maxRedirects: 5,
        headers: {
          Accept: "application/rdap+json, application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SiteMonitor/1.0",
        },
      });

      const data = res.data;
      const events = data?.events || [];
      const nameservers = (data?.nameservers || []).map((n) =>
        (n.ldhName || n.handle || "").toLowerCase()
      );
      const statuses = (data?.status || []).map((s) =>
        (s || "").toLowerCase().replace(/[\s_-]/g, "")
      );

      const expEvent = events.find((e) => e.eventAction === "expiration");
      if (expEvent?.eventDate) {
        let d = new Date(expEvent.eventDate);
        if (!isNaN(d.getTime())) {
          // Check for true suspension (nameservers redirected to suspension or hold statuses)
          const isSuspended =
            nameservers.some((ns) =>
              /suspension|suspended|parking|parked|expired-domain/i.test(ns)
            ) ||
            statuses.some((st) =>
              /clienthold|serverhold|redemptionperiod|pendingdelete/i.test(st)
            );

          if (isSuspended && d > new Date()) {
            const adjusted = new Date(d);
            adjusted.setFullYear(adjusted.getFullYear() - 1);
            if (adjusted < new Date()) {
              d = adjusted;
            }
          }
          return d;
        }
      }
    } catch {
      // try next RDAP endpoint
    }
  }

  // 2. Try WHOIS fallback (especially for ccTLDs like .in, .uk, etc.)
  try {
    const whoisPromise = whois(cleanDomain, { timeout: 4000 });
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 4500));
    const data = await Promise.race([whoisPromise, timeoutPromise]);

    if (data) {
      const raw =
        data.registryExpiryDate ||
        data.expirationDate ||
        data.expiresOn ||
        data.paidTill ||
        data.registrarRegistrationExpirationDate ||
        data.expiryDate ||
        data.validUntil;

      if (raw) {
        let d = new Date(raw);
        if (!isNaN(d.getTime())) {
          const nsStr = (data.nameServer || "").toLowerCase();
          const statusStr = (data.domainStatus || data.status || "").toLowerCase().replace(/[\s_-]/g, "");
          const isSuspended =
            /suspension|suspended|parking|parked|expired-domain/i.test(nsStr) ||
            /clienthold|serverhold|redemptionperiod|pendingdelete/i.test(statusStr);

          if (isSuspended && d > new Date()) {
            const adjusted = new Date(d);
            adjusted.setFullYear(adjusted.getFullYear() - 1);
            if (adjusted < new Date()) {
              d = adjusted;
            }
          }
          return d;
        }
      }
    }
  } catch {
    // WHOIS failed
  }

  return null;
}
