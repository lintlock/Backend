import nodemailer from "nodemailer";
import { resetPasswordTemplate } from "./templates/sendResetPasswordTemplate.js";



export const sendResetPasswordEmail = async (to, resetLink) => {
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
        subject: 'Reset Your Password',
        html : resetPasswordTemplate(resetLink)
    }

    await transporter.sendMail(mailOptions);
}