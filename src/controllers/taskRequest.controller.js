
import mongoose from "mongoose";
import { deleteCloudinaryImages } from "../middlewares/upload.middleware.js";
import Machine from "../models/machine.modal.js";
import Store from "../models/store.modal.js";
import Task from "../models/task.modal.js";
import TaskRequest from "../models/taskRequest.modal.js";
import asyncHandler from "../utility/asyncHandler.js";
import { sentTaskReminderEmail } from "../utility/mail/taskReminderEmail.js";
import User from "../models/users.model.js";
import { logEvent } from "../services/auditLogger.js";

export const createTaskRequest = asyncHandler(async (req, res) => {
  const {
    task,
    machineId,
    description,
    priority,
  } = req.body;

  const requesterId = req.user._id;

  const machine = await Machine
    .findById(machineId)
    .select("storeId machineId machineType")
    .lean();

  if (!machine) {
    // cleanup uploaded images if machine not found
    const uploadedFiles = req.files || [];
    const cloudinaryIds = uploadedFiles
      .map(f => f.cloudinaryId)
      .filter(Boolean);

    if (cloudinaryIds.length) {
      await deleteCloudinaryImages(cloudinaryIds);
    }

    return res.status(404).json({ message: "Machine not found." });
  }

  if (req.files && req.files.length > 3) {
    const cloudinaryIds = req.files
      .map(f => f.cloudinaryId)
      .filter(Boolean);

    await deleteCloudinaryImages(cloudinaryIds);

    return res.status(400).json({
      message: "Maximum 3 images allowed.",
    });
  }

  const images = (req.files || [])
    .map(file => file.url)
    .filter(Boolean);

  const taskRequest = await TaskRequest.create({
    requesterId,
    task,
    machineId,
    storeId: machine.storeId,
    description,
    priority,
    images, // 👈 saved here
  });
  const Owner = await Store.findById(machine.storeId).select("ownerId").lean();
  const technician = await User.findById(Owner.ownerId).select("email taskReminders");
  if (technician?.email && technician.taskReminders) {
  sentTaskReminderEmail(
        technician.email,
        "New Task Request Created",
        `You have a new task request for task "${task}".`,
        `${process.env.FRONTEND_URL}/maintenance/request`
     )
    }
  logEvent({
        user: req.user,
        action: "TASK_REQUEST_CREATED",
        entity: "TaskRequest",
        entityId: taskRequest._id,
        metadata: {
          machineId: machine._id,
          machineName: `${machine.machineId} ${machine.machineType}`,
          task: task,
        },
    });

  return res.status(201).json({
    success: true,
    data: taskRequest,
  });
});

export const getTaskRequests = asyncHandler(async (req, res) => {
  const { status, priority, page = 1, limit = 10 } = req.query;
  const { _id: userId, role } = req.user;

  const pageNum = Math.max(parseInt(page), 1);
  const limitNum = Math.max(parseInt(limit), 1);
  const skip = (pageNum - 1) * limitNum;

  const filter = { deletedAt: null };

  if (status) filter.status = status;
  if (priority) filter.priority = priority;

  if (role === "technician") {
    filter.requesterId = userId;
  }

  if (role === "owner") {
    const store = await Store.findOne({ ownerId: userId })
      .select("_id")
      .lean();

    if (!store) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          page: pageNum,
          limit: limitNum,
          totalPages: 0,
        },
      });
    }

    filter.storeId = store._id;
  }

  const [result] = await TaskRequest.aggregate([
    { $match: filter },

    {
      $facet: {
        data: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limitNum },

          {
            $lookup: {
              from: "users",
              localField: "requesterId",
              foreignField: "_id",
              as: "requester",
            },
          },
          { $unwind: "$requester" },

          {
            $lookup: {
              from: "machines",
              localField: "machineId",
              foreignField: "_id",
              as: "machine",
            },
          },
          { $unwind: "$machine" },

          {
            $project: {
              _id: 1,
              task: 1,
              description: 1,
              priority: 1,
              status: 1,
              images: 1,
              createdAt: 1,
              updatedAt: 1,
              requestedBy: "$requester.fullName",
              machine: "$machine.machineId",
            },
          },
        ],
        totalCount: [{ $count: "count" }],
      },
    },
  ]);

  const total = result.totalCount[0]?.count || 0;

  return res.status(200).json({
    success: true,
    data: result.data,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});


