import mongoose from "mongoose";
import Machine from "../models/machine.modal.js";
import Task from "../models/task.modal.js";
import Store from "../models/store.modal.js";
import User from "../models/users.model.js";
import asyncHandler from "../utility/asyncHandler.js";
import MaintenanceLog from "../models/maintenanceLog.modal.js";
import Invitation from "../models/invitation.modal.js";
import { createOrUpdateOperatingHours } from "../utility/operatingHours.service.js";
import OperatingHours from "../models/operatingHours.modal.js";
import Subscription from "../models/subscription.modal.js";
import SubscriptionPlan from "../models/subsciptionPlan.modal.js";
import { logEvent } from "../services/auditLogger.js";
import { deleteCloudinaryImages } from "../middlewares/upload.middleware.js";
import { activateTrialSubscription } from "./payment.controller.js";
import TaskRequest from "../models/taskRequest.modal.js";

export const createStore = asyncHandler(async (req, res, next) => {
  const { name, address, phone_number } = req.body;

  if ([name, address, phone_number].some(f => !f?.trim())) {
    return next({ message: "All fields are required", statusCode: 400 });
  }

  const ownerId = req.user._id;

  const store = await Store.findOneAndUpdate(
    { ownerId },
    {
      $set: {
        name,
        address,
        phone_number,
        isActive: true,
        deletedAt: null,
      },
    },
    { new: true, upsert: true, runValidators: true }
  );

  const existingSubscription = await Subscription.findOne({ ownerId });

  if (!existingSubscription) {
    const trialPlan = await SubscriptionPlan.findOne({
      plan_type: "trial",
      isActive: true,
    });


    await activateTrialSubscription({
      userEmail: req.user.email,
      userName: req.user.name,
      ownerId,
      priceId: trialPlan.priceId,
      planId: trialPlan._id,
    });
  }

  logEvent({
    user: req.user,
    action: "STORE_CREATED",
    entity: "Store",
    entityId: store._id,
  });

  res.status(200).json({
    message: "Store saved successfully",
    store,
  });
});

export const getOwnersStore = asyncHandler(async (req, res) => {
  const ownerId = req.user._id;

  const store = await Store.findOne({
    ownerId,
    isActive: true,
    deletedAt: null,
  }).select("name address phone_number createdAt updatedAt");

  if (!store) {
    return res.status(404).json({ message: "Store not found for this user." });
  }
 return res.status(200).json({
    store,
  });
});

export const getOwnerDashboard = asyncHandler(async (req, res, next) => {
  const ownerId = req.user._id;

  const store = await Store.findOne({
    ownerId,
    isActive: true,
    deletedAt: null,
  }).select("name address");

  if (!store) {
    return next({ message: "Store not found for this user.", statusCode: 404 });
  }


  const totalMachines = await Machine.countDocuments({
    storeId: store._id,
    isActive: true,
  });


const openTaskfilter = { createdBy: ownerId,deletedAt:null, status: { $in: ["needs_service", "open"] } };
const completedTaskfilter = { createdBy: ownerId,deletedAt:null, status: "completed" };
 const [totalOpenTask, tasks] = await Promise.all([
    Task.countDocuments(openTaskfilter),
    Task.find(openTaskfilter)
      .populate({ path: "machineId", select: "machineId" })
      .populate({ path: "technicianId", select: "fullName _id" })
      .sort({ createdAt: -1 })
      .limit(7)
      .lean(),
  ]);
 const [totalCompletedTask, completedTasks] = await Promise.all([
    Task.countDocuments(completedTaskfilter),
    Task.find(completedTaskfilter)
      .populate({ path: "machineId", select: "machineId" })
      .populate({ path: "technicianId", select: "fullName _id" })
      .sort({ createdAt: -1 })
      .limit(7)
      .lean(),
  ]);
  const openTaskRows = tasks.map((task) => ({
    id: task._id,
    machine: task.machineId?.machineId || "—",
    technician: task.technicianId?.fullName || "—",
    technicianId: task.technicianId?._id || null,
    date: task.assign_date
      ? new Date(task.assign_date).toLocaleDateString("en-US", {
          month: "short",
          day: "2-digit",
          year: "numeric",
        })
      : "—",
    status: task.status || "—",
    partsCost: task.parts_cost ?? 0,
    labourCost: task.labour_cost ?? 0,
    task:task.task || "—",
    note: task.description || task.task || "—",
    images: task.images || [],
  }));

  const completedTaskRows = completedTasks.map((task) => ({
    id: task._id,
    machine: task.machineId?.machineId || "—",
    technician: task.technicianId?.fullName || "—",
    technicianId: task.technicianId?._id || null,
    date: task.assign_date
      ? new Date(task.assign_date).toLocaleDateString("en-US", {
          month: "short",
          day: "2-digit",
          year: "numeric",
        })
      : "—",
    status: task.status || "—",
    partsCost: task.parts_cost ?? 0,
    labourCost: task.labour_cost ?? 0,
    task:task.task || "—",
    note: task.description || task.task || "—",
    images: task.images || [],
  }));

  
  const subscription = await Subscription.findOne({ ownerId })
    .select("plan_type currentPeriodEnd currentPeriodStart status planId")
    .lean();

  let planDuration = null;
  if (subscription) {
    if (subscription.plan_type === "trial") {
      planDuration = "7 Days";
    } else {
      const plan = await SubscriptionPlan.findById(subscription.planId).lean();
      if (plan && typeof plan.durationMonths === "number") {
        planDuration =
          plan.durationMonths === 12
            ? "12 Months"
            : `${plan.durationMonths} Months`;
      } else {
        planDuration =
          subscription.plan_type === "basic" ? "1 Month" : "12 Months";
      }
    }
  }

  return res.status(200).json({
    store,
    totalMachines,
    totalOpenTask,
    totalCompletedTask,
    openTasks: openTaskRows,
    completedTasks: completedTaskRows,
    subscription: subscription ? { ...subscription, planDuration } : null,
  });
});

