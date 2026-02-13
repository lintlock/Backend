import Invitation from "../models/invitation.modal.js";
import asyncHandler from "../utility/asyncHandler.js";
import crypto from "crypto";
import Store from "../models/store.modal.js";
import User from "../models/users.model.js";
import { sendInviteEmail } from "../utility/mail/sendInviteEmail.js";
import bcrypt from "bcrypt";
import Task from "../models/task.modal.js";
import MaintenanceLog from "../models/maintenanceLog.modal.js";
import mongoose from "mongoose";
import Machine from "../models/machine.modal.js";
import { logEvent } from "../services/auditLogger.js";
import { sentTaskReminderEmail } from "../utility/mail/taskReminderEmail.js";
import { canInviteTechician } from "../models/adminSettings.modal.js";

export const sendInvitation = asyncHandler(async (req, res, next) => {
  const { email, name } = req.body;
  const ownerId = req.user._id;
  
  
  if (!email) {
    return next({
      message: "Email is required",
      statusCode: 400,
    });
  }

  const store = await Store.findOne({ ownerId, deletedAt: null });


  if (!store) {
    return next({
      message: "Store not found for the owner",
      statusCode: 404,
    });
  }
  const canInvite = await canInviteTechician(ownerId);
  if (!canInvite) {
    return next({
      message: "Store already has maximum number of allowed technicians Invitation.",
      statusCode: 400,
    });
  }
    let invitation = await Invitation.findOne({
        email,
      });
  const existingUser = await User.findOne({ email });
  if(existingUser && invitation.status!=='cancelled') {
    return next({
      message: "The email belongs to a user who is a technician.",
      statusCode: 400,
    });
  }

  if (existingUser) {
    const alreadyInStore = await Store.exists({
      _id: store._id,
      technicians: existingUser._id,
    });



    if (alreadyInStore) {
      return next({
        message: "This technician is already part of your store.",
        statusCode: 400,
      });
    }
  }

  const now = new Date();



  if (invitation) {
    if (invitation.status === "pending" && invitation.expiresAt > now && invitation.invitedBy===ownerId) {
      return next({
        message: "An invitation has already been sent to this email.",
        statusCode: 400,
      });
    }
    else if(invitation.status === "pending" && invitation.expiresAt > now && invitation.invitedBy!==ownerId){
        return next({
        message: "Technician is already invited by other store.",
        statusCode: 400,
      });
    }

    if (invitation.status === "accepted" && invitation.invitedBy===ownerId) {
      return next({
        message: "This technician is already part of your store.",
        statusCode: 400,
      });
    }
    if (invitation.status === "accepted" && invitation.invitedBy!==ownerId) {
      return next({
        message: "This technician is already part of another store.",
        statusCode: 400,
      });
    }
    invitation.invitedBy=ownerId;
    invitation.storeId= store._id;
    invitation.token = crypto.randomBytes(32).toString("hex");
    invitation.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    invitation.status = "pending";
    await invitation.save();
  } else {
    const token = crypto.randomBytes(32).toString("hex");
    invitation = await Invitation.create({
      email,
      name,
      storeId: store._id,
      invitedBy: ownerId,
      token,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: "pending",
    });
  }

  const inviteUrl = `${process.env.FRONTEND_URL}/accept-invite?token=${invitation.token}`;

  await sendInviteEmail(email, inviteUrl, store.name);

  logEvent({
    user: req.user,
    action: "INVITE_SENT",
    entity: "Invitation",
    entityId: invitation._id,
    metadata: {
      email,
      storeName: store.name,
      storeId: store._id,
    },
  });

  return res.status(201).json({
    message: "Invitation sent successfully",
  });
});

export const getInvitation = asyncHandler(async (req, res, next) => {
  const { token } = req.query;
  const now = new Date();
  if (!token) return next({ message: "Token is required", statusCode: 400 });

  const invitation = await Invitation.findOne({ token }).populate({
    path: "storeId",
    select: "name location",
  });
  if (!invitation) return next({ message: "Invalid token", statusCode: 400 });
  if (invitation.status !== "pending")
    return next({ message: "Invitation not pending", statusCode: 400 });
  if (invitation.expiresAt && invitation.expiresAt < now)
    return next({ message: "Invitation expired", statusCode: 400 });

  const user = await User.exists({ email: invitation.email });
  const owner = await User.findById(invitation.invitedBy).select("fullName");
  if (user) {
    const alreadyInStore = await Store.exists({
      _id: invitation.storeId._id,
      technicians: user._id,
    });
    if (alreadyInStore) {
      return next({ message: "User already part of store", statusCode: 400 });
    }

    return res.status(200).json({
      invitation: {
        email: invitation.email,
        name: invitation.name,
        store: invitation.storeId,
        invitedBy: owner.fullName,
        userExists: true,
      },
    });
  }

  return res.status(200).json({
    invitation: {
      email: invitation.email,
      name: invitation.name,
      store: invitation.storeId,
      invitedBy: owner.fullName,
      userExists: false,
    },
  });
});

