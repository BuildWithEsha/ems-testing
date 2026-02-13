// Helper function to get permissions from headers
const getPermissionsFromHeaders = (req) => {
  const userPermissions = req.headers['x-user-permissions'];
  try {
    return JSON.parse(userPermissions);
  } catch (error) {
    console.error('Error parsing user permissions:', error);
    return [];
  }
};

module.exports = { getPermissionsFromHeaders };
