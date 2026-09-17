import mongoose from "mongoose";

const SiteSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  url: { type: String, required: true }, // e.g. https://example.com
  domain: { type: String, required: true }, // e.g. example.com (for WHOIS lookups)

  status: { type: String, enum: ["up", "down", "unknown"], default: "unknown" },
  lastChecked: Date,
  lastResponseTime: Number, // ms

  domainExpiry: Date,
  domainDaysLeft: Number,

  sslExpiry: Date,
  sslDaysLeft: Number,

  alertsEnabled: { type: Boolean, default: true },
  isPublic: { type: Boolean, default: true }, // shown on the public /status page
  createdAt: { type: Date, default: Date.now },
});

SiteSchema.index({ owner: 1 });

export default mongoose.models.Site || mongoose.model("Site", SiteSchema);
