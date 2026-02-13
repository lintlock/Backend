export const taskNotificationTemplate = ({
  title,
  message,
  taskUrl,
}) => {
  return `
  <div style="font-family: Arial, sans-serif; background-color: #f6f9fc; padding: 40px;">
    <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 30px; border-radius: 8px;">
      
      <h2 style="color: #111827; margin-bottom: 10px;">
        ${title}
      </h2>

      <p style="color: #374151; font-size: 14px; margin-bottom: 16px;">
        ${message}
      </p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${taskUrl}"
           style="background-color: #2563eb; color: #ffffff; padding: 12px 20px;
                  text-decoration: none; border-radius: 6px; font-weight: bold;">
          View Task
        </a>
      </div>

      <p style="color: #9ca3af; font-size: 12px;">
        Please log in to view more details.
      </p>

    </div>
  </div>
  `;
};
