
import Machine from "../models/machine.modal.js";
import Task from "../models/task.modal.js";
import MaintenanceLog from "../models/maintenanceLog.modal.js";
import Store from "../models/store.modal.js";
import asyncHandler from "../utility/asyncHandler.js";
import { deleteCloudinaryImages } from "../middlewares/upload.middleware.js";
import { logEvent } from "../services/auditLogger.js";
import { sentTaskReminderEmail } from "../utility/mail/taskReminderEmail.js";
import User from "../models/users.model.js";

// Helper to delete images from Cloudinary

export const createTask = async (req, res) => {
  try {
    const {
      machineId,
      task,
      description,
      technicianId,
    } = req.body;
      
    if (
      !machineId ||
      !description ||
      !technicianId ||
      !task
    ) {
      return res.status(400).json({ message: "Missing required fields." });
    }
    const store = await Store.findOne({ ownerId: req.user._id });
    if (!store) {
      return res
        .status(404)
        .json({ message: "Store not found for this user." });
    }

    const createdBy = req.user._id;
    const images = (req.files || []).map((file) => file.url);
    const maintenance = new Task({
      storeId: store._id,
      task,
      machineId,
      description,
      status: "open",
      assign_date: new Date(),
      labour_cost:0,
      parts_cost:0,
      technicianId,
      createdBy,
      images,
    });
    await maintenance.save();
  let machine 
    if (maintenance.status == "needs_service" || maintenance.status == "open") {
     machine= await Machine.findByIdAndUpdate(
        { _id: machineId },
        { status: "needs_service" }
      );
    } else if (maintenance.status == "completed") {
      machine= await Machine.findByIdAndUpdate({ _id: machineId }, { status: "operational" });
    }
    
    logEvent({
      user: req.user,
      action: "TASK_ADDED",
      entity: "Task",
      entityId: maintenance._id,
      metadata: {
        taskId: maintenance._id,
        taskName: task,
        machineName: machine.machineId || null,
        machineId: machine._id,
      },
    });

    const technician = await User.findById(technicianId).select("email taskReminders");

    if (technician?.email && technician.taskReminders) {
      const taskLink = `${process.env.FRONTEND_URL}/maintenance/task/details/${maintenance._id}`;

  sentTaskReminderEmail(
        technician.email,
        "New Maintenance Task Assigned",
        `A new maintenance task -"${maintenance.task}" has been assigned to you.`,
        taskLink
      );
    }
    return res.status(200).json({
      message: "Maintenance record created successfully.",
      maintenance,
    });

  } catch (error) {
    return res.status(500).json({
      message: "Failed to create maintenance record.",
      error: error.message,
    });
  }
};

