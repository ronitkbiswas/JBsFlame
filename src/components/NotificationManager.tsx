import React, { useEffect, useRef } from 'react';
import { onSnapshot, query, collection, where, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Order, OrderStatus } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { User } from 'firebase/auth';

interface NotificationManagerProps {
  isAdmin: boolean;
  user: User | null;
}

export default function NotificationManager({ isAdmin, user }: NotificationManagerProps) {
  const previousOrdersRef = useRef<Record<string, OrderStatus>>({});
  const lastNewOrderTimeRef = useRef<number>(Date.now());
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    // Request notification permission and register service worker on mount
    if ('Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('Service Worker registration failed:', err);
      });
    }
  }, []);

  useEffect(() => {
    if (!user) {
      isInitialLoadRef.current = true;
      return;
    }

    let q;
    if (isAdmin) {
      // Admin listens to all recent orders to detect NEW ones
      q = query(
        collection(db, 'orders'),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
    } else {
      // Customer listens to their own orders to detect STATUS changes
      q = query(
        collection(db, 'orders'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const orderData = change.doc.data() as Order;
        const orderId = change.doc.id;

        if (change.type === 'added') {
          // Detect new order for admin
          if (isAdmin && !isInitialLoadRef.current) {
            // Check if it's actually a new order (createdAt matches roughly now)
            const createdAt = orderData.createdAt?.toDate?.()?.getTime?.() || Date.now();
            if (createdAt > lastNewOrderTimeRef.current - 10000) { // 10s grace
              sendNotification(
                'New Order Received! 🍔',
                `Order #${orderId.slice(-6).toUpperCase()} has been placed.`
              );
            }
          }
          // Cache status for future comparison
          previousOrdersRef.current[orderId] = orderData.status;
        }

        if (change.type === 'modified') {
          const oldStatus = previousOrdersRef.current[orderId];
          const newStatus = orderData.status;

          if (oldStatus && oldStatus !== newStatus) {
            // Detect status change for customer
            if (!isAdmin) {
              const messages: Record<string, string> = {
                'Accepted': 'Your order has been accepted!',
                'Preparing': 'Chef is cooking your meal!',
                'Ready': 'Your food is ready for pickup/delivery!',
                'Out for Delivery': 'Out for delivery! Your food is on its way.',
                'Delivered': 'Enjoy your meal! Order delivered.',
                'Cancelled': 'Your order has been cancelled.'
              };
              
              if (messages[newStatus]) {
                sendNotification(
                  `Order #${orderId.slice(-6).toUpperCase()} Update`,
                  messages[newStatus]
                );
              }
            }
          }
          // Update cache
          previousOrdersRef.current[orderId] = newStatus;
        }
      });

      isInitialLoadRef.current = false;
    }, (error) => {
      // Only report error if user is still logged in to avoid reporting transition errors
      if (auth.currentUser) {
        handleFirestoreError(error, OperationType.GET, 'orders_notifications');
      }
    });

    return () => unsubscribe();
  }, [isAdmin, user]);

  const sendNotification = async (title: string, body: string) => {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      try {
        // Try the standard way first
        // We check if Notification is constructible
        try {
          new Notification(title, {
            body,
            icon: '/favicon.ico',
            tag: 'order-update',
            requireInteraction: false
          });
          return;
        } catch (e) {
          // If constructor fails, we fall through to service worker
          console.warn('Notification constructor failed, using fallback:', e);
        }
      } catch (e) {
        console.error('Notification error:', e);
      }

      // Fallback for mobile: service worker notification
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.ready;
          if (registration) {
            registration.showNotification(title, {
              body,
              icon: '/favicon.ico',
              tag: 'order-update'
            });
          }
        } catch (swErr) {
          console.error('Service worker notification failed:', swErr);
        }
      }
    }
  };

  return null; // This component doesn't render anything
}
