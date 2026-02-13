const eventTemplates = {
  TASK_ADDED: ({ taskName, machineName }) => `Created task "${taskName}" for machine "${machineName}"`,
  TASK_COMPLETED: ({ taskId, machineName }) => `Marked ${machineName}'s task "${taskId}" as complete.`,
  PHONE_UPDATED: ({ oldPhone, newPhone, targetUser }) => `Updated phone number from ${oldPhone} to ${newPhone} for ${targetUser}`,
  PROFILE_NAME_UPDATED: ({ oldName, newName }) => `Changed profile name from "${oldName}" to "${newName}"`,
  MACHINE_ADDED: ({ machineId, machineName }) => `Added new machine "${machineName}" (ID: ${machineId})`,
  MACHINE_CREATED: ({ machineId, machineName }) => `Added new machine "${machineName}" (ID: ${machineId})`,
  MACHINE_UPDATED: ({ machineId }) => `Updated machine (ID: ${machineId})`,
  INVITE_SENT: ({ email, storeName }) => `Sent invitation to ${email} to join ${storeName}`,
  INVITE_EMAIL_RESEND: ({ email, storeName }) => `Resent invitation email to ${email} for ${storeName}`,
  INVITE_COMPLETED: ({ email, storeName }) => `Completed invitation for ${email} and added to ${storeName}`,
  MAINTENANCE_LOG_CREATED: ({ task }) => `Created maintenance log for task ${task}`,
  TASK_STATUS_UPDATED: ({ taskId, status }) => `Updated task ${taskId} status to "${status}"`,
  USER_REGISTERED: ({ email }) => `Registered new user ${email}`,
  USER_LOGIN: ({ email }) => `User ${email} logged in`,
  PASSWORD_RESET_REQUESTED: ({ email }) => `Password reset requested for ${email}`,
  PASSWORD_RESET: ({ email }) => `Password reset for ${email}`,
  USER_LOGOUT: ({ email }) => `User ${email} logged out`,
  USER_UPDATED: ({ email }) => `Updated user ${email}`,
  USER_PASSWORD_UPDATED: ({ email }) => `User ${email} changed password`,
  USER_TASK_REMINDERS_UPDATED: ({ email, value }) => `User ${email} set task reminders to ${value}`,
  OPERATING_HOURS_UPDATED: ({ storeName }) => `Updated operating hours for ${storeName}`,
  MACHINE_DELETED: ({ machineId }) => `Deleted machine ${machineId}`,
  TASK_UPDATED: ({ name, changes, imagesAdded }) => {
    const changedFields = changes ? Object.keys(changes).map(key => 
      `${key}: "${changes[key].old}" → "${changes[key].new}"`
    ).join(', ') : '';
    return `Updated maintenance "${name}" ${changedFields ? ` (${changedFields})` : ''}${imagesAdded ? ` with ${imagesAdded} new image(s)` : ''}`;
  },
UPDATE_LOG: ({ logEntry, changes, imagesAdded }) => {
  const changedFields = changes
    ? Object.entries(changes)
        .map(([key, val]) => `${key}: "${val.old}" → "${val.new}"`)
        .join(", ")
    : "";

  return `Updated Log "${logEntry}"${
    changedFields ? ` (${changedFields})` : ""
  }${imagesAdded ? ` with ${imagesAdded} new image(s)` : ""}`;
},
  USER_EMAIL_UPDATED: ({ email }) => `Updated user email to ${email}`,
  IMAGE_DELETED: ({ imageType,name }) => `Deleted (${imageType}) image for "${name}"`,
  SUBSCRIPTION_PLAN_CREATED: ({ planName }) => `Created subscription plan ${planName}`,
  SUBSCRIPTION_PLAN_DELETED: ({ planName }) => `Deleted subscription plan ${planName}`,
  SUBSCRIPTION_PLAN_UPDATED: ({ planName }) => `Updated subscription plan ${planName}`,
  STORE_CREATED: ({ storeName }) => `Created store "${storeName}"`,
  STORE_UPDATED: ({ storeName }) => `Updated store "${storeName}"`,
  SUBSCRIPTION_UPGRADED: ({ planName }) => `Upgraded subscription to ${planName}`,
  TASK_CANCELLED:({taskName,machineName})=>`Cancelled "${taskName}" for machine "${machineName}"`,
  SUBSCRIPTION_OVERRIDDEN:({userName})=>` Admin Overridden subscription for user "${userName}"`,
  SUBSCRIPTION_REINSTATED:({userName})=>`Admin Reinstated subscription for user "${userName}"`,
  REMOVE_TECHNICIAN_FROM_STORE:({technician,storeName})=>`Removed technician "${technician}" from store "${storeName}"`,
  TASK_REQUEST_CREATED: ({ task, machineName }) => `Created task request "${task}" for machine "${machineName}"`,
  TASK_REQUEST_UPDATED: ({ id, changes, imagesAdded }) => {
    const changedFields = changes ? Object.keys(changes).map(key => 
      `${key}: "${changes[key].old}" → "${changes[key].new}"`
    ).join(', ') : '';
    return `Updated task request "${id}" ${changedFields ? ` (${changedFields})` : ''}${imagesAdded ? ` with ${imagesAdded} new image(s)` : ''}`;
  },
  REQUEST_APPROVED: ({ task }) => `Approved task request "${task}"`,
  REQUEST_REJECTED: ({ task }) => `Rejected task request "${task}"`,
};

export default eventTemplates;
