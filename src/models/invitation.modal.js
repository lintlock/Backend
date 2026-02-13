import mongoose from "mongoose";

const invitationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true
    },

    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    token: {
      type: String,
      required: true,
      unique: true
    },
    
    expiresAt: {
      type: Date,
      required: true
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "cancelled",],
      default: "pending",
    },
    acceptedAt: {
      type: Date,
    },

  },
  { timestamps: true }
);

invitationSchema.index(
  { email: 1, storeId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

const Invitation = mongoose.model("Invitation", invitationSchema);
export default Invitation;