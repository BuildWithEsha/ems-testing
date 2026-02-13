const { mysqlPool } = require('../config/database');

// Helper function to create ticket notifications
const createNotification = async (userId, ticketId, type, title, message) => {
  let connection;
  try {
    console.log('Creating notification:', { userId, ticketId, type, title, message });
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
      INSERT INTO ticket_notifications (user_id, ticket_id, notification_type, title, message)
      VALUES (?, ?, ?, ?, ?)
    `;

    const [result] = await connection.execute(query, [userId, ticketId, type, title, message]);
    console.log('Notification inserted with ID:', result.insertId);
  } catch (err) {
    console.error('Error creating notification:', err);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

module.exports = { createNotification };