export const updateMaintenance = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id)
      return res.status(400).json({ message: "Maintenance id is required." });

    const updateData = req.body || {};
    const uploadedFiles =
      Array.isArray(req.files) && req.files.length
        ? req.files
        : req.file?.url
        ? [req.file]
        : [];

    if (uploadedFiles.length) {
      const maintenance = await Task.findById(id);
      if (!maintenance) {
        // Delete uploaded images from Cloudinary
        const cloudinaryIds = uploadedFiles.map((f) => f.cloudinaryId).filter(Boolean);
        await deleteCloudinaryImages(cloudinaryIds);
        return res
          .status(404)
          .json({ message: "Maintenance record not found." });
      }

      // Store original values for audit log
      const originalData = maintenance.toObject();

      maintenance.images = maintenance.images || [];
      const existingCount = maintenance.images.length;
      const incomingCount = uploadedFiles.length;
      const maxAllowed = 3;
      if (existingCount + incomingCount > maxAllowed) {
        // Delete uploaded images from Cloudinary
        const cloudinaryIds = uploadedFiles.map((f) => f.cloudinaryId).filter(Boolean);
        await deleteCloudinaryImages(cloudinaryIds);
        return res.status(400).json({
          message: `Image limit exceeded. Task already has ${existingCount} image(s). You can upload up to ${maxAllowed - existingCount} more.`,
        });
      }

      for (const file of uploadedFiles) {
        if (file.url) {
          maintenance.images.push(file.url);
        }
      }

      Object.assign(maintenance, updateData);
      await maintenance.save();

      // Build changes object with old and new values
      const changes = {};
      for (const key of Object.keys(updateData)) {
        const oldVal = originalData[key];
        const newVal = updateData[key];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changes[key] = { old: oldVal, new: newVal };
        }
      }
      const machine = await Machine.findById(maintenance.machineId);
      // Log audit event for maintenance update
      logEvent({
        user: req.user,
        action: "MAINTENANCE_UPDATED",
        entity: "Task",
        entityId: maintenance._id,
        metadata: {
          name: maintenance.task,
          changes,
          imagesAdded: uploadedFiles.length,
          machineName: machine.machineId || null,
          machineId: machine._id,
        },
      });

      return res
        .status(200)
        .json({
          message: "Maintenance record updated successfully.",
          maintenance,
        });
    }

    // Get original document before update
    const originalMaintenance = await Task.findById(id).lean();
    if (!originalMaintenance) {
      return res.status(404).json({ message: "Maintenance record not found." });
    }

    const maintenance = await Task.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    if (updateData.status == "needs_service" || updateData.status == "open") {
      await Machine.findByIdAndUpdate(
        maintenance.machineId,
        { status: "needs_service" }
      );
    } else if (updateData.status == "completed") {
      await Machine.findByIdAndUpdate(
        maintenance.machineId,
        { status: "operational" }
      );
    }

    // Build changes object with old and new values
    const changes = {};
    for (const key of Object.keys(updateData)) {
      const oldVal = originalMaintenance[key];
      const newVal = updateData[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes[key] = { old: oldVal, new: newVal };
      }
    }

    // Log audit event for maintenance update
    logEvent({
      user: req.user,
      action: "TASK_UPDATED",
      entity: "Task",
      entityId: maintenance._id,
      metadata: {
        name: maintenance.task,
        id: maintenance._id,
        changes,
      },
    });
   
    return res
      .status(200)
      .json({
        message: "Maintenance record updated successfully.",
        maintenance,
      });
  } catch (error) {
    // Delete uploaded images from Cloudinary on error
    const uploadedFiles =
      Array.isArray(req.files) && req.files.length
        ? req.files
        : req.file
        ? [req.file]
        : [];
    const cloudinaryIds = uploadedFiles.map((f) => f.cloudinaryId).filter(Boolean);
    await deleteCloudinaryImages(cloudinaryIds);
    return res
      .status(500)
      .json({
        message: "Failed to update maintenance record.",
        error: error.message,
      });
  }
};

export const getTaskById = async (req, res) => {
  try {
    const maintenanceId = req.query.maintenanceId ;
    if (!maintenanceId) {
      return res.status(400).json({ message: "maintenanceId is required." });
    }
    const maintenance = await Task.findById(maintenanceId)
      .populate({ path: "technicianId", select: "fullName email" })
      .populate({ path: "machineId", select: "machineId machineType location" })
      .populate({ path: "completedBy", select: "fullName" })
      .lean();

    if (!maintenance) {
      return res.status(404).json({ message: "Maintenance task not found." });
    }
    return res.status(200).json({ maintenance });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to retrieve maintenance task.", error: error.message });
  }
}

export const getTaskDetails = async (req, res) => {
  try {
    const taskId = req.query.taskId;
    if (!taskId) {
      return res.status(400).json({ message: "taskId is required." });
    }

    const maintenance = await Task.findById(taskId)
      .populate({ path: "technicianId", select: "fullName email" })
      .populate({ path: "machineId", select: "machineId location machineType" })
      .lean();
    if (!maintenance) {
      return res.status(404).json({ message: "Maintenance task not found." });
    }



    return res.status(200).json({
      maintenance,
      },
    );
  } catch (error) {
    return res.status(500).json({ message: "Failed to retrieve task details.", error: error.message });
  }
};

