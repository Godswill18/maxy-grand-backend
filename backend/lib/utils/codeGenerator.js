/**
 * Generates a random alphanumeric confirmation code.
 * @param {number} length The desired length of the code.
 * @returns {string} A random code.
 */
export const generateConfirmationCode = (length) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};