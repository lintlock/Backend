import mongoose from "mongoose";
import Task from "./task.modal.js";

const MaintenanceLogSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true
    },
    machineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Machine",
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    labour_cost: {
      type: Number,
      required: true,
      min: 0
    },
    parts_cost: {
      type: Number,
      required: true,
      min: 0
    },
    logEntry: {
      type: String,
      required: true,
      trim: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    images: [String],
    date: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

MaintenanceLogSchema.pre('findOneAndUpdate', async function (next) {
  try {
    const query = this.getQuery();
    const prev = await this.model.findOne(query).lean();
    this._previousDoc = prev;
    return next();
  } catch (err) {
    return next(err);
  }
});

MaintenanceLogSchema.post('findOneAndUpdate', async function (doc) {
  try {
    const prev = this._previousDoc;
    if (!prev || !doc) return;

    const prevLabour = Number(prev.labour_cost || 0);
    const prevParts = Number(prev.parts_cost || 0);
    const newLabour = Number(doc.labour_cost || 0);
    const newParts = Number(doc.parts_cost || 0);

    const labourDiff = newLabour - prevLabour;
    const partsDiff = newParts - prevParts;

    if (labourDiff !== 0 || partsDiff !== 0) {
      await Task.updateOne(
        { _id: doc.taskId },
        { $inc: { labour_cost: labourDiff, parts_cost: partsDiff } }
      );
    }
  } catch (err) {

    console.error('Error updating Task costs after MaintenanceLog update:', err);
  }
});

const MaintenanceLog = mongoose.model("MaintenanceLog", MaintenanceLogSchema);
export default MaintenanceLog;