import React, { useState, useEffect } from 'react';
import Home from './pages/Home';
import Admin from './pages/Admin';
import { auth, db } from './lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import NotificationManager from './components/NotificationManager';
import { UserProfile } from './types';

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return auth.onAuthStateChanged(async (u) => {
      if (u) {
        // Fetch profile
        try {
          const userDoc = await getDoc(doc(db, 'users', u.uid));
          if (userDoc.exists()) {
            setUserProfile(userDoc.data() as UserProfile);
          } else {
            const newProfile: UserProfile = {
              uid: u.uid,
              email: u.email || '',
              displayName: u.displayName || 'Guest User',
              role: 'customer',
              createdAt: new Date()
            };
            await setDoc(doc(db, 'users', u.uid), newProfile);
            setUserProfile(newProfile);
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }

        const adminEmail = 'ronitkbiswas@gmail.com';
        const isEmailAdmin = u.email === adminEmail;
        setIsAdmin(isEmailAdmin);

        if (isEmailAdmin) {
          import('./lib/seed').then(({ seedMenu }) => seedMenu());
        }
      } else {
        setUserProfile(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });
  }, []);

  const showAdmin = isAdmin;

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white flex-col gap-4">
        <div className="w-16 h-16 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-bold text-gray-500 animate-pulse tracking-widest uppercase">JB's Flame Loading...</p>
      </div>
    );
  }

  return (
    <>
      <NotificationManager isAdmin={isAdmin} user={auth.currentUser} />
      {showAdmin ? <Admin userProfile={userProfile} /> : <Home userProfile={userProfile} />}
    </>
  );
}
