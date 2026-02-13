import asyncHandler from "../utility/asyncHandler.js";
import User from "../models/users.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { sendResetPasswordEmail } from "../utility/mail/sendResetPasswordEmail.js";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { logEvent } from "../services/auditLogger.js";
import { deleteCloudinaryImages } from "../middlewares/upload.middleware.js";
import Subscription from "../models/subscription.modal.js";
import Store from "../models/store.modal.js";

const registerUser = asyncHandler(async (req, res, next) => {
  const { fullName, email, password, terms } = req.body;
  if (!fullName || !email || !password) {
    return next({
      message: "Full name, email and password are required",
      statusCode: 400,
    });
  }
  if (!terms) {
    return next({
      message: "You must accept the terms and conditions",
      statusCode: 400,
    });
  }

  if (password.length < 6) {
    return next({
      message: "Password must be at least 6 characters",
      statusCode: 400,
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    return next({
      message: "User already exists",
      statusCode: 400,
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    fullName,
    email: normalizedEmail,
    password: hashedPassword,
    terms,
  });

  const userObject = user.toObject();
  delete userObject.password;

  // Log audit event for user registration
  logEvent({
    user: user,
    action: "USER_REGISTERED",
    entity: "User",
    entityId: user._id,
    metadata: {
      email: user.email,
      fullName: user.fullName,
    },
  });

  return res.status(201).json({
    message: "User created successfully",
    user: userObject,
  });
});

const loginUser = asyncHandler(async (req, res, next) => {
  const { email, password, rememberMe } = req.body;

  if (!email || !password) {
    return next({
      message: "Email and password are required",
      statusCode: 400,
    });
  }
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({
    email: normalizedEmail,
    isActive: true,
    deletedAt: null,
  }).select("+password");

  if (!user) {
    return next({
      message: "Invalid email or password",
      statusCode: 401,
    });
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return next({
      message: "Invalid email or password",
      statusCode: 401,
    });
  }
  if(user.role==="technician"){
    const store = await Store.findOne({ technicians: user._id, isActive: true, deletedAt: null });
    if(!store){
      return next({
        message: "You are not assigned to any store. Please contact store owner.",
        statusCode: 403,
      });
    }
  }

  const accessToken = await user.generateAccessToken();

  const refreshExpiry = rememberMe ? "30d" : "7d";
  const refreshToken = await user.generateRefreshToken(refreshExpiry);

  user.refreshToken = refreshToken;
  await user.save();

  // Log audit event for user login
  logEvent({
    user: user,
    action: "USER_LOGIN",
    entity: "User",
    entityId: user._id,
    metadata: {
      email: user.fullName,
    },
  });

  const refreshTokenMaxAge = rememberMe
    ? 30 * 24 * 60 * 60 * 1000
    : 7 * 24 * 60 * 60 * 1000;

  const plan = await Subscription.findOne({ ownerId: user._id }).select(
    "plan_type status",
  );
  const isSubscribed = !!(plan && ["active", "trial"].includes(plan.status));
  const isStore = !!(await Store.exists({ ownerId: user._id }));
  return res
    .cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.SAME_SITE,
      maxAge: refreshTokenMaxAge,
    })
    .status(200)
    .json({
      message: "Login successful",
      accessToken,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        profile_picture: user.profile_picture,
        role: user.role,
        taskReminders: user.taskReminders,
        isActive: user.isActive,
        isStore,
        createdAt: user.createdAt,
      },
      plan: {
        planType: plan?.plan_type,
        status: plan?.status,
      },
      isSubscribed: user.role === "owner" ? isSubscribed : true,
    });
});

