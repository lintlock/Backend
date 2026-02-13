import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: false },
  userName: { type: String, required: false },
  action: { type: String, required: true },
  entity: { type: String, required: false },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: false },
  description: { type: String, required: true },
  metadata: { type: Object, required: false },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: false });

AuditLogSchema.index({ userId: 1, timestamp: -1 });

const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
export default AuditLog;
