import mongoose from "mongoose";

const storeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    address: {
      type: String,
      required: true,
      trim: true
    },

    phone_number: {
      type: String,
      required: true,
      trim: true
    },
    
    technicians: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    ],
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

storeSchema.index({ ownerId: 1, name: 1}, { unique: true });

const Store = mongoose.model("Store", storeSchema);
export default Store;
