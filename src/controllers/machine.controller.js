import Machine from "../models/machine.modal.js";
import Store from "../models/store.modal.js";
import { v2 as cloudinary } from "cloudinary";
import asyncHandler from "../utility/asyncHandler.js";
import MaintenanceLog from "../models/maintenanceLog.modal.js";
import Task from "../models/task.modal.js";
import { logEvent } from "../services/auditLogger.js";

// Helper to delete images from Cloudinary
const deleteCloudinaryImages = async (cloudinaryIds) => {
  if (!cloudinaryIds || !cloudinaryIds.length) return;
  const deletePromises = cloudinaryIds.map((id) =>
    cloudinary.uploader.destroy(id).catch(() => {})
  );
  await Promise.all(deletePromises);
};

export const createMachine = async (req, res) => {
  try {
    const {
      machineId,
      machineType,
      manufacturer,
      model,
      serialNumber,
      installationDate,
      capacity,
      status = "operational",
      location,
    } = req.body;

    const store = await Store.findOne({ ownerId: req.user._id });
    if (!store) {
      return res
        .status(404)
        .json({ message: "Store not found for this user." });
    }

    if (
      !machineId ||
      !machineType ||
      !manufacturer ||
      !model ||
      !serialNumber ||
      !capacity
    ) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const exists = await Machine.findOne({
      machineId,
      storeId: store._id,
    });
    if (exists) {
      // Delete uploaded images from Cloudinary since we're rejecting
      const uploadedFiles = req.files || [];
      const cloudinaryIds = uploadedFiles.map((f) => f.cloudinaryId).filter(Boolean);
      await deleteCloudinaryImages(cloudinaryIds);
      return res.status(409).json({
        message: "Duplicate machineId for this store.",
      });
    }

    // Get image URLs from uploaded files
    const images = (req.files || []).map((file) => file.url).filter(Boolean);

    const machine = new Machine({
      storeId: store._id,
      machineId,
      machineType,
      manufacturer,
      model,
      serialNumber,
      installationDate,
      capacity,
      status,
      location,
      images,
    });

    await machine.save();

    // Log audit event for machine creation
    logEvent({
      user: req.user,
      action: "MACHINE_CREATED",
      entity: "Machine",
      entityId: machine._id,
      metadata: {
        machineId: machine.machineId,
        machineName: `${machine.manufacturer} ${machine.model}`,
        machineType: machine.machineType,
        storeId: store._id,
      },
    });

    return res.status(201).json({
      message: "Machine created successfully.",
      machine,
    });
  } catch (error) {

    if (error.code === 11000) {
      return res.status(409).json({
        message: "Duplicate machineId for this store.",
      });
    }

    return res.status(500).json({
      message: "Failed to create machine.",
      error: error.message,
    });
  }
};

export const updateMechineData = async (req, res) => {
  try {
    const { machineId } = req.params;
    const updateData = req.body;
    const store = await Store.findOne({ ownerId: req.user._id });
    if (!store) {
      // Delete uploaded images from Cloudinary
      const uploadedFiles = req.files || [];
      const cloudinaryIds = uploadedFiles.map((f) => f.cloudinaryId).filter(Boolean);
      await deleteCloudinaryImages(cloudinaryIds);
      return res
        .status(404)
        .json({ message: "Store not found for this user." });
    }
    const storeId = store._id;

    // Handle image uploads
    const uploadedFiles = req.files || [];
    if (uploadedFiles.length) {
      const machine = await Machine.findOne({ storeId, _id: machineId });
      if (!machine) {
        const cloudinaryIds = uploadedFiles.map((f) => f.cloudinaryId).filter(Boolean);
        await deleteCloudinaryImages(cloudinaryIds);
        return res.status(404).json({ message: "Machine not found." });
      }

      // Append new image URLs to existing images
      machine.images = machine.images || [];
      for (const file of uploadedFiles) {
        if (file.url) {
          machine.images.push(file.url);
        }
      }

      Object.assign(machine, updateData);
      await machine.save();

      // Log audit event for machine update
      logEvent({
        user: req.user,
        action: "MACHINE_UPDATED",
        entity: "Machine",
        entityId: machine._id,
        metadata: {
          machineId: machine.machineId,
          updatedFields: Object.keys(updateData),
          imagesAdded: uploadedFiles.length,
        },
      });

      return res
        .status(200)
        .json({ message: "Machine updated successfully.", machine });
    }

    const machine = await Machine.findOneAndUpdate(
      { storeId, _id: machineId },
      updateData,
      { new: true },
    );
    if (!machine) {
      return res.status(404).json({ message: "Machine not found." });
    }

    logEvent({
      user: req.user,
      action: "MACHINE_UPDATED",
      entity: "Machine",
      entityId: machine._id,
      metadata: {
        machineId: machine.machineId,
        updatedFields: Object.keys(updateData),
      },
    });

    return res
      .status(200)
      .json({ message: "Machine updated successfully.", machine });
  } catch (error) {

    const uploadedFiles = req.files || [];
    const cloudinaryIds = uploadedFiles.map((f) => f.cloudinaryId).filter(Boolean);
    await deleteCloudinaryImages(cloudinaryIds);
    return res
      .status(500)
      .json({ message: "Failed to update machine.", error: error.message });
  }
};

