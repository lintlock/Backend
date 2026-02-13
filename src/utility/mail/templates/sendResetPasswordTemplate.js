export const resetPasswordTemplate = (resetLink) => {
    return `
    <div style="font-family: Arial, sans-serif; background-color: #f6f9fc; padding: 40px;">
      <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 30px; border-radius: 8px;">
        
        <h2 style="color: #333;">Reset your password</h2>
        
        <p style="color: #555; font-size: 14px;">
          You requested a password reset. Click the button below to set a new password.
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" 
             style="background-color: #2563eb; color: #ffffff; padding: 12px 20px; 
                    text-decoration: none; border-radius: 6px; font-weight: bold;">
            Reset Password
          </a>
        </div>

        <p style="color: #777; font-size: 12px;">
          This link will expire in 15 minutes.
        </p>

        <p style="color: #999; font-size: 12px;">
          If you did not request this, please ignore this email.
        </p>

      </div>
    </div>
    `;
};