import nodemailer from "nodemailer";

export const sendInvoiceEmail = async ({ to, invoiceUrl, amount, currency, paidAt }) => {
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
        subject: 'Your Payment Invoice',
        html: `
            <div style="font-family: Arial, sans-serif;">
                <h2>Thank you for your payment!</h2>
                <p>We have received your payment of <b>${amount} ${currency?.toUpperCase?.() || ''}</b> on <b>${paidAt ? new Date(paidAt).toLocaleString() : ''}</b>.</p>
                <p>You can view or download your invoice here:</p>
                <a href="${invoiceUrl}" target="_blank">View Invoice</a>
                <br/><br/>
                <p>If you have any questions, please contact our support team.</p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};