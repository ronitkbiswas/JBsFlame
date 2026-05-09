/**
 * Firebase Cloud Functions (Node.js) - Source Code
 * Use these functions for secure backend processing of orders and history.
 * Deploy these via Firebase CLI: firebase deploy --only functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

/**
 * Cloud Function to securely fetch order history for the authenticated user.
 * This can be used as a more secure alternative to client-side Firestore queries.
 */
exports.getUserOrderHistory = functions.https.onCall(async (data, context) => {
  // 1. Verify Authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const uid = context.auth.uid;

  try {
    const ordersSnapshot = await db.collection('orders')
      .where('userId', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const orders = [];
    ordersSnapshot.forEach(doc => {
      orders.push({ id: doc.id, ...doc.data() });
    });

    return { orders };
  } catch (error) {
    console.error('Error fetching order history:', error);
    throw new functions.https.HttpsError('internal', 'Unable to fetch order history.');
  }
});

/**
 * Cloud Function to handle order creation and initial processing.
 * Useful for verifying stock, pricing, and triggering notifications.
 */
exports.processIncomingOrder = functions.firestore
  .document('orders/{orderId}')
  .onCreate(async (snapshot, context) => {
    const orderData = snapshot.data();
    const orderId = context.params.orderId;

    console.log(`Processing new order: ${orderId}`);

    // Example logic: Send a notification or update inventory
    // await db.collection('notifications').add({
    //   userId: orderData.userId,
    //   message: `Your order #${orderId.slice(-6)} has been placed!`,
    //   createdAt: admin.firestore.FieldValue.serverTimestamp()
    // });

    return null;
  });
