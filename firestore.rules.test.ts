/**
 * Behavioral security rule expectations for Firestore & Storage
 */
export const FIRESTORE_SECURITY_EXPECTATIONS = {
  bootstrappedAdminEmail: 'tarunpediredla9966@gmail.com',
  collections: {
    users: {
      ownerCanGetOwnProfile: true,
      nonAdminCannotListUsers: true,
      nonAdminCannotEscalateRole: true,
    },
    storageAssets: {
      authenticatedCanRead: true,
      onlyAdminCanWrite: true,
    },
  },
};
