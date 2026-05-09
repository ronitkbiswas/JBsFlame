import { db, auth } from '../lib/firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  doc,
  updateDoc,
  onSnapshot,
  deleteDoc
} from 'firebase/firestore';
import { SavedAddress, AddressType } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export const AddressService = {
  subscribeToAddresses(callback: (addresses: SavedAddress[]) => void) {
    if (!auth.currentUser) return () => {};

    const addressesRef = collection(db, 'users', auth.currentUser.uid, 'addresses');
    const q = query(addressesRef, orderBy('createdAt', 'desc'));

    let unsubscribe: () => void;
    unsubscribe = onSnapshot(q, (snapshot) => {
      const addresses = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SavedAddress[];
      callback(addresses);
    }, (error) => {
      if (handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser?.uid}/addresses`)) {
        if (unsubscribe) unsubscribe();
      }
    });

    return () => unsubscribe && unsubscribe();
  },

  async saveAddress(data: { 
    lat: number; 
    lng: number; 
    label: string; 
    type: AddressType;
    addressDetails?: string;
    receiverName?: string;
    receiverPhone?: string;
  }) {
    if (!auth.currentUser) return;

    const userId = auth.currentUser.uid;
    const addressesRef = collection(db, 'users', userId, 'addresses');
    
    const payload = {
      userId,
      label: data.label,
      addressText: data.label,
      addressDetails: data.addressDetails || '',
      receiverName: data.receiverName || '',
      receiverPhone: data.receiverPhone || '',
      lat: data.lat,
      lng: data.lng,
      type: data.type,
      updatedAt: serverTimestamp()
    };

    // For Home and Work, we maintain only ONE entry
    if (data.type === 'Home' || data.type === 'Work') {
      const q = query(addressesRef, where('type', '==', data.type));
      const existing = await getDocs(q);
      
      if (!existing.empty) {
        // Update the first one
        const mainDocId = existing.docs[0].id;
        const docRef = doc(db, 'users', userId, 'addresses', mainDocId);
        await updateDoc(docRef, payload);

        // DELIVERANCE: Delete ANY other duplicates of the same type if they exists
        if (existing.docs.length > 1) {
          const deletePromises = existing.docs.slice(1).map(d => deleteDoc(doc(db, 'users', userId, 'addresses', d.id)));
          await Promise.all(deletePromises);
        }
        return;
      }
    } else {
      // For 'Other', check if an address with same label exists to avoid duplicates
      const q = query(addressesRef, where('label', '==', data.label), where('type', '==', 'Other'));
      const existing = await getDocs(q);
      if (!existing.empty) {
        const docRef = doc(db, 'users', userId, 'addresses', existing.docs[0].id);
        return updateDoc(docRef, payload);
      }
    }

    // Create new saved address if no match found
    const newAddress = {
      ...payload,
      userId,
      createdAt: serverTimestamp(),
      isDefault: false,
    };

    return addDoc(addressesRef, newAddress);
  },

  async getSavedAddresses(): Promise<SavedAddress[]> {
    if (!auth.currentUser) return [];

    try {
      const addressesRef = collection(db, 'users', auth.currentUser.uid, 'addresses');
      const q = query(addressesRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SavedAddress[];
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser?.uid}/addresses`);
      return [];
    }
  },

  async deleteAddress(addressId: string) {
    if (!auth.currentUser) return;
    const docRef = doc(db, 'users', auth.currentUser.uid, 'addresses', addressId);
    return deleteDoc(docRef);
  },

  async cleanupDuplicates() {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    const addressesRef = collection(db, 'users', userId, 'addresses');
    
    try {
      // Fetch only Home and Work addresses to check for duplicates
      const q = query(addressesRef, where('type', 'in', ['Home', 'Work']));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) return;

      const typedAddresses: Record<string, string[]> = {
        'Home': [],
        'Work': []
      };

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.type === 'Home' || data.type === 'Work') {
          typedAddresses[data.type].push(doc.id);
        }
      });

      const deletePromises: Promise<void>[] = [];
      Object.keys(typedAddresses).forEach(type => {
        const ids = typedAddresses[type];
        if (ids.length > 1) {
          // Keep the first one, delete rest
          ids.slice(1).forEach(id => {
            deletePromises.push(deleteDoc(doc(db, 'users', userId, 'addresses', id)));
          });
        }
      });

      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${userId}/addresses`);
    }
  }
};
