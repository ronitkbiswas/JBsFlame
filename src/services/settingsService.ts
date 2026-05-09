import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export interface RestaurantLocation {
  lat: number;
  lng: number;
  address?: string;
}

const SETTINGS_COLLECTION = 'settings';
const RESTAURANT_DOC_ID = 'restaurant';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  const jsonError = JSON.stringify(errInfo);
  console.error('Firestore Error: ', jsonError);
  throw new Error(jsonError);
}

export const SettingsService = {
  async getRestaurantLocation(): Promise<RestaurantLocation | null> {
    try {
      const docRef = doc(db, SETTINGS_COLLECTION, RESTAURANT_DOC_ID);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        return data.value as RestaurantLocation;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${SETTINGS_COLLECTION}/${RESTAURANT_DOC_ID}`);
      return null;
    }
  },

  async updateRestaurantLocation(location: RestaurantLocation): Promise<void> {
    try {
      const docRef = doc(db, SETTINGS_COLLECTION, RESTAURANT_DOC_ID);
      await setDoc(docRef, {
        key: 'restaurant_location',
        value: location,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${SETTINGS_COLLECTION}/${RESTAURANT_DOC_ID}`);
    }
  }
};