export const updateTaskRequestStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
    const validStatuses = ["approved", "rejected"];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status value." });
    }
      const taskRequest = await TaskRequest.findByIdAndUpdate(id,{ status }, { new: true } );

        if (!taskRequest) {
            return res.status(404).json({ message: "Task Request not found." });
        }
    const ownerId = await Store.findById(taskRequest.storeId).select("ownerId").lean();
    
    if (status === "approved") {
        await Task.create({
            technicianId: taskRequest.requesterId,
            machineId: taskRequest.machineId,
            storeId: taskRequest.storeId,
            task: taskRequest.task,
            description: taskRequest.description,
            priority: taskRequest.priority,
            images: taskRequest.images,
            assign_date: new Date(),
            labour_cost: 0,
            parts_cost: 0,
            requestId: taskRequest._id,
            createdBy: ownerId.ownerId,
            status: "open"
        });
      await Machine.findByIdAndUpdate(taskRequest.machineId, { status: "needs_service" });  
    }
    const technician = await User.findById(taskRequest.requesterId).select("email taskReminders");
     console.log("Technician details for task request status update:", technician.email);
    if (technician?.email && technician.taskReminders) {
      console.log(`Sending task reminder email to technician: ${technician.email} for task request status update to ${status}`);
     sentTaskReminderEmail(
        technician.email,
        status === "approved" ? "Task Request Approved" : "Task Request Rejected",
        `your task request has been ${status === "approved" ? "approved" : "rejected"} for task "${taskRequest.task}" by the store owner.`,
        `${process.env.FRONTEND_URL}/maintenance/request`
     )}

  logEvent({
          user: req.user,
          action: status === "approved" ? "REQUEST_APPROVED" : "REQUEST_REJECTED",
          entity: "TaskRequest",
          entityId: taskRequest._id,
          metadata: {
            task: taskRequest.task,
          },
        });


    res.status(200).json({
        success: true,
        data: taskRequest
    });
});

export const getTaskRequestById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Task Request ID." });
  }

  const taskRequest = await TaskRequest.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(id),
        deletedAt: null,
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "requesterId",
        foreignField: "_id",
        as: "requester",
      },
    },
    { $unwind: "$requester" },
    {
      $lookup: {
        from: "machines",
        localField: "machineId",
        foreignField: "_id",
        as: "machine",
      },
    },
    { $unwind: "$machine" },
    {
      $lookup: {
        from: "stores",
        localField: "storeId",
        foreignField: "_id",
        as: "store",
      },
    },
    { $unwind: "$store" },
    {
      $project: {
        _id: 1,
        task: 1,
        description: 1,
        priority: 1,
        status: 1,
        images: 1,
        createdAt: 1,
        updatedAt: 1,
        requestedBy: "$requester.fullName",
        machine:{
          machineId: "$machine._id",
          name: "$machine.machineId",
          machineType: "$machine.machineType",
        },
        store: "$store.name",
      },
    },
  ]);

  if (!taskRequest.length) {
    return res.status(404).json({ message: "Task Request not found." });
  }

  return res.status(200).json({
    success: true,
    data: taskRequest[0],
  });
});

export const deleteTaskRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Task Request ID." });
  }

  const taskRequest = await TaskRequest.findOne({
    _id: id,
    deletedAt: null,
  });

  if (!taskRequest) {
    return res.status(404).json({ message: "Task Request not found." });
  }

  if (taskRequest.status !== "pending") {
    return res.status(400).json({
      message: "Only pending task requests can be deleted.",
    });
  }

  taskRequest.deletedAt = new Date();
  await taskRequest.save();

  return res.status(200).json({
    success: true,
    message: "Task Request deleted successfully.",
  });
});

export const updateTaskRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Task Request ID." });
  }

  const taskRequest = await TaskRequest.findById(id);

  if (!taskRequest || taskRequest.deletedAt) {
    const uploadedFiles = req.files || [];
    const cloudinaryIds = uploadedFiles
      .map(f => f.cloudinaryId)
      .filter(Boolean);

    if (cloudinaryIds.length) {
      await deleteCloudinaryImages(cloudinaryIds);
    }

    return res.status(404).json({ message: "Task Request not found." });
  }

  const changes = {};
  const allowedFields = ["task", "description", "priority", "status", "machineId"];

  allowedFields.forEach(field => {
    if (
      req.body[field] !== undefined &&
      req.body[field] !== taskRequest[field]
    ) {
      changes[field] = {
        old: taskRequest[field],
        new: req.body[field],
      };
      taskRequest[field] = req.body[field];
    }
  });

  let imagesAdded = 0;

  if (req.files && req.files.length) {
    const existingImages = taskRequest.images || [];
    const newImages = req.files
      .map(file => file.url)
      .filter(Boolean);

    const totalImages = existingImages.length + newImages.length;

    if (totalImages > 3) {
      const cloudinaryIds = req.files
        .map(f => f.cloudinaryId)
        .filter(Boolean);

      await deleteCloudinaryImages(cloudinaryIds);

      return res.status(400).json({
        message: "Maximum 3 images allowed in total.",
      });
    }

    taskRequest.images = [...existingImages, ...newImages];
    imagesAdded = newImages.length;
  }

  await taskRequest.save();

  logEvent({
    user: req.user,
    action: "TASK_REQUEST_UPDATED",
    entity: "TaskRequest",
    entityId: taskRequest._id,
    metadata: {
      id: taskRequest.task,
      changes: Object.keys(changes).length ? changes : undefined,
      imagesAdded: imagesAdded || undefined,
    },
  });

  return res.status(200).json({
    success: true,
    data: taskRequest,
  });
});


