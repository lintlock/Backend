import mongoose from "mongoose";
import Machine from "../models/machine.modal.js";
import Task from "../models/task.modal.js";
import Store from "../models/store.modal.js";
import User from "../models/users.model.js";
import Subscription from "../models/subscription.modal.js";
import asyncHandler from "../utility/asyncHandler.js";
import SubscriptionPlan from "../models/subsciptionPlan.modal.js";
import AuditLog from "../models/auditLog.model.js";
import { logEvent } from "../services/auditLogger.js";
import { AdminSettings } from "../models/adminSettings.modal.js";


 const actionDisplayNames = {
  USER_LOGIN: 'User Login',
  USER_LOGOUT: 'User Logout',
  USER_REGISTERED: 'User Registered',
  USER_UPDATED: 'Profile Edited',
  USER_EMAIL_UPDATED: 'Email Updated',
  USER_PASSWORD_UPDATED: 'Password Changed',
  USER_TASK_REMINDERS_UPDATED: 'Reminders Updated',
  PASSWORD_RESET_REQUESTED: 'Reset Requested',
  PASSWORD_RESET: 'Password Reset',

  PHONE_UPDATED: 'Phone Updated',
  PROFILE_NAME_UPDATED: 'Name Updated',

  TASK_ADDED: 'Task Added',
  TASK_COMPLETED: 'Task Completed',
  TASK_STATUS_UPDATED: 'Status Updated',
  TASK_UPDATED: 'Task Updated',
  TASK_CANCELLED: 'Task Cancelled',

  MAINTENANCE_LOG_CREATED: 'Log Created',
  UPDATE_LOG: 'Log Updated',

  MACHINE_CREATED: 'Machine Added',
  MACHINE_ADDED: 'Machine Added',
  MACHINE_UPDATED: 'Machine Updated',
  MACHINE_DELETED: 'Machine Removed',

  STORE_CREATED: 'Store Created',
  STORE_UPDATED: 'Store Updated',
  OPERATING_HOURS_UPDATED: 'Hours Updated',

  INVITE_SENT: 'Invite Sent',
  INVITE_COMPLETED: 'Invite Completed',
  INVITE_EMAIL_RESEND: 'Invite Resent',

  IMAGE_DELETED: 'Image Deleted',

  SUBSCRIPTION_UPGRADED: 'Plan Upgraded',
  SUBSCRIPTION_PLAN_CREATED: 'Plan Created',
  SUBSCRIPTION_PLAN_UPDATED: 'Plan Updated',
  SUBSCRIPTION_PLAN_DELETED: 'Plan Deleted',
  SUBSCRIPTION_OVERRIDDEN: 'Plan Overridden',
  SUBSCRIPTION_REINSTATED: 'Plan Reinstated',

  REMOVE_TECHNICIAN_FROM_STORE: 'Technician Removed',

  TASK_REQUEST_CREATED: 'Request Created',
  TASK_REQUEST_UPDATED: 'Request Updated',
  TASK_REQUEST_STATUS_UPDATED: 'Status Updated',
  REQUEST_APPROVED: 'Request Approved',
  REQUEST_REJECTED: 'Request Rejected',
};


export const getMachines = asyncHandler(async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      100,
    );
    const skip = (page - 1) * limit;

    const { search } = req.query;
    const filter = {};

    if (search && String(search).trim()) {
      const q = String(search).trim();
      filter.$or = [
        { machineId: { $regex: q, $options: "i" } },
        { manufacturer: { $regex: q, $options: "i" } },
        { model: { $regex: q, $options: "i" } },
        { serialNumber: { $regex: q, $options: "i" } },
        { location: { $regex: q, $options: "i" } },
      ];
    }

    const [total, machines] = await Promise.all([
      Machine.countDocuments(filter),
      Machine.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ]);

    const totalPages = Math.max(Math.ceil(total / limit), 1);

    return res.status(200).json({
      machines,
      pagination: { total, page, limit, totalPages },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to retrieve machines.", error: error.message });
  }
});

export const getStores = asyncHandler(async (req, res) => {
  const ownerId = req.user._id;
  const stores = await Store.find({ ownerId, isActive: true, deletedAt: null });

  return res.status(200).json({
    stores,
  });
});

