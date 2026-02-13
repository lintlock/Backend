import mongoose from "mongoose";

const machineSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true
    },

    machineId: {
      type: String,
      required: true,
      trim: true
    },

    machineType: {
      type: String,
      enum: ["washer", "dryer"],
      required: true
    },

    manufacturer: {
      type: String,
      required: true,
      trim: true
    },

    model: {
      type: String,
      required: true,
      trim: true
    },
    images: [
      {
        type: String
      }
    ],
    serialNumber: {
      type: String,
      required: true,
      trim: true
    },

    installationDate: {
      type: Date,
    },

    capacity: {
      type: Number,
      required: true
    },

    status: {
      type: String,
      enum: ["operational", "maintenance", "out_of_order"],
      default: "operational"
    },

    location: {
      type: String,
      trim: true
    },

    isActive: {
      type: Boolean,
      default: true
    },
    deletedAt: {
      type: Date,
      default: null,
      select: false
    }
  },
  {
    timestamps: true
  }
);

/**
 * Prevent duplicate machine IDs inside the same store
 */
machineSchema.index(
  { storeId: 1, machineId: 1 },
  { unique: true }
);

const Machine = mongoose.model("Machine", machineSchema);
export default Machine;
