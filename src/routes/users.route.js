import express from 'express';
import { registerUser, loginUser, refreshAccessToken, logoutUser, forgotPassword, resetPassword, updateUserData, updatePassword, updateTaskReminders, updateUserProfile } from '../controllers/users.controller.js';
import { authenticated } from '../middlewares/auth.middleware.js';
import { authorizeRoles } from '../middlewares/roles.middleware.js';
import uploadToCloudinary, {  imageFilter } from '../middlewares/upload.middleware.js';

const profileUpload = uploadToCloudinary({ dest: 'uploads/profile', fileFilter: imageFilter, limits: { fileSize: 2 * 1024 * 1024 } });

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/refresh', refreshAccessToken);
router.post( "/update-profile",authenticated,profileUpload.single("profile_picture"),updateUserProfile);
router.post('/logout', authenticated, logoutUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.put('/updateUserData', authenticated, authorizeRoles("owner","admin","technician"), profileUpload.single('profile_picture'), updateUserData);
router.put('/updatePassword', authenticated, authorizeRoles("owner","admin","technician"), updatePassword);
router.put('/updateTaskReminders', authenticated, authorizeRoles("owner","admin","technician"), updateTaskReminders);
export default router;