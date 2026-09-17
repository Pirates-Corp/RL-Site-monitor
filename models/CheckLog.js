import mongoose from "mongoose";

const CheckLogSchema = new mongoose.Schema({
  site: { type: mongoose.Schema.Types.ObjectId, ref: "Site", required: true },
  up: { type: Boolean, required: true },
  statusCode: Number,
  responseTime: Number, // ms
  error: String,
  checkedAt: { type: Date, default: Date.now },
});

// Auto-delete logs older than 30 days so the free 512MB Atlas tier doesn't fill up
CheckLogSchema.index({ checkedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
CheckLogSchema.index({ site: 1, checkedAt: -1 });

export default mongoose.models.CheckLog || mongoose.model("CheckLog", CheckLogSchema);
