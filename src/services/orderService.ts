import { collection, addDoc, query, where, getDocs, orderBy, serverTimestamp, doc, updateDoc, onSnapshot, getDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Order, OrderStatus } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

/**
 * Service to handle orders. Mimics backend logic for security and data consistency.
 * In production, sensitive status changes or payment verification would happen in Cloud Functions.
 */
export const OrderService = {
  /**
   * Save a new order to Firestore.
   */
  async createOrder(orderData: Omit<Order, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'status' | 'userPhone'>) {
    if (!auth.currentUser) throw new Error('Authentication required');

    // Fetch latest user data for phone number
    const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
    const userData = userDoc.data();

    const orderPayload = {
      ...orderData,
      userId: auth.currentUser.uid,
      userName: userData?.displayName || auth.currentUser.displayName || 'Guest',
      userPhone: userData?.phoneNumber || null,
      status: 'Pending' as OrderStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      const docRef = await addDoc(collection(db, 'orders'), orderPayload);
      return { id: docRef.id, ...orderPayload };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'orders');
      throw error;
    }
  },

  /**
   * Fetch order history for the current user.
   */
  async getOrderHistory() {
    if (!auth.currentUser) throw new Error('Authentication required');

    try {
      const q = query(
        collection(db, 'orders'),
        where('userId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'orders');
      throw error;
    }
  },

  /**
   * Subscribe to orders for the current user.
   */
  subscribeToOrders(callback: (orders: Order[]) => void) {
    if (!auth.currentUser) return () => {};

    const q = query(
      collection(db, 'orders'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      callback(orders);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'orders');
    });
  },

  /**
   * Admin: Subscribe to all orders.
   */
  subscribeToAllOrders(callback: (orders: Order[]) => void) {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      callback(orders);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'orders');
    });
  },

  /**
   * Admin: Update order status.
   */
  async updateOrderStatus(orderId: string, status: OrderStatus) {
    const path = `orders/${orderId}`;
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        status,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
      throw error;
    }
  },

  /**
   * Request cancellation for an order.
   */
  async requestCancellation(orderId: string) {
    const path = `orders/${orderId}`;
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        cancellationRequested: true,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
      throw error;
    }
  },

  /**
   * Admin: Handle cancellation request (Approve/Reject).
   */
  async handleCancellationRequest(orderId: string, approve: boolean) {
    const path = `orders/${orderId}`;
    try {
      const orderRef = doc(db, 'orders', orderId);
      if (approve) {
        await updateDoc(orderRef, {
          status: 'Cancelled',
          cancellationRequested: false, // Reset flag
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(orderRef, {
          cancellationRequested: false, // Just reject the request, don't change status
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
      throw error;
    }
  },

  /**
   * Admin: Fetch all recent orders.
   */
  async getAllOrders() {
    try {
      const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'orders');
      throw error;
    }
  },

  /**
   * Admin: Wipe all orders data.
   */
  async deleteAllOrders() {
    try {
      const q = query(collection(db, 'orders'));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) return;

      const batch = writeBatch(db);
      querySnapshot.docs.forEach((d) => {
        batch.delete(d.ref);
      });
      
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'orders');
      throw error;
    }
  }
};
