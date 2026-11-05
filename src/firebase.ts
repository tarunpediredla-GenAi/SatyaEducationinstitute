import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(
  app,
  firebaseConfig.storageBucket ? `gs://${firebaseConfig.storageBucket}` : undefined
);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export interface UploadedStorageAsset {
  id: string;
  fileName: string;
  storagePath: string;
  downloadUrl: string;
  contentType: string;
  sizeBytes: number;
  uploadedByUid: string;
  createdAt: string;
}

const SUPABASE_FREE_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export async function uploadFileToFirebaseStorage(params: {
  file: File;
  folder: 'protected/courses' | 'protected/books' | 'public/covers' | 'public/previews';
  subPath?: string;
  uploadedByUid: string;
  isAdmin?: boolean;
  onProgress?: (percent: number) => void;
}): Promise<UploadedStorageAsset> {
  const { file, folder, subPath, uploadedByUid, isAdmin, onProgress } = params;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const fullStoragePath = subPath
    ? `${folder}/${subPath}/${timestamp}_${safeName}`
    : `${folder}/${timestamp}_${safeName}`;

  const isProtectedFolder = folder.startsWith('protected/');

  if (isProtectedFolder && file.size > SUPABASE_FREE_MAX_BYTES) {
    throw new Error(
      `File "${file.name}" (${(file.size / (1024 * 1024)).toFixed(
        1
      )} MB) exceeds the 50 MB Supabase Free plan limit. Please split course recordings into 15–25 minute lesson modules or HLS segments under 50 MB each.`
    );
  }

  // For protected course recordings and digital books, upload to the private
  // `protected-media` Supabase Storage bucket via a server-verified signed upload URL
  if (isProtectedFolder && isAdmin && auth.currentUser) {
    try {
      const idToken = await auth.currentUser.getIdToken();
      const signRes = await fetch('/api/admin/storage/signed-upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          objectPath: fullStoragePath,
          fileSizeBytes: file.size,
        }),
      });

      if (signRes.ok) {
        const { signedUploadUrl, objectPath } = (await signRes.json()) as {
          signedUploadUrl: string;
          objectPath: string;
        };

        await new Promise<void>((resolveUpload, rejectUpload) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', signedUploadUrl, true);
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
          xhr.upload.onprogress = (evt) => {
            if (onProgress && evt.lengthComputable && evt.total > 0) {
              onProgress(Math.round((evt.loaded / evt.total) * 100));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolveUpload();
            } else {
              rejectUpload(
                new Error(`Supabase protected-media upload failed (${xhr.status}).`)
              );
            }
          };
          xhr.onerror = () =>
            rejectUpload(new Error('Network error uploading to Supabase protected-media.'));
          xhr.send(file);
        });

        const assetId = `asset_${timestamp}`;
        const assetRecord: UploadedStorageAsset = {
          id: assetId,
          fileName: file.name.slice(0, 250),
          storagePath: objectPath.slice(0, 500),
          downloadUrl: objectPath.slice(0, 2000),
          contentType: (file.type || 'application/octet-stream').slice(0, 120),
          sizeBytes: file.size,
          uploadedByUid,
          createdAt: new Date().toISOString(),
        };

        try {
          await setDoc(doc(db, 'storageAssets', assetId), assetRecord);
        } catch {
          // Metadata write is optional
        }

        return assetRecord;
      }
    } catch (supabaseUploadErr) {
      if (
        supabaseUploadErr instanceof Error &&
        supabaseUploadErr.message.includes('50 MB')
      ) {
        throw supabaseUploadErr;
      }
      // Fall through to Firebase Storage if Supabase signed upload is not reachable in local preview
    }
  }

  const fileRef = storageRef(storage, fullStoragePath);
  const uploadTask = uploadBytesResumable(fileRef, file, {
    contentType: file.type || 'application/octet-stream',
  });

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress && snapshot.totalBytes > 0) {
          const pct = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          onProgress(pct);
        }
      },
      (err) => {
        reject(err);
      },
      async () => {
        try {
          // Never mint public capability download tokens (?token=...) for
          // protected course recordings or digital books; store the canonical storagePath
          // so playback/downloads are always gated by server-side entitlement verification.
          const resolvedUrlOrPath = isProtectedFolder
            ? fullStoragePath
            : await getDownloadURL(uploadTask.snapshot.ref);

          const assetId = `asset_${timestamp}`;
          const assetRecord: UploadedStorageAsset = {
            id: assetId,
            fileName: file.name.slice(0, 250),
            storagePath: fullStoragePath.slice(0, 500),
            downloadUrl: resolvedUrlOrPath.slice(0, 2000),
            contentType: (file.type || 'application/octet-stream').slice(0, 120),
            sizeBytes: file.size,
            uploadedByUid,
            createdAt: new Date().toISOString(),
          };

          if (isAdmin && auth.currentUser) {
            try {
              await setDoc(doc(db, 'storageAssets', assetId), assetRecord);
            } catch {
              // Storage upload succeeded even if Firestore metadata write is skipped
            }
          }

          resolve(assetRecord);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  firebaseSignOut as signOut,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  query,
  where,
  storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  type FirebaseUser,
};