export const completeInvitation = asyncHandler(async (req, res, next) => {
  try {
    const { token, status ,terms } = req.body || {};

    if (!token) return next({ message: "Token is required", statusCode: 400 });

    const invitation = await Invitation.findOne({ token });
    if (!invitation) return next({ message: "Invalid token", statusCode: 400 });

    const now = new Date();
    if (invitation.expiresAt && invitation.expiresAt < now) {
      return next({ message: "Invitation expired", statusCode: 400 });
    }

    const existingUser = await User.findOne({ email: invitation.email });

    if (existingUser) {
      invitation.status = status ? "accepted" : "cancelled";
      invitation.acceptedAt = now;
      await invitation.save();

      if (status) {
        await Store.findByIdAndUpdate(invitation.storeId, {
          $addToSet: { technicians: existingUser._id },
        });

        const store = await Store.findById(invitation.storeId)
          .select("name")
          .lean();
        logEvent({
          user: existingUser,
          action: "INVITE_COMPLETED",
          entity: "Invitation",
          entityId: invitation._id,
          metadata: {
            email: existingUser.email,
            storeName: store?.name || "Unknown",
          },
        });

        return res.status(200).json({ message: "Invitation accepted and user added to store" });
      }

      return res.status(200).json({ message: "Invitation cancelled" });
    }

    if (!status) {
      invitation.status = "cancelled";
      invitation.acceptedAt = now;
      await invitation.save();
      return res.status(200).json({ message: "Invitation cancelled" });
    }

    const password = (req.body && req.body.password) || "";
    const name = (req.body && req.body.name) || invitation.name || "Technician";

    if (!password || password.length < 6) {
      return next({ message: "Password must be at least 6 characters", statusCode: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      email: invitation.email,
      fullName: name,
      password: hashedPassword,
      terms,
      role: "technician",
    });

    await Store.findByIdAndUpdate(invitation.storeId, {
      $addToSet: { technicians: newUser._id },
    });

    invitation.status = "accepted";
    invitation.acceptedAt = now;
    await invitation.save();

    const store = await Store.findById(invitation.storeId).select("name").lean();
    logEvent({
      user: newUser,
      action: "INVITE_COMPLETED",
      entity: "Invitation",
      entityId: invitation._id,
      metadata: {
        email: newUser.email,
        storeName: store?.name || "Unknown",
      },
    });

    return res.status(201).json({
      message: "Invitation accepted and account created",
      user: { _id: newUser._id, email: newUser.email, fullName: newUser.fullName },
    });
  } catch (err) {
    return next(err);
  }
});

export const resendInvitation = asyncHandler(async (req, res, next) => {
  const { invitationId } = req.body;
  const ownerId = req.user._id;
  const invitation = await Invitation.findOne({
    _id: invitationId,
    invitedBy: ownerId,
  });
  if (!invitation) {
    return next({ message: "Invitation not found", statusCode: 404 });
  }
  const now = new Date();
  const token = crypto.randomBytes(32).toString("hex");
  invitation.token = token;
  invitation.expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  invitation.status = "pending";
  await invitation.save();
  const inviteUrl = `${process.env.FRONTEND_URL}/accept-invite?token=${invitation.token}`;

  const store = await Store.findById(invitation.storeId).select("name").lean();
  await sendInviteEmail(invitation.email, inviteUrl, store.name);

  logEvent({
    user: req.user,
    action: "INVITE_EMAIL_RESEND",
    entity: "Invitation",
    entityId: invitation._id,
    metadata: {
      email: invitation.email,
      storeName: store?.name || "Unknown",
    },
  });

  res.status(200).json({ message: "Invitation resent successfully" });
});

export const getTechnicianTasks = asyncHandler(async (req, res) => {
  const technicianId = req.user._id;

  const { status, dateRange = "all", page = 1, limit = 10 } = req.query;

  const query = {
    technicianId,
  };

  if (status && status !== "all") {
    query.status = status;
  }

  const now = new Date();
  let start, end;

  switch (dateRange) {
    case "today":
      start = new Date(now.setHours(0, 0, 0, 0));
      end = new Date(now.setHours(23, 59, 59, 999));
      break;

    case "week":
      start = new Date();
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);

      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;

    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;

    case "all":
    default:
      break;
  }

  if (start && end) {
    query.assign_date = { $gte: start, $lte: end };
  }
  const skip = (page - 1) * limit;

  const [tasks, total] = await Promise.all([
    Task.find(query)
      .populate({
        path: "machineId",
        select: "machineId machineType storeId",
      })
      .populate({
        path: "createdBy",
        select: "fullName",
      })
      .sort({ assign_date: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Task.countDocuments(query),
  ]);

  const rows = tasks.map((task) => ({
    id: task._id,
    task: task.task,
    machine: task.machineId?.machineId || "—",
    owner: task.createdBy?.fullName || "—",
    date: task.assign_date.toISOString().split("T")[0],
    status: task.status,
    labourCost: task.labour_cost || 0,
    note: task.description || "",
    images: task.images || [],
  }));

  res.status(200).json({
    rows,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
    },
  });
});

export const createMaintenanceLog = async (req, res) => {
  try {
    const { taskId, logEntry, date, labour_cost, parts_cost } = req.body;
    const userId = req.user._id;

 
    if (!taskId || !logEntry || !date) {
      return res.status(400).json({
        errors: {
          taskId: !taskId ? "Task is required" : undefined,
          logEntry: !logEntry ? "Note is required" : undefined,
          date: !date ? "Date is required" : undefined,
        },
      });
    }

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({
        errors: { taskId: "Invalid task ID" },
      });
    }

    if (logEntry.trim().length < 3) {
      return res.status(400).json({
        errors: { logEntry: "Note must be at least 3 characters" },
      });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        errors: { date: "Invalid date" },
      });
    }

    const labour = Number(labour_cost);
    const parts = Number(parts_cost);

    if (labour < 0 || parts < 0) {
      return res.status(400).json({
        errors: {
          labour_cost: labour < 0 ? "Labour cost must be ≥ 0" : undefined,
          parts_cost: parts < 0 ? "Parts cost must be ≥ 0" : undefined,
        },
      });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const images = (req.files || []).map((file) => file.url);

    const log = await MaintenanceLog.create({
      taskId,
      userId,
      machineId: task.machineId,
      createdBy: userId,
      labour_cost: labour,
      parts_cost: parts,
      logEntry: logEntry.trim(),
      date: parsedDate,
      images,
    });

    await Task.updateOne(
  { _id: taskId },
  {
    $inc: {
      labour_cost: labour,
      parts_cost: parts,
    },
  }
);
    const machine = await Machine.findById(task.machineId);
    
    logEvent({
      user: req.user,
      action: "MAINTENANCE_LOG_CREATED",
      entity: "MaintenanceLog",
      entityId: log._id,
      metadata: {
        task:task.task,
        machineName: machine.machineId || null,
        machineId: machine._id,
        labourCost: labour,
        partsCost: parts,
      },
    });
    const technician = await User.findById(task.technicianId).select("email taskReminders");

    if(technician.taskReminders){
   sentTaskReminderEmail(
      technician.email,
      "Maintenance Log Created",
      `A maintenance log entry has been created for task "${task.task}".`,
      `${process.env.FRONTEND_URL}/maintenance/task/details/${taskId}`
   )
  }

    res.status(201).json({
      message: "Maintenance log created",
      logId: log._id,
    });
    
  } catch (err) {
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

export const getMachines = asyncHandler(async (req, res, next) => {
  try {
    const { role, _id: userId } = req.user;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      100,
    );
    const skip = (page - 1) * limit;

    let filter = { isActive: true };
    if (role === "owner") {
      filter.ownerId = userId;
    }

    if (role === "technician") {
      const machineIds = await Task.find({ technicianId: userId }).distinct(
        "machineId",
      );

      if (!machineIds.length) {
        return res.status(200).json({
          machines: [],
          pagination: { total: 0, page, limit, totalPages: 1 },
        });
      }

      filter._id = { $in: machineIds };
    }

    const [total, machines] = await Promise.all([
      Machine.countDocuments(filter),
      Machine.find(filter).sort({ _id: -1 }).skip(skip).limit(limit),
    ]);

    const totalPages = Math.max(Math.ceil(total / limit), 1);

    res.status(200).json({
      machines,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
});

export const getTechDashboardStats = asyncHandler(async (req, res, next) => {
  try {
    const technicianId = req.user._id;
    const totalTasks = await Task.countDocuments({ technicianId });
    const openTasks = await Task.countDocuments({
      technicianId,
      status: "open",
    });
    const completedTasks = await Task.countDocuments({
      technicianId,
      status: "completed",
    });
    const recentTasks = await Task.find({ technicianId })
      .sort({ assign_date: -1 })
      .limit(5)
      .populate({ path: "machineId", select: "machineId machineType location" })
      .lean();

    return res.status(200).json({
      totalTasks,
      openTasks,
      completedTasks,
      recentTasks,
    });
  } catch (error) {
    return next(error);
  }
});

export const cancelInvitation = asyncHandler(async (req, res, next) => {
  const { invitationId } = req.query;
  const ownerId = req.user._id;
  const invitation = await Invitation.findOne({
    _id: invitationId,
    invitedBy: ownerId,
  });
  if (!invitation) {
    return next({ message: "Invitation not found", statusCode: 404 });
  }
  invitation.status = "cancelled";
  await invitation.save();

  return res.status(200).json({ message: "Invitation cancelled" });
});