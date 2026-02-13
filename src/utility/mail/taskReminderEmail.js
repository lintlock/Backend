import nodemailer from "nodemailer";
import { taskNotificationTemplate } from "./templates/taskReminderTemplate.js";



export const sentTaskReminderEmail = async (to,subject,message,taskURL) => {
    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        }
    });

    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject: subject,
        html : taskNotificationTemplate({
          title: subject,
          message: message,
          taskUrl: taskURL
        })
    }

    await transporter.sendMail(mailOptions);
}