import React, { useState, useEffect } from 'react';
import Home from './pages/Home';
import Admin from './pages/Admin';
import { auth, db } from './lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import NotificationManager from './components/NotificationManager';

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return auth.onAuthStateChanged(async (user) => {
      if (user) {
        // Special check for bootstrap admin or checking role
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const isAdminUser = userDoc.exists() && userDoc.data().role === 'admin';
        const isBootstrapAdmin = user.email === 'ronitkbiswas@gmail.com';
        setIsAdmin(isAdminUser || isBootstrapAdmin);
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
  }, []);

  // Simple routing: if URL has ?admin=true or user is admin, show admin panel
  // For demo purposes, we'll allow toggling or checking simple query param
  const urlParams = new URLSearchParams(window.location.search);
  const showAdmin = urlParams.get('admin') === 'true' || isAdmin;

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
      <NotificationManager isAdmin={isAdmin} />
      {showAdmin ? <Admin /> : <Home />}
    </>
  );
}