export const getUsers = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const skip = (page - 1) * limit;
  const role = req.query.role;
  const filter = {
    role: { $ne: "admin" },
    deletedAt: null,
  };

  if (req.query.search) {
    const q = req.query.search.trim();
    filter.$or = [
      { fullName: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { phone_number: { $regex: q, $options: "i" } },
    ];
  }
  if (role && role !== "All") {
    filter.role = role;
  }
  
  const users = await User.find(filter)
    .select("fullName email role isActive profile_picture")
    .select("-password")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const ownerIds = users.filter((u) => u.role === "owner").map((u) => u._id);

  let subsMap = {};
  if (ownerIds.length) {
    const subs = await Subscription.find({ ownerId: { $in: ownerIds } })
      .select("ownerId plan_type status currentPeriodStart currentPeriodEnd")
      .lean();

    subs.forEach((s) => {
      subsMap[String(s.ownerId)] = s;
    });
  }

  let finalUsers = users.map((u) => {
    if (u.role !== "owner") {
      return { ...u, billingStatus: "--" };
    }

    const sub = subsMap[String(u._id)];

    let billingStatus = "Comped";
    if (sub) {
      if (sub.status === "trial") billingStatus = "Trial";
      else if (sub.status === "active") billingStatus = "Active";
      else if (sub.status === "past_due") billingStatus = "Past Due";
      else if (sub.status === "needs_service") billingStatus = "Needs Service";
      else billingStatus = sub.status;
    }

    return {
      ...u,
      billingStatus,
    };
  });

  const billingStatusFilter = req.query.status;
  if (billingStatusFilter && billingStatusFilter !== "All") {
    const bs = billingStatusFilter.toLowerCase();
    finalUsers = finalUsers.filter((u) => {
      if (u.role !== "owner") return false; // technicians excluded when filtering by billing status
      return u.billingStatus.toLowerCase() === bs;
    });
  }

  const total = await User.countDocuments(filter);
  const totalPages = Math.max(Math.ceil(total / limit), 1);

  return res.status(200).json({
    users: finalUsers,
    pagination: { total, page, limit, totalPages },
  });
});

export const getUserById = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ _id: userId }).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    return res.status(200).json({ user });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to retrieve user.", error: error.message });
  }
});

export const getAdminDashboardStats = asyncHandler(async (req, res) => {
  try {
    const totalOpenTasks = await Task.countDocuments({
      status: { $in: ["open", "needs_service"] },
    });

    const totalCompletedTasks = await Task.countDocuments({
      status: "completed",
    });

    const recentUsers = await User.find({
      isActive: true,
      deletedAt: null,
      role: { $ne: "admin" },
    })
      .select("_id fullName email role isActive profile_picture createdAt")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
   
    const recentTasks = await Task.aggregate([
      { $match: { status: { $ne: "cancelled" }, deletedAt: null } },
      { $sort: { createdAt: -1 } },
      { $limit: 5 },

      {
        $lookup: {
          from: "machines",
          localField: "machineId",
          foreignField: "_id",
          as: "machine",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "technicianId",
          foreignField: "_id",
          as: "technician",
        },
      },

      { $unwind: "$machine" },
      { $unwind: { path: "$technician", preserveNullAndEmptyArrays: true } },

      {
        $project: {
          _id: 1,
          task: 1,
          status: {
            $switch: {
              branches: [
                { case: { $eq: ["$status", "needs_service"] }, then: "Needs Service" },
                { case: { $eq: ["$status", "completed"] }, then: "Completed" },
                { case: { $eq: ["$status", "open"] }, then: "Open" },
              ],
              default: "$status",
            },
          },
          machine: "$machine.machineId",
          technician: { $ifNull: ["$technician.fullName", "Unassigned"] },
          createdAt: 1,
        },
      },
    ]);

    const recentBillingUsers = await Subscription.aggregate([
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
      { $lookup: {
          from: "users",
          localField: "ownerId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $lookup: {
          from: "subscriptionplans",
          localField: "planId",
          foreignField: "_id",
          as: "plan",
        },
      },

      { $unwind: "$user" },
      { $unwind: { path: "$plan", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          ownerId: 1,
          plan_type: 1,
          plan_name: "$plan.name",
          status: 1,
          createdAt: 1,
          userId: "$user._id",
          userName: "$user.fullName",
        },
      },
    ])
   

    return res.status(200).json({
      totalOpenTasks,
      totalCompletedTasks,
      recentUsers,
      recentTasks,
      recentBillingUsers,
    });

  } catch (error) {
    return res.status(500).json({
      message: "Failed to retrieve dashboard stats.",
      error: error.message,
    });
  }
});