export const deleteMachine = async (req, res) => {
  try {
    const { machineId } = req.params;
    console.log("Deleting machine with ID:", machineId);
    const store = await Store.findOne({ ownerId: req.user._id });
    if (!store) {
      return res
        .status(404)
        .json({ message: "Store not found for this user." });
    }
    const storeId = store._id;
    const machine = await Machine.findOneAndUpdate(
      { storeId, _id: machineId },
      { isActive: false, deletedAt: new Date() },
      { new: true },
    );
    if (!machine) {
      return res.status(404).json({ message: "Machine not found." });
    }

    // Log audit event for machine deletion
    logEvent({
      user: req.user,
      action: "MACHINE_DELETED",
      entity: "Machine",
      entityId: machine._id,
      metadata: {
        machineId: machine.machineId,
        machineType: machine.machineType,
        storeId: store._id,
      },
    });

    return res
      .status(200)
      .json({ message: "Machine deleted successfully.", machine });

  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to delete machine.", error: error.message });
  }
};

export const getMachineDetails = asyncHandler(async (req, res) => {
  const { machineId } = req.query;

  const machine = await Machine.findById(machineId)
    .select(
      "machineId machineType manufacturer model serialNumber capacity installationDate status location images",
    )
    .lean();

  if (!machine) {
    return res.status(404).json({ message: "Machine not found." });
  }

  const logs = await Task.find({ machineId: machineId })
    .sort({ assign_date: -1 })
    .select("assign_date description task status technicianId")
    .populate({
      path: "technicianId",
      select: "fullName",
    })
    .limit(4)
    .lean();

  const logsFormatted = logs.map((log) => ({
    _id: log._id,
    date: log.assign_date
      ? new Date(log.assign_date).toLocaleDateString("en-US", {
          month: "short",
          day: "2-digit",
          year: "numeric",
        })
      : "—",
    note: log.task,
    status: log.status,
    technician: log.technicianId?.fullName || "Unassigned",
  }));

  return res.status(200).json({
    machine: {
      id: machine._id,
      machineCode: machine.machineId,
      status:
        machine.status === "operational" ? "Operational" : "Needs Service",
      info: {
        type: machine.machineType,
        manufacturer: machine.manufacturer,
        model: machine.model,
        serialNumber: machine.serialNumber,
        capacity: `${machine.capacity} lbs`,
        installationDate: new Date(machine.installationDate).toLocaleDateString(
          "en-US",
          { month: "short", day: "2-digit", year: "numeric" },
        ),
        location: machine.location,
        images: machine.images || [],
      },
    },
    maintenanceHistory: logsFormatted,
  });
});

export const getMachines = asyncHandler(async (req, res, next) => {
  try {
    const { _id: userId } = req.user;
    const role = req.user.role;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      100,
    );
    const skip = (page - 1) * limit;

    let filter = { isActive: true };

    if (req.query.search && req.query.search.trim()) {
      const q = req.query.search.trim();
      filter.$or = [
        { machineId: { $regex: q, $options: "i" } },
        { machineType: { $regex: q, $options: "i" } },
        { location: { $regex: q, $options: "i" } },
        { manufacturer: { $regex: q, $options: "i" } },
        { model: { $regex: q, $options: "i" } },
      ];
    }

    if (role === "owner") {
      const store = await Store.findOne({ ownerId: userId }).select("_id");
      if (!store) {
        return res.status(404).json({ message: "Store not found" });
      }
      filter.storeId = store._id;
    }

    if (role === "technician") {
      const store = await Store.findOne({ technicians: userId }).select("_id");
      if (!store) {
        return res.status(404).json({ message: "Store not found for technician" });
      }
    filter.storeId = store._id;
    }

    const [total, machines] = await Promise.all([
      Machine.countDocuments(filter),
      Machine.find(filter)
        .select("machineId machineType capacity location status")
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const machineIds = machines.map((m) => m._id);

    const lastMaintenances = await MaintenanceLog.aggregate([
      { $match: { machineId: { $in: machineIds } } },
      { $sort: { date: -1 } },
      {
        $group: {
          _id: "$machineId",
          lastMaintenance: { $first: "$date" },
        },
      },
    ]);

    const lastMap = Object.fromEntries(
      lastMaintenances.map((l) => [String(l._id), l.lastMaintenance]),
    );

    const rows = machines.map((machine) => ({
      id: machine._id,
      machineId: machine.machineId,
      type: machine.machineType,
      capacity: machine.capacity || "—",
      location: machine.location || "—",
      status: machine.status,
      lastMaintenance: lastMap[String(machine._id)]
        ? new Date(lastMap[String(machine._id)])
            .toLocaleDateString("en-US", {
              month: "short",
              day: "2-digit",
              year: "numeric",
            })
            .replace(", ", ",")
        : "—",
    }));

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
    next(error);
  }
});

export const getMachineById = asyncHandler(async (req, res) => {
  const { machineId } = req.query;
  const machine = await Machine.findOne({ _id: machineId }).lean();
  if (!machine) {
    return res.status(404).json({ message: "Machine not found." });
  }
  return res.status(200).json({ machine });
});

export const getMachinesWithTypes = asyncHandler(async (req, res) => {
  try{
    const {_id: ownerId,role} = req.user;
    let store;
    if(role === "technician"){
   store = await Store.findOne({ technicians: ownerId }).select("_id");
      if (!store) {
        return res.status(404).json({ message: "Store not found for technician" });
      }
    }
      else if(role === "owner"){
  store = await Store.findOne({ ownerId }).select("_id");
    if (!store) {
      return res.status(404).json({ message: "Store not found" });
    }
      }

  const machines = await Machine.find({ isActive: true, storeId: store._id })
    .select("machineId machineType")
    .lean();
    
  return res.status(200).json({ machines });

  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch machines.", error: error.message });
  }
});