const refreshAccessToken = asyncHandler(async (req, res, next) => {
  const { refreshToken } = req.cookies;
  if (!refreshToken) {
    return next({
      message: "refresh token missing",
      statusCode: 401,
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.REFRESH_KEY);
  } catch (error) {
    console.log(error.message);
    return next({
      message: "Invalid refresh token",
      statusCode: 401,
    });
  }

  const user = await User.findOne({
    _id: decoded._id,
    refreshToken,
    isActive: true,
    deletedAt: null,
  });

  const plan = await Subscription.findOne({ ownerId: user._id }).select(
    "plan_type status",
  );
  const isSubscribed = !!(plan && ["active", "trial"].includes(plan.status));
  const isStore = !!(await Store.exists({ ownerId: user._id }));

  if (!user) {
    return next({
      message: "User not found or invalid refresh token",
      statusCode: 401,
    });
  }

  const accessToken = await user.generateAccessToken();

  return res.status(200).json({
    accessToken,
    user: {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      taskReminders: user.taskReminders,
      profile_picture: user.profile_picture,
      isActive: user.isActive,
      role: user.role,
      isStore,
      createdAt: user.createdAt,
    },
    plan: {
      planType: plan?.plan_type,
      status: plan?.status,
    },
    isSubscribed: user.role === "owner" ? isSubscribed : true,
  });
});

const logoutUser = asyncHandler(async (req, res) => {
  const { refreshToken } = req.cookies;

  // Log audit event for user logout
  if (req.user) {
    logEvent({
      user: req.user,
      action: "USER_LOGOUT",
      entity: "User",
      entityId: req.user._id,
      metadata: {
        email: req.user.email,
      },
    });
  }

  if (refreshToken) {
    await User.updateOne({ refreshToken }, { $unset: { refreshToken: "" } });
  }

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.SAME_SITE,
  });

  res.status(200).json({
    message: "Logged out successfully",
  });
});

const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next({
      message: "Email is required",
      statusCode: 400,
    });
  }

  const user = await User.findOne({
    email: email.toLowerCase().trim(),
    isActive: true,
    deletedAt: null,
  });

  if (!user) {
    console.log("user not found in forgot password");

    return res.status(200).json({
      message: "If the email exists, a reset link has been sent",
    });
  }

  const resetToken = await user.generateForgotPasswordToken();

  await user.save({ validateBeforeSave: false });

  const resetLink = `${process.env.FRONTEND_URL}reset-password?token=${resetToken}`;

  await sendResetPasswordEmail(user.email, resetLink);

  // Log audit event for password reset request
  logEvent({
    user: user,
    action: "PASSWORD_RESET_REQUESTED",
    entity: "User",
    entityId: user._id,
    metadata: {
      email: user.fullName,
    },
  });

  return res.status(200).json({
    message: "If the email exists, a reset link has been sent",
  });
});

const resetPassword = asyncHandler(async (req, res, next) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return next({
      message: "Token and new password are required",
      statusCode: 400,
    });
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    forgotPasswordToken: hashedToken,
    forgotPasswordTokenExpiry: { $gt: Date.now() },
    isActive: true,
    deletedAt: null,
  });

  if (!user) {
    return next({
      message: "Invalid or expired token",
      statusCode: 400,
    });
  }

  user.password = await bcrypt.hash(newPassword, 10);
  user.forgotPasswordToken = undefined;
  user.forgotPasswordTokenExpiry = undefined;
  user.refreshToken = undefined;

  await user.save({ validateBeforeSave: true });

  // Log audit event for password reset
  logEvent({
    user: user,
    action: "PASSWORD_RESET",
    entity: "User",
    entityId: user._id,
    metadata: {
      email: user.email,
    },
  });

  return res.status(200).json({
    message: "Password has been reset successfully",
  });
});

const updatePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next({
      message: "Current and new passwords are required",
      statusCode: 400,
    });
  }

  const user = await User.findById(req.user._id).select("+password");

  if (!user) {
    return next({
      message: "User not found",
      statusCode: 404,
    });
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password);

  if (!isMatch) {
    return next({
      message: "Current password is incorrect",
      statusCode: 401,
    });
  }

  const isSame = await bcrypt.compare(newPassword, user.password);
  if (isSame) {
    return next({
      message: "New password must be different from current password",
      statusCode: 400,
    });
  }

  user.password = await bcrypt.hash(newPassword, 10);
  user.refreshToken = undefined;

  await user.save({ validateBeforeSave: true });

  // Log audit event for password update
  logEvent({
    user: req.user,
    action: "USER_PASSWORD_UPDATED",
    entity: "User",
    entityId: user._id,
    metadata: {
      email: user.email,
    },
  });

  return res.status(200).json({
    message: "Password updated successfully",
  });
});

