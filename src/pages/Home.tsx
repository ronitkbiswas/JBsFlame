import React, { useState, useEffect, useRef } from 'react';
// Tracking Path Added
import { Search, MapPin, History, User, LogOut, Plus, Minus, Star, ArrowRight, X, LayoutDashboard, Bike, Timer, Package, CheckCircle2, AlertCircle, Navigation, Phone, Store, ChefHat, Soup, Check, Settings, ClipboardList, UserCircle, ChevronDown, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MenuItem, CartItem, UserProfile } from '../types';
import { MenuService } from '../services/menuService';
import { formatPrice, cn } from '../lib/utils';
import CartView from '../components/CartView';
import LocationPicker from '../components/LocationPicker';
import { APIProvider, Map as GoogleMap, useMap, AdvancedMarker, useMapsLibrary } from '@vis.gl/react-google-maps';
import { auth, db } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { seedMenu } from '../lib/seed';
import { OrderService } from '../services/orderService';
import { AddressService } from '../services/addressService';
import { UserService } from '../services/userService';
import { SettingsService } from '../services/settingsService';
import { Order, SavedAddress } from '../types';

const DEFAULT_RESTAURANT_LOCATION = { lat: 22.6189, lng: 88.4546 }; // JB's Flame, Hatiara, Kolkata

const getDistanceInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const getEstimatedDeliveryTime = (distance: number, status: string, orderId: string) => {
  if (['Delivered', 'Cancelled', 'Rejected'].includes(status)) return null;

  // Base prep time
  let prepTime = 0;
  if (['Pending', 'Accepted', 'Preparing'].includes(status)) {
    prepTime = 12; // Base prep time
  } else if (status === 'Accepted') {
    prepTime = 15;
  }

  // Deterministic traffic factor based on orderId
  let hash = 0;
  for (let i = 0; i < orderId.length; i++) {
    hash = orderId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const trafficFactor = 1.1 + (Math.abs(hash % 40) / 100); // 1.1 to 1.5 factor

  const travelTime = distance * 5; // 5 mins per KM on average
  const totalTime = Math.round(prepTime + (travelTime * trafficFactor));
  
  return Math.max(12, totalTime);
};

const getItemRating = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const rating = 4 + (Math.abs(hash % 11) / 10); // 4.0 to 5.0
  const count = 50 + Math.abs(hash % 151); // 50 to 200
  const isHighlyReordered = Math.abs(hash % 3) === 0; // 33% chance
  const isBestseller = Math.abs(hash % 5) === 0; // 20% chance
  const reorderLevel = 70 + Math.abs(hash % 26); // 70-95%
  return { rating, count, isHighlyReordered, reorderLevel, isBestseller };
};
const API_KEY =
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  '';

export default function Home() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const clearCart = () => setCart([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
    label: string;
    addressDetails?: string;
    receiverName?: string;
    receiverPhone?: string;
  }>({ lat: 22.5726, lng: 88.3639, label: 'Kolkata, West Bengal' });
  const [hasUserDetectedLocation, setHasUserDetectedLocation] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [restaurantLocation, setRestaurantLocation] = useState(DEFAULT_RESTAURANT_LOCATION);

  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [isTooFarModalOpen, setIsTooFarModalOpen] = useState(false);
  const [showOrderSuccess, setShowOrderSuccess] = useState(false);
  const [isMyProfileOpen, setIsMyProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    seedMenu();
    
    // Fetch dynamic restaurant location
    SettingsService.getRestaurantLocation()
      .then(loc => {
        if (loc) setRestaurantLocation({ lat: loc.lat, lng: loc.lng });
      })
      .catch(err => {
        console.error('Failed to fetch dynamic restaurant location, using default:', err);
      });

    // Attempt auto-location on mount
    if (navigator.geolocation && !hasUserDetectedLocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        // We don't have a reverse geocoder here easily, but we can signal detect intent
        // The LocationPicker will handle the actual address fetching if needed
        // For now, we wait for auth to potentially load saved addresses
      });
    }

    return MenuService.subscribeToMenu(setMenuItems);
  }, []);

  useEffect(() => {
    setIsPhoneModalOpen(user !== null && !user.phoneNumber);
  }, [user]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setUser(userDoc.data() as UserProfile);
        } else {
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || 'Guest User',
            role: 'customer',
            createdAt: new Date()
          };
          await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
          setUser(newProfile);
        }
      } else {
        setUser(null);
        setSavedAddresses([]);
      }
    } catch (error) {
      console.error('Error in onAuthStateChanged:', error);
    }
  });
  return () => unsub();
}, []);

