import mongoose from "mongoose";
import Invitation from "./invitation.modal.js";


const settingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      enum: ["technician_allowed"],
      unique: true,
      trim: true
    },
    value: {
      type: Number, 
      required: true
    }
  },
  { timestamps: true }
);

export const AdminSettings = mongoose.model(
  "AdminSettings",
  settingsSchema,
  "adminsettings"
);

export const canInviteTechician = async (ownerId) => { 

  const currentCount = await Invitation.countDocuments({
    invitedBy:ownerId,
    status: {$ne: "cancelled"}
  });
  const setting = await AdminSettings.findOne({
    key: "technician_allowed"
  }).lean();
 

  if (!setting || typeof setting.value !== "number") {
    return false;
  } 
  return currentCount < setting.value;
};