export const getMaintenanceLogById = async (req, res) => {
  try {
    const { taskId } = req.query;
    if (!taskId) {
      return res.status(400).json({ message: "taskId is required." });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip = (page - 1) * limit;

    const filter = { taskId };

    const [total, logs] = await Promise.all([
      MaintenanceLog.countDocuments(filter),
      MaintenanceLog.find(filter)
        .populate({
          path: "taskId",
          select: "assign_date technicianId",
          populate: {
            path: "technicianId",
            select: "fullName",
          },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const rows = logs.map(log => {
      const labour = log.labour_cost ?? 0;
      const parts = log.parts_cost ?? 0;

      return {
        id: log._id,
        shortDescription:
          log.shortDescription ||
          log.logEntry?.slice(0, 30) + (log.logEntry?.length > 30 ? "..." : "") ||
          "—",
        technician: log.taskId?.technicianId?.fullName || "—",
        images: log.images || [],
        partsCost: parts,
        labourCost: labour,
        totalCost: labour + parts,
        assigned: log.taskId?.assign_date
          ? new Date(log.taskId.assign_date).toLocaleDateString("en-US", {
              month: "short",
              day: "2-digit",
              year: "numeric",
            })
          : "—",
      };
    });

    res.status(200).json({
      rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to retrieve maintenance logs.",
      error: error.message,
    });
  }
};

const normalize = (val) => {
  if (val === null || val === undefined) return null;

  // already a number
  if (typeof val === "number") return val;

  // numeric string → number
  if (typeof val === "string" && val.trim() !== "" && !isNaN(val)) {
    return Number(val);
  }

  // Date object → YYYY-MM-DD
  if (val instanceof Date) {
    return val.toISOString().split("T")[0];
  }

  // ISO / YYYY-MM-DD date strings ONLY
  if (
    typeof val === "string" &&
    /^\d{4}-\d{2}-\d{2}/.test(val)
  ) {
    return new Date(val).toISOString().split("T")[0];
  }

  return val;
};

export const updateLog = async (req, res) => {
  try {
    const { logId } = req.params;
    if (!logId) {
      return res.status(400).json({ message: "Log id is required." });
    }

    const updateData = req.body || {};

    const uploadedFiles =
      Array.isArray(req.files) && req.files.length
        ? req.files
        : req.file?.url
        ? [req.file]
        : [];

    const existingLog = await MaintenanceLog.findById(logId).lean();
    if (!existingLog) {
      const cloudinaryIds = uploadedFiles
        .map(f => f.cloudinaryId)
        .filter(Boolean);
      await deleteCloudinaryImages(cloudinaryIds);

      return res.status(404).json({ message: "Maintenance log not found." });
    }

    const changes = {};


for (const [key, incomingValue] of Object.entries(updateData)) {

  const oldVal = normalize(existingLog[key]);
  const newVal = normalize(incomingValue);
  console.log("new",newVal,oldVal);
  if(oldVal===newVal){

    continue;
  }
  
  if (oldVal !== newVal) {
    changes[key] = {
      old: existingLog[key],
      new: incomingValue,
    };
  }
}

    const updateQuery = { ...updateData };
    let imagesAdded = 0;

    if (uploadedFiles.length) {
      updateQuery.$push = {
        images: { $each: uploadedFiles.map(f => f.url) },
      };
      imagesAdded = uploadedFiles.length;
    }

    const updatedLog = await MaintenanceLog.findByIdAndUpdate(
      logId,
      updateQuery,
      { new: true }
    );

    if (Object.keys(changes).length || imagesAdded) {
      const machine = await Machine.findById(existingLog.machineId).select("machineId");

      logEvent({
        user: req.user,
        action: "UPDATE_LOG",
        entity: "MaintenanceLog",
        entityId: logId,
        metadata: {
          logEntry: existingLog.logEntry || existingLog._id,
          changes,
          imagesAdded: imagesAdded || undefined,
          machineId: existingLog.machineId,
          machineName: machine?.machineId || null,
        },
      });
    }

    return res.status(200).json({
      message: "Maintenance log updated successfully.",
      log: updatedLog,
    });

  } catch (error) {
    const uploadedFiles =
      Array.isArray(req.files) && req.files.length
        ? req.files
        : req.file
        ? [req.file]
        : [];

    const cloudinaryIds = uploadedFiles
      .map(f => f.cloudinaryId)
      .filter(Boolean);
    await deleteCloudinaryImages(cloudinaryIds);

    return res.status(500).json({
      message: "Failed to update maintenance log.",
      error: error.message,
    });
  }
};

export const  updateTaskStatus = asyncHandler(async (req, res) => {
  try {
    const { taskId, status } = req.body;
    if (!taskId || !status) {
      return res.status(400).json({ message: "taskId and status are required." });
    }
    const task = await Task.findByIdAndUpdate(taskId, { status, completed_at: status === "completed" ? new Date() : null, completedBy: req.user._id }, { new: true });
    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }
    const machineStatus = status === "completed" ? "operational" : "needs_service";
   const machine = await Machine.findByIdAndUpdate(task.machineId, { status: machineStatus });

    logEvent({
      user: req.user,
      action: status === "completed" ?"TASK_COMPLETED":"TASK_STATUS_UPDATED",
      entity: "Task",
      entityId: task._id,
      metadata: {
        taskId: task.task,
        status,
        machineName: machine.machineId || null,
        machineId: machine._id,
      },
    });

    return res.status(200).json({
      message: "Task status updated successfully.",
      task,
    });
  }
  catch (error) {
    return res.status(500).json({ message: "Failed to update task status.", error: error.message });
  }
});

export const getLogById= asyncHandler(async (req, res) => {
  try {
    const { logId } = req.query;
    if (!logId) {
      return res.status(400).json({ message: "logId is required." });
    }
    const log = await MaintenanceLog.findById(logId)
      .populate({
        "path": "userId",
        "select": "fullName"
      })
      .lean();

      // if(req.user._id.toString()!==log.userId._id.toString() && req.user._id.toString()!==log.createdBy.toString()){
      //   return  res.status(403).json({ message: "Access denied to this maintenance log." });
      // }

    if (!log) {
      return res.status(404).json({ message: "Maintenance log not found." });
    }
    return res.status(200).json({ log });
  } catch (error) {
    return res.status(500).json({ message: "Failed to retrieve maintenance log.", error: error.message });
  }
});

export const cancelTask = asyncHandler(async (req, res) => {
  const { taskId } = req.params;

  if (!taskId) {
    return res.status(400).json({ message: "Task ID is required" });
  }

  const task = await Task.findOneAndUpdate(
    { _id: taskId, deletedAt: null },
    { status: "cancelled",deletedAt:new Date() },
    { new: true }
  );

  if (!task) {
    return res.status(404).json({ message: "Task not found" });
  }

  const machineId = task.machineId;

  const machineTasks = await Task.find({
    machineId,
    deletedAt: null,
  }).select("status");

  const hasOpenTask = machineTasks.some(
    (t) => t.status === "open"
  );

 const machine =await Machine.findByIdAndUpdate(machineId, {
    status: hasOpenTask ? "needs_service" : "operational",
  });

     logEvent({
      user: req.user,
      action: "TASK_CANCELLED",
      entity: "Task",
      entityId: task._id,
      metadata: {
        taskName: task.task,
        machineName: machine.machineId || null,
        machineId: machine._id,
      },
    });

  return res.status(200).json({
    message: "Task cancelled successfully",
  });
});