useEffect(() => {
  if (user) {
    // Cleanup duplicates on login
    AddressService.cleanupDuplicates().catch(console.error);

    const unsub = AddressService.subscribeToAddresses((addresses) => {
      setSavedAddresses(addresses);
      if (addresses.length > 0 && !hasUserDetectedLocation) {
        const defaultAddr = addresses.find(a => a.isDefault) || addresses[0];
        setLocation({ 
          lat: defaultAddr.lat, 
          lng: defaultAddr.lng, 
          label: defaultAddr.label,
          addressDetails: defaultAddr.addressDetails,
          receiverName: defaultAddr.receiverName,
          receiverPhone: defaultAddr.receiverPhone
        });
        setHasUserDetectedLocation(true);
      }
    });
    return () => unsub();
  }
}, [user, hasUserDetectedLocation]);

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => {
      return prev.map(i => {
        if (i.id === id) {
          const q = Math.max(0, i.quantity + delta);
          return q === 0 ? null : { ...i, quantity: q };
        }
        return i;
      }).filter(Boolean) as CartItem[];
    });
  };

  const savePhoneNumber = async () => {
    if (!user || !phoneInput.trim()) return;
    setIsSavingPhone(true);
    try {
      await UserService.updatePhoneNumber(user.uid, phoneInput);
      setUser(prev => prev ? { ...prev, phoneNumber: phoneInput } : null);
      setIsPhoneModalOpen(false);
    } catch (error) {
      console.error('Error saving phone number:', error);
      alert('Failed to save phone number.');
    } finally {
      setIsSavingPhone(false);
    }
  };

  const login = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        console.log('Login popup closed or cancelled.');
      } else {
        console.error('Login error:', error);
        alert('Login failed. Please try again.');
      }
    } finally {
      // We keep it true for a bit to prevent immediate re-clicks
      setTimeout(() => setIsLoggingIn(false), 2000);
    }
  };

  const categories = ['All', ...Array.from(new Set(menuItems.map(m => m.category)))];
  const filteredItems = menuItems.filter(item => 
    (activeCategory === 'All' || item.category === activeCategory) &&
    (item.name.toLowerCase().includes(search.toLowerCase()) || 
     item.description.toLowerCase().includes(search.toLowerCase()))
  );

  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [showDirectCancelConfirm, setShowDirectCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRequestingCancellation, setIsRequestingCancellation] = useState(false);
  const [cancellationRequestedSuccess, setCancellationRequestedSuccess] = useState(false);

  const currentTrackingOrder = orders.find(o => o.id === trackingOrderId);
  
  const distanceToRestaurant = currentTrackingOrder ? getDistanceInKm(
    restaurantLocation.lat,
    restaurantLocation.lng,
    currentTrackingOrder.address.lat,
    currentTrackingOrder.address.lng
  ) : 0;

  const handleCancelClick = () => {
    if (currentTrackingOrder?.status === 'Pending') {
      setShowDirectCancelConfirm(true);
    } else {
      setIsCancelModalOpen(true);
    }
  };

  const confirmCancellation = async () => {
    if (!currentTrackingOrder) return;
    setIsCancelling(true);
    try {
      await OrderService.updateOrderStatus(currentTrackingOrder.id, 'Cancelled');
      setTrackingOrderId(null);
      setShowDirectCancelConfirm(false);
    } catch (error) {
      console.error('Error cancelling order:', error);
    } finally {
      setIsCancelling(false);
    }
  };

  const requestCancellation = async () => {
    if (!currentTrackingOrder) return;
    setIsRequestingCancellation(true);
    try {
      await OrderService.requestCancellation(currentTrackingOrder.id);
      setCancellationRequestedSuccess(true);
      setTimeout(() => {
        setIsCancelModalOpen(false);
        setCancellationRequestedSuccess(false);
      }, 2000);
    } catch (error) {
      console.error('Error requesting cancellation:', error);
    } finally {
      setIsRequestingCancellation(false);
    }
  };

  useEffect(() => {
    if (user) {
      return OrderService.subscribeToOrders(setOrders);
    }
  }, [user]);

  useEffect(() => {
    if (user && isOrderHistoryOpen) {
      setOrderHistory(orders);
    }
  }, [user, isOrderHistoryOpen, orders]);

  const formatOrderDate = (date: any) => {
    if (!date) return '';
    const d = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + 
           ', ' + 
           d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const headerDeliveryTime = (!user || !hasUserDetectedLocation) 
    ? 29 
    : Math.max(8, Math.round(12 + (getDistanceInKm(
        restaurantLocation.lat, 
        restaurantLocation.lng, 
        location.lat, 
        location.lng
      ) * 5)));

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white px-4 pt-6 pb-4 sticky top-0 z-30 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col cursor-pointer" onClick={() => setIsLocationOpen(true)}>
            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none mb-1 flex items-center gap-1.5">
              <Zap className="w-5 h-5 fill-emerald-500 text-emerald-500" />
              <span>Delivery in <span className="text-emerald-600">{headerDeliveryTime} mins</span></span>
            </h1>
            <div className="flex items-center gap-1">
              <p className="text-sm font-medium text-gray-600 truncate max-w-[220px]">
                {location.label}
              </p>
              <ChevronDown className="w-4 h-4 text-gray-900" />
            </div>
          </div>
          <div className="flex items-center gap-3">
             {user ? (
               <div className="flex items-center gap-3">
                  <div className="relative">
                    <img 
                      src={auth.currentUser?.photoURL || undefined} 
                      alt="User" 
                      className="w-9 h-9 rounded-full border-2 border-rose-100 cursor-pointer active:scale-95 transition-transform" 
                      referrerPolicy="no-referrer" 
                      onClick={() => setIsProfileOpen(!isProfileOpen)}
                    />
                    
                    <AnimatePresence>
                      {isProfileOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsProfileOpen(false)} />
                          <motion.div 
                            initial={{opacity: 0, y: 10, scale: 0.95}}
                            animate={{opacity: 1, y: 0, scale: 1}}
                            exit={{opacity: 0, y: 10, scale: 0.95}}
                            className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden"
                          >
                            <div className="p-4 border-b bg-gray-50/50">
                              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Account</p>
                              <p className="text-sm font-bold text-gray-900 truncate">{user.displayName}</p>
                            </div>
                            <div className="p-2">
                              {user.role === 'admin' && (
                                <button 
                                  onClick={() => {
                                    window.location.href = '/?admin=true';
                                    setIsProfileOpen(false);
                                  }}
                                  className="w-full flex items-center gap-3 p-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
                                >
                                  <LayoutDashboard className="w-4 h-4 text-gray-400" />
                                  Admin Panel
                                </button>
                              )}
                              <button 
                                onClick={() => {
                                  setIsMyProfileOpen(true);
                                  setIsProfileOpen(false);
                                }}
                                className="w-full flex items-center gap-3 p-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
                              >
                                <UserCircle className="w-4 h-4 text-gray-400" />
                                My Profile
                              </button>
                               <button 
                                onClick={() => {
                                  setIsLocationOpen(true);
                                  setIsProfileOpen(false);
                                }}
                                className="w-full flex items-center gap-3 p-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
                              >
                                <MapPin className="w-4 h-4 text-gray-400" />
                                Saved Address
                              </button>
                              <button 
                                onClick={() => {
                                  setIsOrderHistoryOpen(true);
                                  setIsProfileOpen(false);
                                }}
                                className="w-full flex items-center gap-3 p-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
                              >
                                <ClipboardList className="w-4 h-4 text-gray-400" />
                                My Orders
                              </button>
                              <button 
                                onClick={() => {
                                  setIsSettingsOpen(true);
                                  setIsProfileOpen(false);
                                }}
                                className="w-full flex items-center gap-3 p-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
                              >
                                <Settings className="w-4 h-4 text-gray-400" />
                                Settings
                              </button>
                              <button 
                                onClick={() => {
                                  signOut(auth);
                                  setIsProfileOpen(false);
                                }}
                                className="w-full flex items-center gap-3 p-2.5 text-sm font-bold text-rose-500 hover:bg-rose-50 rounded-xl transition-colors border-t mt-1 pt-3"
                              >
                                <LogOut className="w-4 h-4" />
                                Logout
                              </button>
                            </div>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
               </div>
             ) : (
               <button onClick={login} className="text-sm font-bold text-rose-500">Log In</button>
             )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-4">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search className="w-5 h-5 text-gray-400" />
          </div>
          <input 
            type="text" 
            placeholder="Search for 'Biryani' or 'Starters'..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-100 border-none rounded-xl py-3 pl-10 pr-4 text-sm font-medium focus:ring-2 focus:ring-rose-500"
          />
        </div>

        {/* Categories */}
        <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-4 py-1.5 rounded-lg border text-xs font-bold whitespace-nowrap transition-all",
                activeCategory === cat 
                  ? "bg-rose-50 border-rose-500 text-rose-600 shadow-sm" 
                  : "bg-white border-gray-200 text-gray-600"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      {/* Menu List */}
      <main className="px-4 py-6 space-y-8">
        {categories.filter(c => c !== 'All').map(category => {
          const items = filteredItems.filter(i => i.category === category);
          if (items.length === 0) return null;
          
          return (
            <section key={category}>
              <h2 className="text-lg font-black text-gray-900 mb-4 tracking-tight flex items-center justify-between">
                {category}
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-2 py-0.5 rounded">{items.length} Items</span>
              </h2>
              <div className="grid grid-cols-1 gap-6">
                {items.map(item => {
                  const cartItem = cart.find(i => i.id === item.id);
                  return (
                    <motion.div 
                      key={item.id}
                      layout
                      className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex justify-between gap-4 relative overflow-hidden h-[180px]"
                    >
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-3 h-3 border-2 flex items-center justify-center p-0.5", item.category === 'Starters' ? 'border-emerald-600' : 'border-rose-600')}>
                            <div className={cn("w-full h-full rounded-full", item.category === 'Starters' ? 'bg-emerald-600' : 'bg-rose-600')} />
                          </div>
                          {(() => {
                            const { isBestseller } = getItemRating(item.id);
                            return isBestseller ? (
                              <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest bg-rose-50 px-1.5 rounded">Bestseller</span>
                            ) : null;
                          })()}
                        </div>
                        <h3 className="font-bold text-gray-900 leading-tight">{item.name}</h3>
                        <div className="space-y-0.5">
                          {(() => {
                            const { rating, count, isHighlyReordered, reorderLevel } = getItemRating(item.id);
                            return (
                              <>
                                {isHighlyReordered && (
                                  <div className="flex items-center gap-2 mb-1">
                                    <div className="w-8 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-emerald-500 rounded-full" 
                                        style={{ width: `${reorderLevel}%` }}
                                      />
                                    </div>
                                    <span className="text-[10px] font-bold text-emerald-600">Highly reordered</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1">
                                  <div className="flex">
                                    {[1, 2, 3, 4, 5].map(s => (
                                      <Star 
                                        key={s} 
                                        className={cn(
                                          "w-2.5 h-2.5",
                                          s <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-200"
                                        )} 
                                      />
                                    ))}
                                  </div>
                                  <span className="text-[10px] font-bold text-gray-500">({count}+)</span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                        <p className="text-sm font-black text-gray-800">{formatPrice(item.price)}</p>
                        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{item.description}</p>
                      </div>

                      <div className="relative flex flex-col items-center shrink-0">
                        <div className="w-28 h-28 rounded-2xl overflow-hidden border relative">
                           <img 
                             src={item.imageUrl || 'https://picsum.photos/seed/food/200/200'} 
                             alt={item.name} 
                             className="w-full h-full object-cover"
                             referrerPolicy="no-referrer"
                           />
                        </div>
                        
                        <div className="absolute top-[88px] z-10 w-28">
                           {cartItem ? (
                             <div className="bg-white text-rose-600 font-bold border-2 border-rose-50 rounded-xl shadow-xl flex items-center overflow-hidden w-full justify-between h-10">
                               <button 
                                 onClick={() => updateQuantity(item.id, -1)}
                                 className="p-1 px-2 hover:bg-rose-50 transition-colors h-full flex items-center"
                               >
                                 <Minus className="w-3 h-3 stroke-[4]" />
                               </button>
                               <span className="text-sm font-black">{cartItem.quantity}</span>
                               <button 
                                 onClick={() => updateQuantity(item.id, 1)}
                                 className="p-1 px-2 hover:bg-rose-50 transition-colors h-full flex items-center"
                               >
                                 <Plus className="w-3 h-3 stroke-[4]" />
                               </button>
                             </div>
                           ) : (
                             <button 
                              onClick={() => addToCart(item)}
                              className="w-full bg-white text-rose-500 font-black border-2 border-rose-100 h-10 rounded-xl shadow-xl active:scale-95 transition-all text-sm flex items-center justify-between px-3"
                             >
                               <span className="flex-1 text-center ml-2">ADD</span>
                               <Plus className="w-3.5 h-3.5 stroke-[4] text-rose-400" />
                             </button>
                           )}
                           <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest text-center mt-2.5">customisable</p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>

      {/* Modals & Cart */}
      <LocationPicker 
        isOpen={isLocationOpen} 
        onClose={() => setIsLocationOpen(false)} 
        initialLocation={location}
        onLocationSelect={(loc) => {
          setLocation(loc);
          setHasUserDetectedLocation(true);
        }}
        savedAddresses={savedAddresses}
        currentUser={user}
      />
      
      {/* Zepto-inspired Active Order Footer */}
      <AnimatePresence>
        {(() => {
          const activeOrder = orders.find(o => !['Delivered', 'Cancelled', 'Rejected'].includes(o.status));
          if (!activeOrder || isCartOpen) return null;

          const getStatusConfig = (status: string) => {
            switch (status) {
              case 'Pending': return { label: 'Order Placed', icon: Timer, sub: 'Waiting for restaurant' };
              case 'Accepted': return { label: 'Order Accepted', icon: CheckCircle2, sub: 'Restaurant is confirmng' };
              case 'Preparing': return { label: 'Preparing', icon: ChefHat, sub: 'Chef is cooking your meal' };
              case 'Ready': return { label: 'Ready for Pickup', icon: Package, sub: 'Your order is ready to go' };
              case 'Out for Delivery': return { label: 'Out for Delivery', icon: Bike, sub: 'Rider is on the way' };
              default: return { label: status, icon: Timer, sub: 'Processing...' };
            }
          };

          const config = getStatusConfig(activeOrder.status);
          const StatusIcon = config.icon;

          return (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-6 left-4 right-4 z-40"
            >
              <button 
                onClick={() => setTrackingOrderId(activeOrder.id)}
                className="w-full bg-[#1AAB4F] text-white p-3.5 rounded-2xl shadow-2xl flex items-center justify-between border border-white/20 active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <StatusIcon className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80 leading-none mb-1">Active Order</p>
                    <p className="text-sm font-bold leading-tight">{config.label}</p>
                    <p className="text-[10px] opacity-70 leading-tight">{config.sub}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pr-1">
                  <span className="text-[10px] font-bold bg-white/20 px-2 py-1 rounded-lg">TRACK</span>
                  <ArrowRight className="w-4 h-4 opacity-80" />
                </div>
              </button>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <CartView 
        items={cart} 
        isOpen={isCartOpen} 
        setIsOpen={setIsCartOpen}
        onUpdateQuantity={updateQuantity}
        onClearCart={clearCart}
        deliveryAddress={location.label}
        hasActiveOrder={orders.some(o => !['Delivered', 'Cancelled', 'Rejected'].includes(o.status))}
        onCheckout={async () => {
            const activeOrder = orders.find(o => 
              !['Delivered', 'Cancelled', 'Rejected'].includes(o.status)
            );

            if (activeOrder) {
              alert('You already have an active order. Please wait for it to be delivered before placing a new one.');
              return;
            }

            const distance = getDistanceInKm(
              restaurantLocation.lat,
              restaurantLocation.lng,
              location.lat,
              location.lng
            );

            if (distance > 10) {
              setIsTooFarModalOpen(true);
              return;
            }

            try {
              await OrderService.createOrder({
                items: cart,
                total: cart.reduce((s, i) => s + (i.price * i.quantity), 0) + 40 + (cart.reduce((s, i) => s + (i.price * i.quantity), 0) * 0.05),
                address: location
              });
              setShowOrderSuccess(true);
              setCart([]);
              setIsCartOpen(false);
              setTimeout(() => setShowOrderSuccess(false), 3000);
            } catch (e) {
              alert('Checkout failed. Please log in.');
              console.error(e);
            }
        }}
      />

      {/* Too Far Modal */}
      <AnimatePresence>
        {isTooFarModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
              onClick={() => setIsTooFarModalOpen(false)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[32px] w-full max-w-sm p-8 relative z-10 text-center shadow-2xl"
            >
              <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-10 h-10 text-rose-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Service Unavailable</h2>
              <p className="text-gray-500 leading-relaxed font-medium mb-8">
                Your location is too far away. Currently we are not taking long distance delivery orders.
              </p>
              <button 
                onClick={() => setIsTooFarModalOpen(false)}
                className="w-full bg-gray-900 text-white rounded-2xl py-4 font-bold text-lg hover:bg-gray-800 transition-colors shadow-lg active:scale-95"
              >
                Got it
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Order History Modal */}
      <AnimatePresence>
        {isOrderHistoryOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/60" onClick={() => setIsOrderHistoryOpen(false)} />
            <motion.div 
              initial={{y: '100%'}}
              animate={{y: 0}}
              exit={{y: '100%'}}
              className="bg-white rounded-[32px] w-full max-w-lg h-[80vh] overflow-hidden relative z-10 flex flex-col"
            >
               <div className="p-6 border-b flex items-center justify-between">
                 <h2 className="text-xl font-bold">My Orders</h2>
                 <button onClick={() => setIsOrderHistoryOpen(false)} className="p-2 bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
               </div>
               <div className="flex-1 overflow-y-auto p-4 space-y-6">
                 {orderHistory.length === 0 ? (
                   <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                      <History className="w-16 h-16" />
                      <p className="font-bold">No orders yet</p>
                   </div>
                 ) : (
                   <>
                     {/* Active Orders */}
                     {(() => {
                       const activeOrders = orderHistory.filter(o => !['Delivered', 'Cancelled', 'Rejected'].includes(o.status));
                       if (activeOrders.length === 0) return null;
                       return (
                         <div className="space-y-4">
                           <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-widest px-1">Active Orders</h3>
                           {activeOrders.map(order => (
                             <div 
                               key={order.id} 
                               onClick={() => {
                                 setTrackingOrderId(order.id);
                                 setIsOrderHistoryOpen(false);
                               }}
                               className="bg-rose-50/30 border border-rose-100 rounded-2xl p-4 space-y-3 relative overflow-hidden cursor-pointer hover:bg-rose-50/50 transition-colors group"
                             >
                                <div className="absolute top-0 right-0 p-2">
                                   <div className="flex flex-col items-end">
                                     <span className="text-[10px] font-bold px-2 py-1 rounded bg-rose-500 text-white shadow-sm uppercase mb-1">{order.status === 'Pending' ? 'Order Placed' : order.status}</span>
                                   </div>
                                </div>
                                <div className="pr-20">
                                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">#{order.id.slice(-6)}</p>
                                  <p className="text-xs font-medium text-gray-600 line-clamp-2">{order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</p>
                                </div>
                                <div className="flex justify-between items-center pt-3 border-t border-rose-100">
                                  <p className="text-sm font-black text-gray-900">{formatPrice(order.total)}</p>
                                  <p className="text-[10px] text-gray-400 font-bold">{formatOrderDate(order.createdAt)}</p>
                                </div>
                                <div className="w-full mt-2 py-1.5 flex items-center justify-center gap-1.5 text-rose-600 text-[10px] font-black uppercase tracking-widest opacity-60 group-hover:opacity-100 transition-opacity">
                                  View Details <ArrowRight className="w-3 h-3" />
                                </div>
                             </div>
                           ))}
                         </div>
                       );
                     })()}

                     {/* Past Orders */}
                     {(() => {
                       const pastOrders = orderHistory.filter(o => ['Delivered', 'Cancelled', 'Rejected'].includes(o.status));
                       if (pastOrders.length === 0) return null;
                       return (
                         <div className="space-y-4">
                           <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Past Orders</h3>
                           {pastOrders.map(order => (
                             <div 
                               key={order.id} 
                               onClick={() => {
                                 setTrackingOrderId(order.id);
                                 setIsOrderHistoryOpen(false);
                               }}
                               className="border border-gray-100 rounded-2xl p-4 space-y-3 bg-white cursor-pointer hover:bg-gray-50 transition-colors group"
                             >
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">#{order.id.slice(-6)}</p>
                                    <p className="text-xs font-medium text-gray-500 line-clamp-1">{order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</p>
                                  </div>
                                  <div className="flex flex-col items-end">
                                    <span className={cn(
                                      "text-[10px] font-bold px-2 py-1 rounded uppercase mb-1",
                                      order.status === 'Delivered' ? 'bg-green-50 text-green-600' : 
                                      order.status === 'Cancelled' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'
                                    )}>{order.status}</span>
                                  </div>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                                  <p className="text-sm font-black text-gray-800">{formatPrice(order.total)}</p>
                                  <p className="text-[10px] text-gray-400 font-bold">{formatOrderDate(order.createdAt)}</p>
                                </div>
                             </div>
                           ))}
                         </div>
                       );
                     })()}
                   </>
                 )}
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showOrderSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-emerald-500"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 12, stiffness: 200 }}
              className="text-center"
            >
              <div className="relative mb-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 10 }}
                  className="w-32 h-32 bg-white rounded-full flex items-center justify-center mx-auto shadow-2xl"
                >
                  <motion.div
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                  >
                    <Check className="w-16 h-16 text-emerald-500 stroke-[4]" />
                  </motion.div>
                </motion.div>
                
                {/* Decorative circles */}
                <motion.div
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 border-4 border-white/30 rounded-full"
                />
              </div>
              <motion.h2
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-white text-4xl font-black italic tracking-tight"
              >
                ORDER PLACED!
              </motion.h2>
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-white/80 font-bold mt-2 uppercase tracking-widest text-sm"
              >
                Preparing your delicious meal
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* My Profile Modal */}
      <AnimatePresence>
        {isMyProfileOpen && user && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{opacity:0}} 
              animate={{opacity:1}} 
              exit={{opacity:0}} 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
              onClick={() => setIsMyProfileOpen(false)} 
            />
            <motion.div 
              initial={{scale: 0.9, opacity: 0, y: 20}}
              animate={{scale: 1, opacity: 1, y: 0}}
              exit={{scale: 0.9, opacity: 0, y: 20}}
              className="bg-white rounded-[32px] w-full max-w-sm overflow-hidden relative z-10 shadow-2xl"
            >
               <div className="p-8">
                 <div className="flex justify-between items-start mb-6">
                   <h2 className="text-2xl font-black text-gray-900 tracking-tight">My Profile</h2>
                   <button onClick={() => setIsMyProfileOpen(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                     <X className="w-5 h-5 text-gray-500" />
                   </button>
                 </div>

                 <div className="flex flex-col items-center mb-8">
                    <div className="relative">
                      <img 
                        src={auth.currentUser?.photoURL || undefined} 
                        alt={user.displayName} 
                        className="w-24 h-24 rounded-full border-4 border-rose-50 shadow-xl"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute -bottom-1 -right-1 bg-white p-1.5 rounded-full shadow-lg border border-gray-100">
                        <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                      </div>
                    </div>
                    <h3 className="mt-4 text-xl font-bold text-gray-900">{user.displayName}</h3>
                    <p className="text-xs font-bold text-rose-500 uppercase tracking-widest mt-1 bg-rose-50 px-3 py-1 rounded-full">{user.role}</p>
                 </div>

                 <div className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Email Address</p>
                      <p className="font-bold text-gray-700 truncate">{user.email}</p>
                    </div>
                    
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Phone Number</p>
                      <p className="font-bold text-gray-700">{user.phoneNumber || 'Not provided'}</p>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">User ID</p>
                      <p className="font-mono text-[10px] text-gray-400 break-all">{user.uid}</p>
                    </div>
                 </div>

                 <button 
                  onClick={() => setIsMyProfileOpen(false)}
                  className="w-full mt-8 bg-gray-900 text-white font-black py-4 rounded-2xl active:scale-[0.98] transition-transform shadow-lg shadow-gray-200"
                 >
                   Close Profile
                 </button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsSettingsOpen(false)} />
            <motion.div 
              initial={{scale: 0.9, opacity: 0}}
              animate={{scale: 1, opacity: 1}}
              exit={{scale: 0.9, opacity: 0}}
              className="bg-white rounded-[32px] w-full max-w-sm overflow-hidden relative z-10 shadow-2xl"
            >
               <div className="p-8">
                 <div className="flex justify-between items-start mb-6">
                   <h2 className="text-2xl font-black text-gray-900 tracking-tight">Settings</h2>
                   <button onClick={() => setIsSettingsOpen(false)} className="p-2 bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
                 </div>

                 <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-gray-100 shadow-sm">
                            <CheckCircle2 className="w-5 h-5 text-gray-400" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">Notifications</p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Order Updates</p>
                          </div>
                       </div>
                       <div className="w-12 h-6 bg-rose-500 rounded-full relative">
                          <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                       </div>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 grayscale opacity-50">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-gray-100 shadow-sm">
                            <Star className="w-5 h-5 text-gray-400" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">Dark Mode</p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Coming Soon</p>
                          </div>
                       </div>
                       <div className="w-12 h-6 bg-gray-200 rounded-full relative">
                          <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                       </div>
                    </div>
                 </div>

                 <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="w-full mt-8 bg-gray-900 text-white font-black py-4 rounded-2xl"
                 >
                   Save Preferences
                 </button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Tracking Order Modal */}
      <AnimatePresence>
        {currentTrackingOrder && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setTrackingOrderId(null)} />
            <motion.div 
              initial={{scale: 0.9, opacity: 0}}
              animate={{scale: 1, opacity: 1}}
              exit={{scale: 0.9, opacity: 0}}
              className="bg-white rounded-[32px] w-full max-w-sm max-h-[85vh] overflow-hidden relative z-10 shadow-2xl flex flex-col"
            >
               <div className="flex-1 overflow-y-auto no-scrollbar p-5 text-center space-y-5">
                 {/* Map Section for Active Orders */}
                 {['Accepted', 'Preparing', 'Ready', 'Out for Delivery'].includes(currentTrackingOrder.status) && (
                   <div className="space-y-4 mb-2">
                     <div className="flex justify-center">
                        <div className="bg-rose-50 px-4 py-2 rounded-full border border-rose-100/50 flex items-center gap-2 shadow-sm">
                           <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                           <span className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-600">Live Updates</span>
                        </div>
                     </div>
                     <div className="h-48 w-full bg-gray-100 rounded-[32px] overflow-hidden relative border border-gray-100 shadow-inner">
                       <APIProvider apiKey={API_KEY}>
                         <GoogleMap
                           defaultCenter={restaurantLocation}
                           defaultZoom={13}
                           mapId="order_tracking_map_enhanced"
                            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                           disableDefaultUI={true}
                           gestureHandling="none"
                           style={{ width: '100%', height: '100%' }}
                         >
                           <AdvancedMarker position={restaurantLocation}>
                              <div className="relative group">
                                <div className="w-10 h-10 bg-rose-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white ring-4 ring-rose-500/20">
                                  <Store className="w-5 h-5 text-white" />
                                </div>
                                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-white px-2 py-0.5 rounded shadow text-[8px] font-black uppercase whitespace-nowrap">Restaurant</div>
                              </div>
                           </AdvancedMarker>

                           <AdvancedMarker position={{ lat: currentTrackingOrder.address.lat, lng: currentTrackingOrder.address.lng }}>
                              <div className="relative group">
                                <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white ring-4 ring-red-500/20">
                                  <MapPin className="w-5 h-5 text-white" />
                                </div>
                                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-white px-2 py-0.5 rounded shadow text-[8px] font-black uppercase whitespace-nowrap">You</div>
                              </div>
                           </AdvancedMarker>

                           <DeliveryRoute origin={restaurantLocation} destination={{ lat: currentTrackingOrder.address.lat, lng: currentTrackingOrder.address.lng }} />
                            <MapBoundsAdjuster 
                             pos1={restaurantLocation} 
                             pos2={{ lat: currentTrackingOrder.address.lat, lng: currentTrackingOrder.address.lng }} 
                           />
                         </GoogleMap>
                       </APIProvider>
                     </div>
                   </div>
                 )}

                 <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-2">
                    {(() => {
                      const status = currentTrackingOrder.status;
                      if (status === 'Pending') return <Timer className="w-8 h-8" />;
                      if (status === 'Accepted') return <CheckCircle2 className="w-8 h-8" />;
                      if (status === 'Preparing') return <ChefHat className="w-8 h-8" />;
                      if (status === 'Out for Delivery') return <Bike className="w-8 h-8" />;
                      return <Timer className="w-8 h-8" />;
                    })()}
                 </div>
                 
                 <div>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Order #{currentTrackingOrder.id.slice(-6).toUpperCase()} • {formatOrderDate(currentTrackingOrder.createdAt)}</p>
                   <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                     {currentTrackingOrder.status === 'Pending' ? 'Order Placed' : 
                      currentTrackingOrder.status === 'Accepted' ? 'Confirmed' :
                      currentTrackingOrder.status === 'Preparing' ? 'In Kitchen' :
                      currentTrackingOrder.status === 'Out for Delivery' ? 'Out for delivery' : 
                      currentTrackingOrder.status === 'Delivered' ? 'Delivered' :
                      currentTrackingOrder.status === 'Cancelled' ? 'Cancelled' :
                      currentTrackingOrder.status === 'Rejected' ? 'Rejected' : currentTrackingOrder.status}
                   </h2>
                   <p className="text-sm text-gray-500 font-medium">
                     {currentTrackingOrder.status === 'Pending' && 'We are waiting for the restaurant to confirm.'}
                     {currentTrackingOrder.status === 'Accepted' && 'Restaurant has confirmed your order.'}
                     {currentTrackingOrder.status === 'Preparing' && 'Your food is being prepared with love.'}
                     {currentTrackingOrder.status === 'Out for Delivery' && 'Our rider is bringing your food hot!'}
                     {currentTrackingOrder.status === 'Delivered' && 'Hope you enjoyed your meal!'}
                     {currentTrackingOrder.status === 'Cancelled' && 'This order was cancelled.'}
                     {currentTrackingOrder.status === 'Rejected' && 'The restaurant could not fulfill this order.'}
                   </p>
                 </div>

                 {currentTrackingOrder.status === 'Out for Delivery' && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-[24px] p-5 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-4 text-left">
                        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg rotate-3">
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                            className="flex items-center justify-center"
                          >
                            <Timer className="w-6 h-6" />
                          </motion.div>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none mb-1">Est. Arrival</p>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-emerald-600 leading-none">
                              {getEstimatedDeliveryTime(distanceToRestaurant, currentTrackingOrder.status, currentTrackingOrder.id)}
                            </span>
                            <span className="text-xs font-black text-emerald-500 uppercase tracking-tight">mins</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right pr-2">
                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none mb-1">Distance</p>
                        <p className="text-sm font-black text-emerald-600">{distanceToRestaurant.toFixed(1)} km</p>
                      </div>
                    </div>
                  )}

                  {currentTrackingOrder.status === 'Out for Delivery' && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-emerald-50/50 border border-emerald-100/50 rounded-2xl p-4 text-left"
                    >
                      <p className="text-xs font-bold text-emerald-700 leading-relaxed">
                        Our delivery partner is on the way and will call you after reaching your location. Keep your phone nearby.
                      </p>
                    </motion.div>
                  )}

                 <div className="bg-gray-50 rounded-2xl p-4 text-left space-y-2">
                   <div className="flex justify-between items-start">
                     <div className="flex-1">
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Delivery To</p>
                       <p className="text-sm font-bold text-gray-800 line-clamp-1">{currentTrackingOrder.address.label}</p>
                     </div>
                   </div>
                   <div className="pt-2 border-t border-gray-200">
                     <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Items</p>
                     <div className="space-y-1">
                       {currentTrackingOrder.items.map((item, idx) => (
                         <div key={idx} className="flex justify-between text-sm">
                           <span className="text-gray-600 font-medium">{item.quantity}x {item.name}</span>
                           <span className="text-gray-900 font-bold">{formatPrice(item.price * item.quantity)}</span>
                         </div>
                       ))}
                     </div>
                     <div className="pt-2 mt-2 border-t border-dashed flex justify-between items-center text-rose-600">
                        <span className="font-bold">Total Bill</span>
                        <span className="text-lg font-black">{formatPrice(currentTrackingOrder.total)}</span>
                     </div>
                   </div>
                 </div>

                 <button 
                  onClick={() => setTrackingOrderId(null)}
                  className="w-full bg-gray-900 text-white font-black py-4 rounded-2xl active:scale-[0.98] transition-transform shadow-lg shadow-gray-200"
                 >
                   Okay
                 </button>

                 {!['Delivered', 'Cancelled', 'Rejected'].includes(currentTrackingOrder.status) && (
                   <button 
                     onClick={handleCancelClick}
                     className="text-xs font-bold text-gray-400 hover:text-rose-500 transition-colors"
                   >
                     Cancel Order?
                   </button>
                 )}
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

       {/* Direct Cancellation Confirmation Modal */}
      <AnimatePresence>
        {showDirectCancelConfirm && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isCancelling && setShowDirectCancelConfirm(false)} />
            <motion.div 
              initial={{scale: 0.9, opacity: 0}}
              animate={{scale: 1, opacity: 1}}
              exit={{scale: 0.9, opacity: 0}}
              className="bg-white rounded-[32px] w-full max-w-sm overflow-hidden relative z-10 shadow-2xl"
            >
               <div className="p-8 text-center space-y-6">
                 <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
                    <AlertCircle className="w-10 h-10" />
                 </div>
                 
                 <div className="space-y-2">
                   <h2 className="text-xl font-black text-gray-900 leading-tight">Are you sure?</h2>
                   <p className="text-sm text-gray-500 font-medium leading-relaxed px-4">
                     This will cancel your order.
                   </p>
                 </div>

                 <div className="pt-2 flex flex-col gap-3">
                   <button 
                    onClick={confirmCancellation}
                    disabled={isCancelling}
                    className="w-full bg-rose-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-rose-100 active:scale-[0.98] transition-transform disabled:opacity-50"
                   >
                     {isCancelling ? 'Cancelling...' : 'YES, Cancel Order'}
                   </button>
                   <button 
                    onClick={() => setShowDirectCancelConfirm(false)}
                    disabled={isCancelling}
                    className="w-full bg-gray-100 text-gray-600 font-bold py-4 rounded-2xl active:scale-[0.98] transition-transform"
                   >
                     NO, Keep Order
                   </button>
                 </div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cancellation Request Modal (For Non-Pending) */}
      <AnimatePresence>
        {isCancelModalOpen && currentTrackingOrder && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsCancelModalOpen(false)} />
            <motion.div 
              initial={{scale: 0.9, opacity: 0}}
              animate={{scale: 1, opacity: 1}}
              exit={{scale: 0.9, opacity: 0}}
              className="bg-white rounded-[32px] w-full max-w-sm overflow-hidden relative z-10 shadow-2xl"
            >
               <div className="p-8 text-center space-y-6">
                 <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
                    <AlertCircle className="w-10 h-10" />
                 </div>
                 
                 <div className="space-y-2">
                   <h2 className="text-xl font-black text-gray-900 leading-tight">We're sorry to see you go!</h2>
                   <p className="text-sm text-gray-500 font-medium leading-relaxed px-2">
                     Since your order is already <span className="text-rose-600 font-bold uppercase">
                       {currentTrackingOrder.status === 'Pending' ? 'Placed' : 
                        currentTrackingOrder.status === 'Accepted' ? 'Confirmed' :
                        currentTrackingOrder.status === 'Preparing' ? 'In Kitchen' :
                        currentTrackingOrder.status === 'Out for Delivery' ? 'On the Way' : currentTrackingOrder.status}
                     </span>, we cannot cancel it directly from the app.
                   </p>
                 </div>

                 <div className="pt-2 flex flex-col gap-3">
                   {currentTrackingOrder.status !== 'Out for Delivery' && (
                     <>
                       {currentTrackingOrder.cancellationRequested ? (
                         <div className="bg-amber-50 text-amber-600 p-4 rounded-2xl text-sm font-bold animate-pulse">
                           Cancellation Request Pending...
                         </div>
                       ) : cancellationRequestedSuccess ? (
                         <div className="bg-green-50 text-green-600 p-4 rounded-2xl text-sm font-bold">
                           Request Sent to Restaurant!
                         </div>
                       ) : (
                         <button 
                           onClick={requestCancellation}
                           disabled={isRequestingCancellation}
                           className="w-full bg-rose-50 text-rose-600 font-black py-4 rounded-2xl flex items-center justify-center gap-2 border-2 border-rose-100 active:scale-[0.98] transition-transform disabled:opacity-50"
                         >
                           {isRequestingCancellation ? 'Sending Request...' : 'Request Cancellation'}
                         </button>
                       )}
                     </>
                   )}

                   <a 
                    href="tel:9804727175"
                    className="w-full bg-[#1AAB4F] text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-green-100 active:scale-[0.98] transition-transform"
                   >
                     <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center">
                        <Navigation className="w-3 h-3 fill-white" />
                     </div>
                     Call Restaurant and Request Cancellation
                   </a>
                   <button 
                    onClick={() => setIsCancelModalOpen(false)}
                    className="w-full bg-gray-100 text-gray-600 font-bold py-4 rounded-2xl active:scale-[0.98] transition-transform"
                   >
                     Go Back
                   </button>
                 </div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Phone Number Modal */}
      <AnimatePresence>
        {isPhoneModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-[32px] overflow-hidden"
            >
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Phone className="w-8 h-8 text-blue-500" />
                </div>
                <h2 className="text-2xl font-black text-gray-900 mb-2">Let's stay in touch</h2>
                <p className="text-gray-500 font-medium mb-8">
                  Adding your number helps our partners coordinate a <span className="text-blue-500 font-bold">smooth delivery</span> and update you on the way.
                </p>

                <div className="space-y-4">
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">
                      +91
                    </div>
                    <input 
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="Enter 10 digit number"
                      className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-4 pl-14 pr-4 font-bold text-lg focus:outline-none focus:border-blue-200 transition-colors text-black"
                    />
                  </div>

                  <button 
                    onClick={savePhoneNumber}
                    disabled={isSavingPhone || phoneInput.length < 10}
                    className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-100 active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale"
                  >
                    {isSavingPhone ? 'Saving...' : 'Confirm Number'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MapBoundsAdjuster({ pos1, pos2 }: { pos1: { lat: number; lng: number }, pos2: { lat: number; lng: number } }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(pos1);
    bounds.extend(pos2);
    map.fitBounds(bounds, { top: 15, bottom: 15, left: 15, right: 15 });
  }, [map, pos1.lat, pos1.lng, pos2.lat, pos2.lng]);

  return null;
}

function DeliveryRoute({ origin, destination }: { origin: google.maps.LatLngLiteral; destination: google.maps.LatLngLiteral }) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!routesLib || !map) return;

    routesLib.Route.computeRoutes({
      origin: origin,
      destination: destination,
      travelMode: 'DRIVING',
      fields: ['path'],
    }).then(({ routes }) => {
      if (routes?.[0]) {
        // Clear previous
        polylinesRef.current.forEach(p => p.setMap(null));
        
        const polylines = routes[0].createPolylines();
        polylines.forEach(polyline => {
          polyline.setOptions({
            strokeColor: '#000000', // Black
            strokeOpacity: 0, // Hide solid line
            icons: [{
              icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: 1,
                scale: 2,
                strokeWeight: 2,
              },
              offset: '0',
              repeat: '10px'
            }],
            map: map
          });
        });
        polylinesRef.current = polylines;
      }
    }).catch(err => console.error("Error computing route:", err));

    return () => {
      polylinesRef.current.forEach(p => p.setMap(null));
    };
  }, [routesLib, map, origin, destination]);

  return null;
}
