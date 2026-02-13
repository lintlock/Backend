import express from 'express'
const router = express.Router();
import { authenticated } from '../middlewares/auth.middleware.js';
import { authorizeRoles } from '../middlewares/roles.middleware.js';
import { createMaintenanceLog, getTechDashboardStats, getTechnicianTasks, sendInvitation,completeInvitation, getInvitation, resendInvitation, cancelInvitation } from '../controllers/technician.controller.js';
import uploadToCloudinary, { imageFilter } from '../middlewares/upload.middleware.js';

import { getLogById, updateLog, updateTaskStatus } from '../controllers/maintenance.controller.js';
import { createTaskRequest, deleteTaskRequest, getTaskRequestById, getTaskRequests } from '../controllers/taskRequest.controller.js';

// Configure upload for maintenance log images (max 3 images, 5MB each)
const maintenanceLogUpload = uploadToCloudinary({ 
  dest: 'uploads/maintenance-logs', 
  fileFilter: imageFilter, 
  limits: { fileSize: 5 * 1024 * 1024 } 
});

const taskRequestUpload = uploadToCloudinary({ dest: 'uploads/task-requests',fileFilter: imageFilter, 
  limits: { fileSize: 5 * 1024 * 1024 } });   
// Technician Routes
router.post('/invitation', authenticated, authorizeRoles("owner"), sendInvitation);
router.get('/get-invitation', getInvitation);
router.post('/accept-invitation', completeInvitation);
router.get('/tasks', authenticated, authorizeRoles("technician"), getTechnicianTasks);
router.post('/createMaintenanceLog', authenticated, authorizeRoles("technician","owner"), ...maintenanceLogUpload.array('images', 3), createMaintenanceLog);
router.get('/dashboard', authenticated, authorizeRoles("technician","owner"), getTechDashboardStats);
router.put('/updateTaskStatus', authenticated, authorizeRoles("technician","owner"), updateTaskStatus);
router.put('/resend-invitation', authenticated, authorizeRoles("owner"), resendInvitation);   
router.put('/updateLog/:logId', authenticated, authorizeRoles("technician","owner"), ...maintenanceLogUpload.array('images', 3), updateLog);
router.put('/cancel-invitation', authenticated, authorizeRoles("owner"), cancelInvitation);
router.get('/getLogById', authenticated, authorizeRoles("technician","owner"), getLogById);

//Task Request Routes
router.post('/createTaskRequest', authenticated, authorizeRoles("technician"), ...taskRequestUpload.array('images', 3), createTaskRequest);
router.get('/getTaskRequests', authenticated, authorizeRoles("technician","owner"), getTaskRequests);
router.get('/getTaskRequestById/:id', authenticated, authorizeRoles("technician","owner"), getTaskRequestById);
router.delete('/deleteTaskRequest/:id', authenticated, authorizeRoles("technician","owner"), deleteTaskRequest);
export default router;