export const getMaintenanceTask = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      100,
    );
    const skip = (page - 1) * limit;

    const { search, status, machineId, date } = req.query; 
    const match = {};

    if (status && status !== "All") {
      match.status = status;
    }

    if (machineId && machineId !== "All") {
      match.machineId = new mongoose.Types.ObjectId(machineId);
    }

    if (search) {
      match.$or = [
        { task: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (date && date !== "All") {
      const now = new Date();
      let start, end;

      if (date === "today") {
        start = new Date();
        start.setHours(0, 0, 0, 0);

        end = new Date();
        end.setHours(23, 59, 59, 999);
      }

      if (date === "week") {
        const day = now.getDay();

        start = new Date(now);
        start.setDate(now.getDate() - day);
        start.setHours(0, 0, 0, 0);

        end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
      }

      if (date === "month") {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59,
          999,
        );
      }

      match.assign_date = { $gte: start, $lte: end };
    }

    const pipeline = [
      { $match: match },
      { $sort: { createdAt: -1 } },

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
          from: "users",
          localField: "technicianId",
          foreignField: "_id",
          as: "technician",
        },
      },
      { $unwind: { path: "$technician", preserveNullAndEmptyArrays: true } },

      {
        $project: {
          _id: 1,
          machine: "$machine.machineId",
          task: 1,
          assignedTo: "$technician.fullName",
          date: "$assign_date",
          status: 1,
        },
      },

      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const result = await Task.aggregate(pipeline);

    const tasks = result[0].data;
    const total = result[0].totalCount[0]?.count || 0;
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const machines = await Machine.find().select("_id machineId").lean();
    return res.status(200).json({
      tasks ,
      machines,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to retrieve maintenance records.",
      error: error.message,
    });
  }
};


export const getBillingUsers = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const skip = (page - 1) * limit;

  const pipeline = [
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: "users",
        localField: "ownerId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    { $match: { "user.deletedAt": null } },
    {
      $lookup: {
        from: "subscriptionplans",
        localField: "planId",
        foreignField: "_id",
        as: "plan",
      },
    },
    { $unwind: { path: "$plan", preserveNullAndEmptyArrays: true } },
  ];

  if (req.query.search) {
    const q = req.query.search.trim();
    pipeline.push({
      $match: {
        $or: [
          { "user.fullName": { $regex: q, $options: 'i' } },
        ],
      },
    });
  }

  pipeline.push(
    {
      $project: {
        _id: 1,
        ownerId: 1,
        status: 1,
        plan_type: 1,
        currentPeriodStart: 1,
        currentPeriodEnd: 1,
        createdAt: 1,
        reason:1,
        name: "$user.fullName",
        profile_picture:"$user.profile_picture",
        planName: "$plan.name",
        durationMonths: "$plan.durationMonths",
        trialDays: "$plan.trialDays",
      },
    },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        totalCount: [{ $count: "count" }],
      },
    }
  );

  const [result] = await Subscription.aggregate(pipeline);
  const billingUsers = result.data;
  const total = result.totalCount[0]?.count || 0;

  return res.status(200).json({
    data: billingUsers,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
});


export const getUserBillingDetails = asyncHandler(async (req, res) => {
  const { userId } = req.query;

  const user = await User.findById(userId)
    .select(' fullName email role profile_picture ')
    .lean();
  if (!user || user.role !== 'owner') {
    return res.status(404).json({ message: 'Owner not found.' });
  }

  const store = await Store.findOne({ ownerId: user._id })
    .select('storeName phone address createdAt')
    .lean();

  const subscription = await Subscription.findOne({ ownerId: user._id })
    .select('planId status billingCycle cancelAtPeriodEnd currentPeriodEnd')
    .lean();

  if (!subscription) {
    return res.status(404).json({ message: 'Subscription not found.' });
  }


  const plan = await SubscriptionPlan.findById(subscription.planId)
    .select('name price durationMonths')
    .lean();

  const billingCycle =
    subscription.billingCycle === 'yearly'
      ? 'Yearly'
      : 'Monthly';

  return res.status(200).json({
    user: {
      id: user._id,
      name: user.fullName,
      email: user.email,
      profile_picture: user.profile_picture
    },
    store: store
      ? {
          name: store.storeName,
          phone: store.phone || null,
          address: store.address || null,
          customerSince: new Date(store.createdAt).toLocaleString('en-US', {
            month: 'long',
            year: 'numeric',
          }),
        }
      : null,
    plan: {
      name: plan?.name || 'Unknown Plan',
      price: plan?.price || 0,
      currency: 'USD',
      billingCycle,
      status: subscription.status.toUpperCase(),
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodEnd:subscription.currentPeriodEnd
    },
  });
});

