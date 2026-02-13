import express from 'express';
const router = express.Router();
import { authenticated } from '../middlewares/auth.middleware.js';
import { verifyActiveSubscription } from '../middlewares/subscription.middleware.js';
import { createStore, getOwnersStore, getOwnerDashboard, updateOperatingHours, getOperatingHours, getActiveSubscriptionPlan, getStoreTasks, deleteImage, getStoreTechhnician,getInvitations, removeTechnicianFromStore } from '../controllers/store.controller.js';
import { authorizeRoles } from '../middlewares/roles.middleware.js';
import { createMachine, deleteMachine, getMachineById, getMachineDetails, getMachines, getMachinesWithTypes, updateMechineData } from '../controllers/machine.controller.js';
import {createTask,getMaintenanceLogById, getTaskById, updateMaintenance, getTaskDetails, cancelTask} from '../controllers/maintenance.controller.js';

import { updateUserEmail } from '../controllers/users.controller.js';
import { downloadMaintenanceLog, getCostSummaryReport, getMaintenanceCostBreakdown } from '../controllers/reports.controller.js';
import uploadToCloudinary, { imageFilter } from '../middlewares/upload.middleware.js';
import { updateTaskRequest, updateTaskRequestStatus } from '../controllers/taskRequest.controller.js';

const machineUpload = uploadToCloudinary({ dest: 'uploads/machines',fileFilter: imageFilter, 
  limits: { fileSize: 5 * 1024 * 1024 } });

const taskUpload = uploadToCloudinary({ dest: 'uploads/maintenance-tasks',fileFilter: imageFilter, 
  limits: { fileSize: 5 * 1024 * 1024 } });  

// Apply authentication and subscription check to all store routes
router.use(authenticated);

// Store Routes
router.get('/dashboard', authorizeRoles("owner"), getOwnerDashboard);
router.post('/createStore', authorizeRoles("owner"), createStore);
router.get('/getStore', authorizeRoles("owner"), getOwnersStore);
router.put('/updateOperatingHours', authorizeRoles("owner"), updateOperatingHours);
router.get('/getOperatingHours', authorizeRoles("owner"), getOperatingHours);
router.get('/getActiveSubscriptionPlan', authorizeRoles("owner"), getActiveSubscriptionPlan);

// Machine Routes
router.post('/createMachine', authorizeRoles("owner"), ...machineUpload.array('images', 3), createMachine);
router.get('/getMachines', authorizeRoles("owner","technician","admin"), getMachines);
router.put('/updateMachine/:machineId', authorizeRoles("owner"),...machineUpload.array('images', 3), updateMechineData);
router.delete('/deleteMachine/:machineId', authorizeRoles("owner"), deleteMachine);
router.get('/getMachineDetails', authorizeRoles("owner"), getMachineDetails);
router.get('/getMachineById', authorizeRoles("owner"), getMachineById);
router.get('/getMachinesWithTypes', authorizeRoles("owner","technician"), getMachinesWithTypes);

// Maintenance Routes
router.post('/createTask',authorizeRoles('owner'), ...taskUpload.array('images', 3), createTask);
router.get('/getStoreTasks', authorizeRoles("owner"), getStoreTasks);
router.put( '/updateMaintenance/:id',authorizeRoles('owner','technician'),...taskUpload.array('images', 3), updateMaintenance);
router.put('/updateUserEmail', authorizeRoles("owner"), updateUserEmail);
router.get('/getTaskById', authorizeRoles("owner","technician"), getTaskById);
router.get('/getLogsByTask', authorizeRoles("owner","technician","admin"), getMaintenanceLogById);
router.get('/getTaskDetails', authorizeRoles("owner","technician","admin"), getTaskDetails);
router.delete('/deleteImage', authorizeRoles('owner', 'technician', 'admin'), deleteImage);
router.put('/cancelTask/:taskId',authorizeRoles("owner"),cancelTask);

//StoreReports Routes
router.get('/getCostSummaryReport', authorizeRoles("owner"), getCostSummaryReport);
router.get('/getMaintenanceCostBreakdown', authorizeRoles("owner"), getMaintenanceCostBreakdown);
router.get('/downloadMaintenanceLog', authorizeRoles("owner"), downloadMaintenanceLog);

//Technician Routes
router.get('/getStoreTechnician', authorizeRoles("owner"), getStoreTechhnician);
router.get('/getInvitations', authorizeRoles("owner"), getInvitations);
router.put('/remove-technician', authorizeRoles("owner"), removeTechnicianFromStore);
router.put('/updateTaskRequestStatus/:id', authorizeRoles("owner"), updateTaskRequestStatus);
router.put('/updateTaskRequest/:id', authorizeRoles("owner","technician"), ...taskUpload.array('images', 3), updateTaskRequest);

export default router;