export const updateOperatingHours = asyncHandler(async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const userId = req.user._id;
    let targetStoreId = storeId;

    if (!targetStoreId) {
      const store = await Store.findOne({
        ownerId: userId,
        isActive: true,
        deletedAt: null,
      });
      if (!store)
        return next({
          message: "Store not found for this user.",
          statusCode: 404,
        });
      targetStoreId = store._id;
    } else {
      const store = await Store.findById(targetStoreId);
      if (!store) return next({ message: "Store not found.", statusCode: 404 });
      if (String(store.ownerId) !== String(userId))
        return next({ message: "Not authorized", statusCode: 403 });
    }

    const { days } = req.body;
    const operatingHours = await createOrUpdateOperatingHours(
      targetStoreId,
      days,
    );

    // Log audit event for operating hours update
    const store = await Store.findById(targetStoreId).select("name").lean();
    logEvent({
      user: req.user,
      action: "OPERATING_HOURS_UPDATED",
      entity: "OperatingHours",
      entityId: targetStoreId,
      metadata: {
        storeName: store?.name || "Unknown",
        storeId: targetStoreId,
      },
    });

    return res.status(200).json({ message: "Operating hours updated", operatingHours });

  } catch (error) {
    return next({ message: error.message, statusCode: 400 });
  }
});

export const getOperatingHours = asyncHandler(async (req, res) => {
  const { storeId } = req.params;
  const userId = req.user._id;

  let targetStore;

  if (!storeId) {
    targetStore = await Store.findOne({
      ownerId: userId,
      isActive: true,
      deletedAt: null,
    });

    if (!targetStore) {
      const err = new Error("Store not found for this user");
      err.statusCode = 404;
      throw err;
    }
  } else {
    targetStore = await Store.findById(storeId);

    if (!targetStore) {
      const err = new Error("Store not found");
      err.statusCode = 404;
      throw err;
    }

    if (String(targetStore.ownerId) !== String(userId)) {
      const err = new Error("Not authorized");
      err.statusCode = 403;
      throw err;
    }
  }

  const operatingHours = await OperatingHours.findOne({
    storeId: targetStore._id,
  });

  if (!operatingHours) {
    return res.status(200).json({
      status: 0,
      operatingHours: null,
      message: "Operating hours not set yet",
    });
  }

  return res.status(200).json({
    status: 1,
    operatingHours,
  });
});

export const getUserStore = asyncHandler(async (req, res, next) => {
  try {
    const ownerId = req.user._id;
    const store = await Store.findOne({
      ownerId: ownerId,
      isActive: true,
      deletedAt: null,
    });
    if (!store) {
      return next({
        message: "Store not found for this user.",
        statusCode: 404,
      });
    }
    return res.status(200).json({ store });
  } catch (error) {
    return next(error);
  }
});

export const getActiveSubscriptionPlan = asyncHandler(
  async (req, res, next) => {
    const ownerId = req.user._id;
    const subscription = await Subscription.findOne({ ownerId }).lean();
    if (!subscription) {
      return next({
        message: "No active subscription found.",
        statusCode: 404,
      });
    }
    const plan = await SubscriptionPlan.findById(subscription.planId).lean();
    if (!plan) {
      return next({ message: "Subscription plan not found.", statusCode: 404 });
    }
    return res.status(200).json({ subscription, plan });
  },
);

