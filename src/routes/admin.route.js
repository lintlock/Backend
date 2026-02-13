import express from 'express';

const router = express.Router();    
import { authenticated } from '../middlewares/auth.middleware.js';
import { authorizeRoles } from '../middlewares/roles.middleware.js';
// import { softDeleteStore } from '../controllers/store.controller.js';
import { getAdminDashboardStats, getAuditLogs, getBillingUsers, getMaintenanceTask, getStores, getTechnicianAllowedSetting, getUserBillingDetails, getUsersAuditLogs, getUsersSelect, overrideTrialSubscription, updateTechnicianAllowedSetting } from '../controllers/admin.controller.js';
import { getUsers } from '../controllers/admin.controller.js';
import { getUserById } from '../controllers/admin.controller.js';
import { createSubscriptionPlan, deleteSubscriptionPlan, getSubscriptionPlanById, getSubscriptionPlans, updateSubscriptionPlan } from '../controllers/subscription.controller.js';


router.get('/dashboard', authenticated, authorizeRoles("admin"), getAdminDashboardStats);
// User Management Routes
router.get('/getUsers', authenticated, authorizeRoles("admin"), getUsers);
router.get('/getUserById/:userId', authenticated, authorizeRoles("admin"), getUserById);
router.get('/getStores', authenticated, authorizeRoles("admin"), getStores);

//subscription management
router.post('/createSubscriptionPlan', authenticated, authorizeRoles("admin"), createSubscriptionPlan);
router.get('/getSubscriptionPlanById', authenticated, authorizeRoles("admin","owner"), getSubscriptionPlanById);
router.delete('/deleteSubscriptionPlan', authenticated, authorizeRoles("admin"), deleteSubscriptionPlan);
router.put('/updateSubscriptionPlan', authenticated, authorizeRoles("admin"), updateSubscriptionPlan);
router.get('/getSubscriptionPlanById', authenticated, authorizeRoles("admin"), getSubscriptionPlanById);
router.get('/getSubscriptionPlans', authenticated, authorizeRoles("admin","owner"), getSubscriptionPlans);
router.get('/getBillingUsers', authenticated, authorizeRoles("admin"), getBillingUsers);
router.get('/getTasks', authenticated, authorizeRoles("admin"), getMaintenanceTask);
router.get('/getUserBilling', authenticated, authorizeRoles("admin","owner"), getUserBillingDetails);
router.get('/getAuditLogs', authenticated, authorizeRoles("admin"), getAuditLogs);
router.get('/getUsersActivity/:userId', authenticated, authorizeRoles("admin"), getUsersAuditLogs);
router.get('/get-Users',authenticated,authorizeRoles('admin'),getUsersSelect)
router.post('/override-trial', authenticated, authorizeRoles("admin"), overrideTrialSubscription);
router.get('/get-settings',authenticated,authorizeRoles('admin'),getTechnicianAllowedSetting);
router.put('/platform-settings',authenticated,authorizeRoles('admin'),updateTechnicianAllowedSetting);
export default router;