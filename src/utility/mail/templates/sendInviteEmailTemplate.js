export const inviteEmailTemplate = (storeName, inviteLink) => {
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>You're Invited</title>
    </head>
    <body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f5f7fa;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
        <tr>
          <td align="center">
            <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.08);overflow:hidden;">
              <tr>
                <td style="padding:24px 28px;text-align:center;background:#1f2933;color:#ffffff;">
                  <h2 style="margin:0;font-size:22px;">You're Invited</h2>
                </td>
              </tr>

              <tr>
                <td style="padding:28px;color:#333333;">
                  <p style="margin:0 0 12px 0;font-size:15px;">
                    You have been invited to join <strong>${storeName}</strong> as a technician.
                  </p>

                  <p style="margin:0 0 20px 0;font-size:14px;color:#555;">
                    Click the button below to accept the invitation and set up your account.
                  </p>

                  <div style="text-align:center;margin:24px 0;">
                    <a
                      href="${inviteLink}"
                      style="
                        display:inline-block;
                        padding:12px 24px;
                        background:#2563eb;
                        color:#ffffff;
                        text-decoration:none;
                        border-radius:6px;
                        font-weight:600;
                        font-size:14px;
                      "
                    >
                      Accept Invitation
                    </a>
                  </div>

                  <p style="margin:0;font-size:12px;color:#777;">
                    This invitation link will expire in 24 hours.
                    If you did not expect this email, you can safely ignore it.
                  </p>
                </td>
              </tr>

              <tr>
                <td style="padding:16px 28px;text-align:center;background:#f1f5f9;font-size:12px;color:#666;">
                  © ${new Date().getFullYear()} ${storeName}. All rights reserved.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
};