export const getStoreMachines = asyncHandler(async (req, res) => {
  const ownerId = req.user._id;

  const store = await Store.findOne({ ownerId, isActive: true }).lean();
  if (!store) {
    return res.status(404).json({ message: "Store not found for this user." });
  }

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const filter = { storeId: store._id };

  if (req.query.search) {
    const q = req.query.search;
    filter.$or = [
      { machineId: { $regex: q, $options: "i" } },
      { machineType: { $regex: q, $options: "i" } },
    ];
  }

  const [total, machines] = await Promise.all([
    Machine.countDocuments(filter),
    Machine.find(filter).skip(skip).limit(limit).lean(),
  ]);

  if (!machines.length) {
    return res.status(200).json({
      machines: [],
      pagination: {
        total,
        page,
        limit,
        totalPages: 0,
      },
    });
  }

  const machineIdStrings = machines.map((m) => String(m._id));
  const lastMaintenances = await MaintenanceLog.aggregate([
    {
      $match: {
        machineId: { $in: machineIdStrings },
      },
    },
    { $sort: { date: -1 } },
    {
      $group: {
        _id: "$machineId",
        lastMaintenanceDate: { $first: "$date" },
      },
    },
  ]);

  const maintenanceMap = {};
  for (const m of lastMaintenances) {
    maintenanceMap[String(m._id)] = m.lastMaintenanceDate;
  }

  const machinesForTable = machines.map((m) => {
    const lastDate = maintenanceMap[String(m._id)] || null;

    return {
      id: m._id,
      machineId: m.machineId,
      type: m.machineType,
      status: m.status === "operational" ? "Operational" : "Needs Service",
      lastMaintenance: lastDate,
    };
  });

  return res.status(200).json({
    machines: machinesForTable,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export const getStoreTasks = asyncHandler(async (req, res) => {
  const ownerId = req.user._id;
  const { technicianId, date, status } = req.query;

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const store = await Store.findOne({ ownerId, isActive: true }).lean();
  if (!store) {
    return res.status(404).json({ message: "Store not found for this user." });
  }

  const filter = { createdBy: ownerId,deletedAt:null };

  if (technicianId && technicianId !== "All") {
    try {
      filter.technicianId = new mongoose.Types.ObjectId(technicianId);
    } catch (error) {
      return res.status(400).json({ message: "Invalid technicianId" });
    }
  }

  if (status && status !== "All") {
    filter.status = status;
  }

  if (date && date !== "All") {
    const now = new Date();
    let start, end;
    if (date === "today") {
      start = new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setHours(23, 59, 59, 999);
    } else if (date === "week") {
      const day = now.getDay();
      start = new Date(now);
      start.setDate(now.getDate() - day);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (date === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else {
      // allow passing an ISO date string
      const d = new Date(date);
      if (!isNaN(d)) {
        start = new Date(d);
        start.setHours(0, 0, 0, 0);
        end = new Date(d);
        end.setHours(23, 59, 59, 999);
      }
    }

    if (start && end) {
      filter.assign_date = { $gte: start, $lte: end };
    }
  }

  const [total, tasks] = await Promise.all([
    Task.countDocuments(filter),
    Task.find(filter)
      .populate({ path: "machineId", select: "machineId" })
      .populate({ path: "technicianId", select: "fullName _id" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const totalPages = Math.max(Math.ceil(total / limit), 1);

  // Format data for table display
  const rows = tasks.map((task) => ({
    id: task._id,
    machine: task.machineId?.machineId || "—",
    technician: task.technicianId?.fullName || "—",
    technicianId: task.technicianId?._id || null,
    date: task.assign_date
      ? new Date(task.assign_date).toLocaleDateString("en-US", {
          month: "short",
          day: "2-digit",
          year: "numeric",
        })
      : "—",
    status: task.status || "—",
    partsCost: task.parts_cost ?? 0,
    labourCost: task.labour_cost ?? 0,
    task:task.task || "—",
    note: task.description || task.task || "—",
    images: task.images || [],
  }));

  return res
    .status(200)
    .json({ rows, pagination: { total, page, limit, totalPages } });
});

const extractPublicId = (url) => {
  const parts = url.split("/");
  const uploadIndex = parts.indexOf("upload");
  if (uploadIndex === -1) return null;

  const publicIdWithExt = parts
    .slice(uploadIndex + 2) 
    .join("/");

  return publicIdWithExt.replace(/\.[^/.]+$/, ""); 
};

export const deleteImage = asyncHandler(async (req, res) => {
  try {
    const { id, imageType, path: imageUrl } = req.body;

    if (!id || !imageType || !imageUrl) {
      return res.status(400).json({
        message: "id, imageType and path are required in the body.",
      });
    }

    const type = imageType.toLowerCase();
    let Model;

    if (type === "machine") Model = Machine;
    else if (type === "task") Model = Task;
    else if (type === "maintenance") Model = MaintenanceLog;
    else if (type === "taskrequest") Model = TaskRequest;
    else {
      return res.status(400).json({
        message: "Invalid imageType. Use 'machine', 'task' or 'maintenance'.",
      });
    }
    const doc = await Model.findById(id);
    if (!doc) {
      return res.status(404).json({
        message: `${imageType} record not found.`,
      });
    }

    const images = Array.isArray(doc.images) ? doc.images : [];
    const index = images.findIndex((img) => img === imageUrl);

    if (index === -1) {
      return res.status(404).json({
        message: "Image not found on record.",
      });
    }
     
    images.splice(index, 1);
    doc.images = images;
    await doc.save();

    if(doc.requestId && type==='task'){
      const taskRequest = await TaskRequest.findOne({_id:doc.requestId})
        taskRequest.images=images;
        await taskRequest.save();
    }

    const publicId = extractPublicId(imageUrl);
    if (publicId) {
      await deleteCloudinaryImages([publicId]);
    }

    logEvent({
      user: req.user,
      action: "IMAGE_DELETED",
      entity: imageType,
      entityId: id,
      metadata: {
        imageType,
        name:imageType==="machine"?`${doc.machineId}`:imageType==="task"?`${doc.task}`:imageType==="maintenance"?"Maintenance Log Image":`${doc.task}`,
      },
    });

    return res.status(200).json({
      message: "Image deleted successfully",
      images: doc.images,
    });
  } catch (error) {
    console.error("Cloudinary delete error:", error);
    return res.status(500).json({
      message: "Failed to delete image",
      error: error.message,
    });
  }
});

export const getStoreTechhnician = asyncHandler(async (req, res) => {
  const ownerId = req.user._id;
  const store = await Store.findOne({ ownerId, isActive: true }).lean();
  if (!store) {
    return res.status(404).json({ message: "Store not found for this user." });
  }
  const technicians = await User.find({ _id: { $in: store.technicians } }).select("_id fullName email").lean();
  technicians.unshift({ _id: req.user._id, fullName: "Assign to self", email: req.user.email });
  return res.status(200).json({ technicians });
  });

export const getInvitations = asyncHandler(async (req, res) => {
  const ownerId = req.user._id;

  const store = await Store.findOne({
    ownerId,
    isActive: true,
  }).lean();

  if (!store) {
    return res.status(404).json({
      message: "Store not found for this user.",
    });
  }

  const invitations = await Invitation.find({
    storeId: store._id,
  }).lean();

  const now = new Date();

  const formattedInvitations = invitations.map((invitation) => {
    if (
      invitation.status === "pending" &&
      invitation.expiresAt &&
      new Date(invitation.expiresAt) < now
    ) {
      return {
        ...invitation,
        status: "expired",
      };
    }
    return invitation;
  });

  return res.status(200).json({
    invitations: formattedInvitations,
  });
});

  export const removeTechnicianFromStore = asyncHandler(async (req, res, next) => {
  const { technicianId } = req.query;
  const ownerId = req.user._id;
  if (!technicianId) {
    return next({ message: "technicianId is required", statusCode: 400 });
  }
  const store = await Store.findOne({ ownerId, deletedAt: null });
  if (!store) {
    return next({ message: "Store not found for the owner", statusCode: 404 });
  }
  const technicianObjectId = new mongoose.Types.ObjectId(technicianId);
  
  const isTechnicianInStore = store.technicians.some(
    (techId) => techId.equals(technicianObjectId)
  );
  if (!isTechnicianInStore) {
    return next({ message: "Technician not found in your store", statusCode: 404 });
  }
  store.technicians = store.technicians.filter(
    (techId) => !techId.equals(technicianObjectId)
  );
  
  const technician = await User.findById(technicianId).select("email");
  if(!technician){
    return next({ message: "Technician user not found", statusCode: 404 });
  }
  if (technician?.email) {
    await Invitation.findOneAndUpdate({
      storeId: store._id,
      email: technician.email,
    }, { status: "cancelled" });
  }

  await store.save();

  logEvent({
    user: req.user,
    action: "REMOVE_TECHNICIAN_FROM_STORE",
    entity: "Store",
    entityId: store._id,
    metadata: {
      technician: technician?.email || technicianId,
      storeName: store.name,
    },
  });

  return res.status(200).json({ message: "Technician removed from store" });
});