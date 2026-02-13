import nodemailer from "nodemailer";
import { inviteEmailTemplate } from "./templates/sendInviteEmailTemplate.js";

export const sendInviteEmail = async (email, inviteUrl, storeName) => {
    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        }
    })

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `Invitation to join ${storeName} as a Technician`,
        html: inviteEmailTemplate(storeName, inviteUrl)
    }

    await transporter.sendMail(mailOptions);
}
