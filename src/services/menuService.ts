import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MenuItem } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

// Helper to resize and convert image to base64
async function resizeAndConvertToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Max dimensions for menu photos (800px)
        const MAX_SIZE = 800;
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Convert to jpeg with 0.7 quality to keep size small
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const MenuService = {
  /**
   * Get all menu items with real-time updates.
   */
  subscribeToMenu(callback: (items: MenuItem[]) => void) {
    const q = query(collection(db, 'menu_items'), orderBy('category'), orderBy('name'));
    return onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MenuItem[];
      callback(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'menu_items');
    });
  },

  /**
   * Add a new menu item.
   */
  async addMenuItem(item: Omit<MenuItem, 'id' | 'createdAt'>, imageFile?: File) {
    let imageUrl = item.imageUrl;

    try {
      if (imageFile) {
        imageUrl = await resizeAndConvertToBase64(imageFile);
      }

      const docRef = await addDoc(collection(db, 'menu_items'), {
        ...item,
        imageUrl: imageUrl || '',
        createdAt: serverTimestamp(),
      });

      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'menu_items');
      throw error;
    }
  },

  /**
   * Update a menu item.
   */
  async updateMenuItem(itemId: string, updates: Partial<MenuItem>, newImageFile?: File) {
    const path = `menu_items/${itemId}`;
    try {
      let imageUrl = updates.imageUrl;

      if (newImageFile) {
        imageUrl = await resizeAndConvertToBase64(newImageFile);
      }

      const docRef = doc(db, 'menu_items', itemId);
      await updateDoc(docRef, {
        ...updates,
        ...(imageUrl ? { imageUrl } : {}),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
      throw error;
    }
  },

  /**
   * Delete a menu item.
   */
  async deleteMenuItem(itemId: string, imageUrl?: string) {
    const path = `menu_items/${itemId}`;
    try {
      await deleteDoc(doc(db, 'menu_items', itemId));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
      throw error;
    }
  }
};