const updateUserEmail = asyncHandler(async (req, res, next) => {
  const { newEmail } = req.body;

  if (!newEmail) {
    return next({
      message: "New email is required",
      statusCode: 400,
    });
  }

  const normalizedEmail = newEmail.toLowerCase().trim();

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    return next({
      message: "Email is already in use",
      statusCode: 400,
    });
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    return next({
      message: "User not found",
      statusCode: 404,
    });
  }

  user.email = normalizedEmail;
  await user.save();

  // Log audit event for email update
  logEvent({
    user: req.user,
    action: "USER_EMAIL_UPDATED",
    entity: "User",
    entityId: user._id,
    metadata: {
      email: normalizedEmail,
    },
  });

  return res.status(200).json({
    message: "Email updated successfully",
    email: user.email,
  });
});

export const updateUserData = asyncHandler(async (req, res) => {
  try {
    const { email, name, userId } = req.body;

    let profile_picture = undefined;
    if (req.file) {
      profile_picture = req.file.url;
    }

    const updateData = {
      ...(email ? { email } : {}),
      ...(name ? { fullName: name } : {}),
      ...(profile_picture ? { profile_picture } : {}),
    };

    const user = await User.findById(userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found." });

    if (profile_picture && user.profile_picture) {
      const oldPath = path.join(
        process.cwd(),
        user.profile_picture.replace(/^\//, ""),
      );
      if (fs.existsSync(oldPath)) await fs.promises.unlink(oldPath);
    }
    Object.assign(user, updateData);
    await user.save();

    // Log audit event for user data update
    logEvent({
      user: req.user,
      action: "USER_UPDATED",
      entity: "User",
      entityId: user._id,
      metadata: {
        email: user.email,
        updatedFields: Object.keys(updateData),
      },
    });

    const userObj = user.toObject();
    delete userObj.password;

    return res
      .status(200)
      .json({ message: "User updated successfully.", user: userObj });
  } catch (error) {
    if (req.file) {
      const p = path.join(
        process.cwd(),
        "uploads",
        "profile",
        req.file.filename,
      );
      if (fs.existsSync(p)) await fs.promises.unlink(p);
    }
    return res
      .status(500)
      .json({ message: "Failed to update user.", error: error.message });
  }
});

const updateTaskReminders = asyncHandler(async (req, res, next) => {
  const { taskReminders } = req.body;

  if (typeof taskReminders !== "boolean") {
    return next({
      message: "taskReminders must be a boolean",
      statusCode: 400,
    });
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    return next({
      message: "User not found",
      statusCode: 404,
    });
  }

  user.taskReminders = taskReminders;
  await user.save();

  // Log audit event for task reminders update
  logEvent({
    user: req.user,
    action: "USER_TASK_REMINDERS_UPDATED",
    entity: "User",
    entityId: user._id,
    metadata: {
      email: user.email,
      value: taskReminders,
    },
  });

  return res.status(200).json({
    message: "Task reminders preference updated successfully",
    taskReminders: user.taskReminders,
  });
});

const updateUserProfile = asyncHandler(async (req, res, next) => {
  const { userId } = req.body;

  if (!req.file || !req.file.url) {
    return next({
      statusCode: 400,
      message: "Profile image is required",
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    return next({
      statusCode: 404,
      message: "User not found",
    });
  }

  // 🔥 Delete old image from Cloudinary if exists
  if (user.profile_picture_cloudinary_id) {
    await deleteCloudinaryImages([user.profile_picture_cloudinary_id]);
  }

  user.profile_picture = req.file.url;
  user.profile_picture_cloudinary_id = req.file.cloudinaryId;

  await user.save();

  res.status(200).json({
    message: "Profile picture updated successfully",
    profile_picture: user.profile_picture,
  });
});

export {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  forgotPassword,
  resetPassword,
  updatePassword,
  updateUserEmail,
  updateTaskReminders,
  updateUserProfile,
};
