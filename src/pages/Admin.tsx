import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, LayoutDashboard, UtensilsCrossed, ClipboardList, Camera, X, Loader2, CheckCircle2, Clock, Truck, LogOut, ExternalLink, AlertCircle, Phone, MapPin, Navigation } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { APIProvider, Map as GoogleMap, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import { MenuItem, Order, OrderStatus } from '../types';
import { MenuService } from '../services/menuService';
import { OrderService } from '../services/orderService';
import { SettingsService, RestaurantLocation } from '../services/settingsService';
import { formatPrice, cn } from '../lib/utils';
import { db, auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy, doc, updateDoc } from 'firebase/firestore';

export default function Admin() {
  const [view, setView] = useState<'menu' | 'orders' | 'settings'>('menu');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'New Orders'>('New Orders');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [hasNewOrder, setHasNewOrder] = useState(false);
  const isInitialLoad = React.useRef(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Partial<MenuItem> | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [adminPos, setAdminPos] = useState<{lat: number, lng: number} | null>(null);
  const [restaurantLocation, setRestaurantLocation] = useState<RestaurantLocation>({ lat: 22.6189, lng: 88.4546 });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setAdminPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.error("Admin Geolocation error:", err)
      );
    }
  }, []);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const loc = await SettingsService.getRestaurantLocation();
        if (loc) setRestaurantLocation(loc);
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      }
    };
    fetchSettings();
  }, []);

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      await SettingsService.updateRestaurantLocation(restaurantLocation);
      alert('Restaurant location updated successfully!');
    } catch (error) {
      console.error(error);
      alert('Failed to update restaurant location.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    const unsubMenu = MenuService.subscribeToMenu(setMenuItems);
    return () => unsubMenu();
  }, []);

  useEffect(() => {
    const unsub = OrderService.subscribeToAllOrders((allOrders) => {
      setOrders(allOrders);

      // Check for new pending orders if not on orders view
      if (!isInitialLoad.current && view !== 'orders') {
        // Find if any orders were added (not just updated)
        // Since we don't have docChanges here easily without refactoring the service,
        // we can check if the total count increased and any new ones are Pending
        if (allOrders.length > orders.length) {
           const hasNewPending = allOrders.slice(0, allOrders.length - orders.length).some(o => o.status === 'Pending');
           if (hasNewPending) setHasNewOrder(true);
        }
      }
      isInitialLoad.current = false;
    });

    return () => unsub();
  }, [view, orders.length]);

  // Reset notification when viewing orders
  useEffect(() => {
    if (view === 'orders') {
      setHasNewOrder(false);
    }
  }, [view]);

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEditing && selectedItem?.id) {
        await MenuService.updateMenuItem(selectedItem.id, selectedItem, imageFile || undefined);
      } else {
        await MenuService.addMenuItem(selectedItem as any, imageFile || undefined);
      }
      setShowItemModal(false);
      setSelectedItem(null);
      setImageFile(null);
    } catch (error) {
      console.error(error);
      alert('Error saving item');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (orderId: string, status: OrderStatus) => {
    await OrderService.updateOrderStatus(orderId, status);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
  };

const statusColors = {
    'Pending': 'bg-yellow-100 text-yellow-700',
    'Accepted': 'bg-blue-100 text-blue-700',
    'Preparing': 'bg-purple-100 text-purple-700',
    'Ready': 'bg-indigo-100 text-indigo-700',
    'Out for Delivery': 'bg-orange-100 text-orange-700',
    'Delivered': 'bg-green-100 text-green-700',
    'Cancelled': 'bg-red-100 text-red-700',
    'Rejected': 'bg-rose-100 text-rose-700 font-bold',
  };

  const API_KEY =
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ||
    '';

  const OrderMap = ({ lat, lng }: { lat: number, lng: number }) => {
    if (!API_KEY) return null;
    return (
      <div className="w-full h-32 md:h-40 rounded-2xl overflow-hidden mt-3 border border-gray-100 shadow-inner group-hover:border-rose-100 transition-colors">
        <GoogleMap
          defaultCenter={{ lat, lng }}
          defaultZoom={15}
          gestureHandling={'none'}
          disableDefaultUI={true}
          mapId="ADMIN_ORDER_MAP"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
        >
          <AdvancedMarker position={{ lat, lng }}>
            <Pin background="#f43f5e" glyphColor="#fff" borderColor="#be123c" />
          </AdvancedMarker>
        </GoogleMap>
      </div>
    );
  };

  const filteredOrders = orders.filter(order => {
    if (statusFilter === 'New Orders') return order.status === 'Pending';
    return order.status === statusFilter;
  });

  return (
    <APIProvider apiKey={API_KEY} version="weekly">
      <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar - Desktop / Bottom Nav - Mobile */}
      <aside className="w-full md:w-64 bg-slate-900 text-white flex md:flex-col sticky top-0 z-40">
        <div className="p-6 hidden md:block">
          <h1 className="text-xl font-black tracking-tight text-rose-500">JB's Flame Admin</h1>
        </div>
        <nav className="flex-1 flex md:flex-col items-center md:items-stretch justify-around md:justify-start px-2 py-4 md:gap-2">
          <button 
            onClick={() => setView('menu')}
            className={cn(
                "flex items-center gap-3 p-3 rounded-xl transition-all font-bold text-sm",
                view === 'menu' ? "bg-rose-500 text-white" : "text-gray-400 hover:bg-slate-800"
            )}
          >
            <UtensilsCrossed className="w-5 h-5" />
            <span className="hidden md:inline">Menu Manager</span>
          </button>
          <button 
            onClick={() => setView('orders')}
            className={cn(
                "flex items-center gap-3 p-3 rounded-xl transition-all font-bold text-sm relative",
                view === 'orders' ? "bg-rose-500 text-white" : "text-gray-400 hover:bg-slate-800"
            )}
          >
            <div className="relative">
              <ClipboardList className="w-5 h-5" />
              {hasNewOrder && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 border-2 border-slate-900 rounded-full md:hidden" />
              )}
            </div>
            <span className="hidden md:inline">Live Orders</span>
            {hasNewOrder && (
              <span className="ml-auto hidden md:inline bg-rose-600 text-white text-[10px] px-2 py-0.5 rounded-full animate-pulse shadow-lg font-black">
                NEW!
              </span>
            )}
            {hasNewOrder && (
              <span className="absolute top-2 right-2 md:hidden w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-slate-900 animate-pulse" />
            )}
          </button>

          <button 
            onClick={() => setView('settings')}
            className={cn(
                "flex items-center gap-3 p-3 rounded-xl transition-all font-bold text-sm",
                view === 'settings' ? "bg-rose-500 text-white" : "text-gray-400 hover:bg-slate-800"
            )}
          >
            <MapPin className="w-5 h-5" />
            <span className="hidden md:inline">Restaurant Location</span>
          </button>
          
          <button 
            onClick={() => signOut(auth)}
            className="md:hidden flex items-center gap-3 p-3 rounded-xl transition-all font-bold text-sm text-rose-500 hover:bg-slate-800"
          >
            <LogOut className="w-5 h-5" />
          </button>

          <div className="mt-auto hidden md:flex flex-col gap-2 p-2">
            <button 
              onClick={() => window.location.href = '/'}
              className="flex items-center gap-3 p-3 rounded-xl transition-all font-bold text-sm text-gray-400 hover:bg-slate-800"
            >
              <ExternalLink className="w-5 h-5" />
              <span>Customer View</span>
            </button>
            <button 
              onClick={() => signOut(auth)}
              className="flex items-center gap-3 p-3 rounded-xl transition-all font-bold text-sm text-gray-400 hover:text-rose-500 hover:bg-slate-800"
            >
              <LogOut className="w-5 h-5" />
              <span>Sign Out</span>
            </button>
          </div>
        </nav>
      </aside>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full">
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">
              {view === 'menu' ? 'Menu Management' : view === 'orders' ? 'Recent Orders' : 'Restaurant Settings'}
            </h2>
            {view === 'menu' && (
              <button 
                onClick={() => { setSelectedItem({ available: true }); setIsEditing(false); setShowItemModal(true); }}
                className="bg-rose-500 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-rose-200"
              >
                <Plus className="w-5 h-5" /> Add Item
              </button>
            )}
            {view === 'orders' && (
              <button 
                onClick={async () => {
                   if (confirm('Are you sure you want to reset ALL order data? This cannot be undone.')) {
                     setLoading(true);
                     try {
                       await OrderService.deleteAllOrders();
                       alert('All orders have been cleared.');
                     } catch (error) {
                       console.error(error);
                       alert('Failed to reset orders.');
                     } finally {
                       setLoading(false);
                     }
                   }
                }}
                className="bg-gray-100 text-gray-500 hover:bg-gray-200 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all"
              >
                <Trash2 className="w-5 h-5" /> Reset Orders
              </button>
            )}
          </div>

          {view === 'orders' && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              {(['New Orders', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered', 'Cancelled'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "px-4 py-2 rounded-full text-xs font-black whitespace-nowrap transition-all border-2",
                    statusFilter === status 
                      ? "bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-100" 
                      : "bg-white border-gray-100 text-gray-400 hover:border-gray-200"
                  )}
                >
                  {status}
                  {status === 'New Orders' 
                    ? ` (${orders.filter(o => o.status === 'Pending').length})` 
                    : ` (${orders.filter(o => o.status === status).length})`}
                </button>
              ))}
            </div>
          )}
        </div>

        {view === 'menu' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {menuItems.map(item => (
              <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col group">
                <div className="h-40 relative overflow-hidden">
                  <img src={item.imageUrl || undefined} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" referrerPolicy="no-referrer" />
                  <div className="absolute top-2 right-2 flex gap-2">
                    <button 
                      onClick={() => { setSelectedItem(item); setIsEditing(true); setShowItemModal(true); }}
                      className="p-2 bg-white/90 rounded-lg shadow hover:bg-white transition-colors"
                    >
                      <Edit2 className="w-4 h-4 text-blue-600" />
                    </button>
                    <button 
                      onClick={() => { if(confirm('Delete?')) MenuService.deleteMenuItem(item.id, item.imageUrl); }}
                      className="p-2 bg-white/90 rounded-lg shadow hover:bg-white transition-colors text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="absolute bottom-2 left-2 bg-white/90 px-2 py-1 rounded-md">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">{item.category}</span>
                  </div>
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="font-bold text-gray-900 line-clamp-1">{item.name}</h3>
                  <p className="text-sm text-gray-500 line-clamp-2 mt-1 mb-3">{item.description}</p>
                  <div className="mt-auto flex items-center justify-between">
                    <p className="font-black text-lg">{formatPrice(item.price)}</p>
                    <span className={cn("text-[10px] font-bold px-2 py-1 rounded uppercase", item.available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                      {item.available ? 'Available' : 'Out of Stock'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : view === 'orders' ? (
          <div className="space-y-4">
             {filteredOrders.length === 0 ? (
               <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-100">
                 <ClipboardList className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                 <p className="text-gray-400 font-bold italic">No orders found in this category</p>
               </div>
             ) : filteredOrders.map(order => (
               <div key={order.id} className="bg-white rounded-2xl border p-6 shadow-sm hover:shadow-md transition-shadow">
                 <div className="flex flex-col md:flex-row justify-between gap-4">
                   <div>
                     <div className="flex items-center gap-3 mb-2">
                       <p className="text-xs font-black text-gray-400">ORDER #{order.id.slice(-6).toUpperCase()}</p>
                       <span className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase", statusColors[order.status])}>
                         {order.status === 'Pending' ? 'New Order Received!' : order.status}
                       </span>
                     </div>
                     <p className="font-bold text-gray-900 mb-0.5">{order.address.label}</p>
                     {order.address.addressDetails && (
                       <p className="text-xs text-slate-500 font-medium mb-1">{order.address.addressDetails}</p>
                     )}
                      {adminPos && (
                        <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">
                          <Navigation className="w-3 h-3 text-rose-500" />
                          <span>{calculateDistance(adminPos.lat, adminPos.lng, order.address.lat, order.address.lng).toFixed(1)} KM AWAY</span>
                        </div>
                      )}
                      <OrderMap lat={order.address.lat} lng={order.address.lng} />
                      
                      <div className="flex flex-col gap-3 mb-3 mt-4 border-t border-gray-50 pt-4">
                        {/* Ordering User - The primary account holder */}
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ordered By</p>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-gray-900">{order.userName || 'Guest'}</p>
                              {order.userPhone && (
                                <div className="flex items-center gap-1 px-2 py-0.5 bg-gray-50 rounded-md border border-gray-100">
                                  <Phone className="w-2.5 h-2.5 text-gray-400" />
                                  <span className="text-[10px] text-gray-500 font-bold">{order.userPhone}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Receiver Details - Only show if different from Ordering User */}
                        {((order.address.receiverName && order.address.receiverName !== order.userName) || 
                          (order.address.receiverPhone && order.address.receiverPhone !== order.userPhone)) && (
                          <div className="flex flex-col gap-1 bg-rose-50/50 p-2.5 rounded-xl border border-rose-100/50">
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                              <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Deliver To (Receiver)</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-black text-rose-600">{order.address.receiverName || 'N/A'}</p>
                              {order.address.receiverPhone && (
                                <div className="flex items-center gap-1 px-2 py-0.5 bg-white rounded-md border border-rose-100">
                                  <Phone className="w-2.5 h-2.5 text-rose-400" />
                                  <span className="text-[10px] text-rose-500 font-black">{order.address.receiverPhone}</span>
                                </div>
                              )}
                            </div>
                            <p className="text-[9px] font-bold text-rose-400 italic">This order is for a different receiver.</p>
                          </div>
                        )}
                      </div>
                     <p className="text-sm text-gray-500">Items: {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</p>
                   </div>
                   <div className="flex flex-col items-end gap-3">
                     <p className="text-2xl font-black">{formatPrice(order.total)}</p>
                     
                     {order.cancellationRequested && (
                       <div className="w-full bg-rose-50 border border-rose-100 rounded-xl p-3 mb-1 min-w-[200px]">
                         <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-2 flex items-center gap-1">
                           <AlertCircle className="w-3 h-3" />
                           Cancellation Requested
                         </p>
                         <p className="text-xs font-medium text-gray-700 mb-3 leading-tight">Customer wants to cancel this order. Should we allow?</p>
                         <div className="flex gap-2">
                            <button 
                              onClick={() => OrderService.handleCancellationRequest(order.id, true)}
                              className="flex-1 text-[10px] font-black py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 active:scale-95 transition-all shadow-md shadow-rose-100"
                            >
                              YES, CANCEL
                            </button>
                            <button 
                              onClick={() => OrderService.handleCancellationRequest(order.id, false)}
                              className="flex-1 text-[10px] font-black py-2 bg-white text-gray-400 border border-gray-200 rounded-lg hover:border-gray-400 hover:text-gray-600 active:scale-95 transition-all"
                            >
                              NO
                            </button>
                         </div>
                       </div>
                     )}

                       <div className="flex flex-wrap justify-end gap-2">
                         {order.status === 'Pending' ? (
                           <>
                             <button 
                               onClick={() => handleUpdateStatus(order.id, 'Preparing')}
                               className="text-[10px] font-black px-4 py-2 rounded-xl bg-green-500 text-white shadow-lg shadow-green-100 hover:bg-green-600 transition-all uppercase tracking-tight"
                             >
                               Accept Order
                             </button>
                             <button 
                               onClick={() => handleUpdateStatus(order.id, 'Cancelled')}
                               className="text-[10px] font-black px-4 py-2 rounded-xl bg-white border-2 border-gray-100 text-gray-400 hover:border-rose-500 hover:text-rose-500 transition-all uppercase tracking-tight"
                             >
                               Reject
                             </button>
                           </>
                         ) : (
                           ['Preparing', 'Ready', 'Out for Delivery', 'Delivered', 'Cancelled'].map(s => (
                             <button 
                               key={s}
                               onClick={() => handleUpdateStatus(order.id, s as OrderStatus)}
                               className={cn(
                                 "text-[10px] font-bold px-2 py-1 rounded border hover:bg-gray-50 transition-colors uppercase",
                                 order.status === s ? "border-rose-500 text-rose-500 bg-rose-50" : "border-gray-200 text-gray-500"
                               )}
                             >
                               {s}
                             </button>
                           ))
                         )}
                      </div>
                   </div>
                 </div>
               </div>
             ))}
          </div>
        ) : (
          <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-6 md:p-8">
             <div className="max-w-2xl">
               <div className="flex items-center gap-3 mb-6">
                 <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center">
                   <MapPin className="w-6 h-6 text-rose-600" />
                 </div>
                 <div>
                   <h3 className="text-xl font-bold text-gray-900 tracking-tight">Restaurant Location</h3>
                   <p className="text-sm text-gray-500 font-medium">Set the landing and tracking center for your restaurant</p>
                 </div>
               </div>

               <div className="h-[400px] rounded-[32px] overflow-hidden relative border border-gray-100 shadow-inner mb-6">
                 <GoogleMap
                   defaultCenter={restaurantLocation}
                   defaultZoom={15}
                   mapId="ADMIN_RESTAURANT_PICKER"
                   onCenterChanged={(e: any) => {
                      const newCenter = e.map.getCenter();
                      if (newCenter) {
                        setRestaurantLocation(prev => ({ ...prev, lat: newCenter.lat(), lng: newCenter.lng() }));
                      }
                   }}
                   options={{
                     disableDefaultUI: false,
                     clickableIcons: false,
                     scrollwheel: true
                   }}
                   style={{ width: '100%', height: '100%' }}
                 >
                   <AdvancedMarker 
                     position={restaurantLocation} 
                     draggable={true}
                     onDragEnd={(e) => {
                       if (e.latLng) {
                         setRestaurantLocation(prev => ({ 
                           ...prev, 
                           lat: e.latLng!.lat(), 
                           lng: e.latLng!.lng() 
                         }));
                       }
                     }}
                   >
                     <Pin background="#f43f5e" glyphColor="#fff" borderColor="#be123c" scale={1.5} />
                   </AdvancedMarker>
                 </GoogleMap>
                 <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-4 py-2 rounded-xl shadow-lg border border-white/50">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1 text-center">Coordinates</p>
                    <p className="text-xs font-bold text-gray-900">{restaurantLocation.lat.toFixed(6)}, {restaurantLocation.lng.toFixed(6)}</p>
                 </div>
               </div>

               <div className="grid grid-cols-2 gap-4 mb-8 text-center">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Latitude</label>
                    <div className="bg-gray-50 rounded-xl p-4 font-bold text-gray-900">{restaurantLocation.lat.toFixed(6)}</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Longitude</label>
                    <div className="bg-gray-50 rounded-xl p-4 font-bold text-gray-900">{restaurantLocation.lng.toFixed(6)}</div>
                  </div>
               </div>

               <button 
                 disabled={isSavingSettings}
                 onClick={handleSaveSettings}
                 className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-slate-200 flex items-center justify-center gap-3 hover:bg-black active:scale-[0.98] transition-all disabled:opacity-50"
               >
                 {isSavingSettings ? (
                   <>
                     <Loader2 className="w-6 h-6 animate-spin" />
                     <span>SAVING...</span>
                   </>
                 ) : (
                   <>
                     <CheckCircle2 className="w-5 h-5 text-rose-500" />
                     <span>UPDATE RESTAURANT LOCATION</span>
                   </>
                 )}
               </button>
             </div>
          </div>
        )}
      </main>

      {/* Item Modal */}
      <AnimatePresence>
        {showItemModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/60" onClick={() => setShowItemModal(false)} />
            <motion.div 
              initial={{scale:0.9, opacity:0}}
              animate={{scale:1, opacity:1}}
              exit={{scale:0.9, opacity:0}}
              className="bg-white rounded-[32px] w-full max-w-lg overflow-hidden relative z-10"
            >
              <div className="bg-slate-900 p-6 text-white flex items-center justify-between">
                <h2 className="text-xl font-bold">{isEditing ? 'Edit Item' : 'New Dish'}</h2>
                <button onClick={() => setShowItemModal(false)}><X className="w-6 h-6" /></button>
              </div>

              <form onSubmit={handleSaveItem} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Dish Name</label>
                    <input 
                      required
                      value={selectedItem?.name || ''} 
                      onChange={e => setSelectedItem({...selectedItem, name: e.target.value})}
                      className="w-full bg-gray-50 border-none rounded-xl p-3 font-medium focus:ring-2 focus:ring-rose-500" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Category</label>
                    <select 
                      value={selectedItem?.category || ''} 
                      onChange={e => setSelectedItem({...selectedItem, category: e.target.value})}
                      className="w-full bg-gray-50 border-none rounded-xl p-3 font-medium focus:ring-2 focus:ring-rose-500"
                    >
                      <option value="">Select...</option>
                      <option value="Starters">Starters</option>
                      <option value="Main Course">Main Course</option>
                      <option value="Breads">Breads</option>
                      <option value="Beverages">Beverages</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Description</label>
                  <textarea 
                    value={selectedItem?.description || ''} 
                    onChange={e => setSelectedItem({...selectedItem, description: e.target.value})}
                    className="w-full bg-gray-50 border-none rounded-xl p-3 font-medium focus:ring-2 focus:ring-rose-500 h-24 whitespace-pre-wrap" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Price (INR)</label>
                    <input 
                      type="number"
                      required
                      value={selectedItem?.price || ''} 
                      onChange={e => setSelectedItem({...selectedItem, price: parseFloat(e.target.value)})}
                      className="w-full bg-gray-50 border-none rounded-xl p-3 font-medium focus:ring-2 focus:ring-rose-500" 
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input 
                      type="checkbox"
                      checked={selectedItem?.available || false}
                      onChange={e => setSelectedItem({...selectedItem, available: e.target.checked})}
                      className="w-5 h-5 rounded text-rose-500 focus:ring-rose-500"
                    />
                    <label className="text-sm font-bold text-gray-700">Available Now</label>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Dish Photo</label>
                  <div className="flex gap-4">
                    <div className="w-24 h-24 rounded-xl bg-gray-100 border-2 border-dashed flex items-center justify-center relative overflow-hidden group">
                      {imageFile ? (
                        <img src={URL.createObjectURL(imageFile)} className="w-full h-full object-cover" />
                      ) : selectedItem?.imageUrl ? (
                         <img src={selectedItem.imageUrl || undefined} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <Camera className="w-8 h-8 text-gray-300" />
                      )}
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={e => setImageFile(e.target.files?.[0] || null)}
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                      />
                    </div>
                    <div className="flex-1 text-xs text-gray-400 mt-2">
                       <p>High quality photos increase orders by 20%.</p>
                       <p className="mt-1">Recommended: 800x800px, JPEG or PNG.</p>
                    </div>
                  </div>
                </div>

                <button 
                  disabled={loading}
                  type="submit"
                  className="w-full bg-rose-500 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-rose-100 disabled:opacity-50 mt-4 h-16 flex items-center justify-center"
                >
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : isEditing ? 'UPDATE MENU ITEM' : 'CREATE MENU ITEM'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  </APIProvider>
);
}
