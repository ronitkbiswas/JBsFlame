import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export class UserService {
  static async updatePhoneNumber(uid: string, phoneNumber: string) {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      phoneNumber,
      updatedAt: new Date()
    });
  }
}