export const getAuditLogs = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const skip = (page - 1) * limit;
  const filter = {};

  let actionKey = req.query.action;
  if (actionKey && actionKey !== 'All') {

    const found = Object.entries(actionDisplayNames).find(([, display]) => display === actionKey);
    if (found) {
      actionKey = found[0];
    }
  }

  if (req.query.search && req.query.search.trim()) {
    const q = req.query.search.trim();
    filter.$or = [
      { description: { $regex: q, $options: 'i' } },
      { userName: { $regex: q, $options: 'i' } },
      { action: { $regex: q, $options: 'i' } },
    ];
  }
  if (req.query.userId) {
    filter.userId = req.query.userId;
  }
  if (actionKey && actionKey !== 'All') {
    filter.action = actionKey;
  }
  if (req.query.startDate && req.query.endDate) {
    const start = new Date(req.query.startDate);
    const end = new Date(req.query.endDate);
    end.setHours(23, 59, 59, 999);
    filter.timestamp = { $gte: start, $lte: end };
  }
  
  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .select("_id userId userName action description timestamp")
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  const formatTime = (date) => {
    const now = new Date();
    const logDate = new Date(date);
    const isToday = logDate.toDateString() === now.toDateString();
    const timeStr = logDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    if (isToday) {
      return `Today at ${timeStr}`;
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (logDate.toDateString() === yesterday.toDateString()) {
      return `Yesterday at ${timeStr}`;
    }
    return logDate.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }) + ` at ${timeStr}`;
  };

  const formattedLogs = logs.map((log) => ({
    id: log._id,
    time: formatTime(log.timestamp),
    user: log.userName || 'System',
    action: actionDisplayNames[log.action] || log.action,
    description: log.description,
  }));

  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const users = await User.find().select('fullName').lean();
  return res.status(200).json({
    logs: formattedLogs,
    users,
    actionTypes: Object.values(actionDisplayNames),
    pagination: { total, page, limit, totalPages },
  });
});

export const getUsersAuditLogs = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const skip = (page - 1) * limit;
  const filter = { userId };
  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .select("_id userId userName action description timestamp")
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  return res.status(200).json({
    logs,
    pagination: { total, page, limit, totalPages },
  });
});

export const getUsersSelect = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const skip = (page - 1) * limit;
  const search = req.query.search?.trim();

  const filter = {
    isDeleted: { $ne: true },
    ...(search && {
      fullName: { $regex: search, $options: "i" },
    }),
  };

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("_id fullName")
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    User.countDocuments(filter),
  ]);

  res.status(200).json({
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export const overrideTrialSubscription = asyncHandler(async (req, res) => {
  const { ownerId, reason } = req.body;
  const subscription = await Subscription.findOne({ ownerId: ownerId, plan_type: 'trial' });
  if (!subscription) {
    return res.status(404).json({ message: 'Trial subscription not found for this user.' });
  }
  subscription.status = subscription.status==='overridden' ? 'trial' : 'overridden';
  subscription.reason = reason || '';
  await subscription.save();

  const userName = await User.findById(ownerId).select('fullName').lean();

  logEvent({
    user: req.user,
    action: subscription.status === 'overridden' ? 'SUBSCRIPTION_OVERRIDDEN' : 'SUBSCRIPTION_REINSTATED',
    entity: 'Subscription',
    entityId: ownerId,
    metadata: { userName: userName.fullName }
  });

  return res.status(200).json({ message: 'Trial subscription overridden successfully.' });
}
);

export const updateTechnicianAllowedSetting = asyncHandler(async (req, res) => {
  try {
    const {key, value } = req.body;

    if (typeof value !== "number") {
      return res.status(400).json({
        message: "Value must be a number"
      });
    }

    const setting = await AdminSettings.findOneAndUpdate(
      { key: key },
      { $set: { value } },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    return res.status(200).json({
      message: "Global technician setting updated",
      setting
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update setting",
      error: error.message
    });
  }
});

export const getTechnicianAllowedSetting = asyncHandler(async (req, res) => {
  try {
    const setting = await AdminSettings.find();

    if (!setting) {
      return res.status(404).json({
        message: "Setting not found"
      });
    }
    return res.status(200).json({
      setting
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to retrieve setting",
      error: error.message
    });
  }
});






