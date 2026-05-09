import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { APIProvider, Map as GoogleMap, useMap, useMapsLibrary, useApiLoadingStatus, APILoadingStatus } from '@vis.gl/react-google-maps';
import { MapPin, Search, AlertCircle, Home, Briefcase, Navigation, X, ArrowLeft, User, Phone, Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { AddressService } from '../services/addressService';
import { AddressType, SavedAddress, UserProfile } from '../types';
import { auth } from '../lib/firebase';

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY.length > 10;

interface LocationPickerProps {
  onLocationSelect: (location: { 
    lat: number; 
    lng: number; 
    label: string;
    addressDetails?: string;
    receiverName?: string;
    receiverPhone?: string;
  }) => void;
  initialLocation?: { 
    lat: number; 
    lng: number; 
    label: string;
    addressDetails?: string;
    receiverName?: string;
    receiverPhone?: string;
  };
  isOpen: boolean;
  onClose: () => void;
  savedAddresses?: SavedAddress[];
  currentUser?: UserProfile | null;
}

const DEFAULT_CENTER = { lat: 22.5726, lng: 88.3639 }; // Kolkata

export default function LocationPicker({ onLocationSelect, initialLocation, isOpen, onClose, savedAddresses = [], currentUser }: LocationPickerProps) {
  const [selectedPos, setSelectedPos] = useState(initialLocation || DEFAULT_CENTER);
  const [address, setAddress] = useState(initialLocation?.label || 'Locating...');

  if (!isOpen) return null;

  if (!hasValidKey) {
    return <RestrictionModal onClose={onClose} reason="missing_key" />;
  }

  return (
    <APIProvider apiKey={API_KEY} version="weekly">
      <LocationPickerContent 
        onLocationSelect={onLocationSelect}
        initialLocation={initialLocation}
        selectedPos={selectedPos}
        setSelectedPos={setSelectedPos}
        address={address}
        setAddress={setAddress}
        onClose={onClose}
        savedAddresses={savedAddresses}
        currentUser={currentUser}
      />
    </APIProvider>
  );
}

function LocationPickerContent({ 
  onLocationSelect, 
  initialLocation,
  selectedPos, 
  setSelectedPos, 
  address, 
  setAddress, 
  onClose,
  savedAddresses = [],
  currentUser
}: any) {
  const status = useApiLoadingStatus();
  const geocoding = useMapsLibrary('geocoding');
  const [viewMode, setViewMode] = useState<'list' | 'pick' | 'details'>(savedAddresses.length > 0 ? 'list' : 'pick');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (savedAddresses.length === 0 && viewMode === 'list') {
      setViewMode('pick');
    }
  }, [savedAddresses.length, viewMode]);

  const handleDeleteAddress = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (deletingId) return;
    
    setDeletingId(id);
    try {
      await AddressService.deleteAddress(id);
    } catch (err) {
      console.error(err);
      alert('Failed to delete address');
    } finally {
      setDeletingId(null);
    }
  };

  const getAddressIcon = (type: AddressType) => {
    switch (type) {
      case 'Home': return Home;
      case 'Work': return Building2;
      default: return MapPin;
    }
  };

  const [addressType, setAddressType] = useState<AddressType>('Home');
  const [addressDetails, setAddressDetails] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const hasInteracted = React.useRef(false);

  useEffect(() => {
    const handleOnline = () => setApiError(null);
    const handleOffline = () => setApiError('Network connection lost. Please check your internet.');
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-detect location on mount ONLY if we don't have a specific initial location
  useEffect(() => {
    const isDefault = selectedPos.lat === DEFAULT_CENTER.lat && selectedPos.lng === DEFAULT_CENTER.lng;
    
    if (navigator.geolocation && (isDefault || !initialLocation) && !hasInteracted.current) {
      setIsLocating(true);
      setApiError(null);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (hasInteracted.current) {
            setIsLocating(false);
            return;
          }
          const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
          setSelectedPos(pos);
          setIsLocating(false);
        },
        (error) => {
          setIsLocating(false);
          if (error.code === error.PERMISSION_DENIED) {
            setApiError('Location access denied. Please enable it in browser settings.');
          } else {
            setApiError('Could not detect your location. Please select it manually.');
          }
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }

    // Set initial receiver info only if fields are empty
    if (!receiverName && !receiverPhone) {
      if (currentUser) {
        setReceiverName(currentUser.displayName || '');
        setReceiverPhone(currentUser.phoneNumber || '');
      } else if (auth.currentUser) {
        setReceiverName(auth.currentUser.displayName || '');
        setReceiverPhone(auth.currentUser.phoneNumber || '');
      }
    }
  }, [currentUser, receiverName, receiverPhone]);

  // Sync with initialLocation
  useEffect(() => {
    if (initialLocation && !hasInteracted.current) {
      setSelectedPos({ lat: initialLocation.lat, lng: initialLocation.lng });
      setAddress(initialLocation.label);
    }
  }, [initialLocation, setSelectedPos, setAddress]);

  // Reverse geocode
  useEffect(() => {
    if (!geocoding || !selectedPos) return;

    let isMounted = true;
    const geocoder = new geocoding.Geocoder();
    const timeoutId = setTimeout(() => {
      if (!window.navigator.onLine) {
        setApiError('Network connection lost. Please check your internet.');
        return;
      }

      geocoder.geocode({ location: selectedPos }, (results, status) => {
        if (!isMounted) return;
        
        if (status === 'OK' && results?.[0]) {
          setAddress(results[0].formatted_address);
          setApiError(null);
        } else {
          setAddress('Address not found');
          if (status === 'OVER_QUERY_LIMIT') {
            setApiError('Search limit reached. Please try again later.');
          } else if (status === 'REQUEST_DENIED') {
            setApiError('Map service access denied. Please check your connection.');
          } else if (status === 'ZERO_RESULTS') {
            setApiError('Could not find an address for this location.');
          } else {
            setApiError('Could not load address details.');
          }
        }
      });
    }, 500);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [geocoding, selectedPos, setAddress]);

  if (status === APILoadingStatus.FAILED) {
    return <RestrictionModal onClose={onClose} reason="api_blocked" />;
  }

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!receiverName.trim()) newErrors.name = 'Name is required';
    if (!receiverPhone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^\d{10,15}$/.test(receiverPhone.replace(/\D/g, ''))) {
      newErrors.phone = 'Enter a valid phone number';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleConfirm = async () => {
    if (!validate()) return;
    setIsSaving(true);
    setApiError(null);
    try {
      await AddressService.saveAddress({
        lat: selectedPos.lat,
        lng: selectedPos.lng,
        label: address,
        type: addressType,
        addressDetails,
        receiverName,
        receiverPhone
      });
      onLocationSelect({ 
        ...selectedPos, 
        label: address,
        addressDetails,
        receiverName,
        receiverPhone
      });
      onClose();
    } catch (e: any) {
      console.error('Error saving address:', e);
      setApiError(e.message || 'Failed to save address. Please check your connection.');
    } finally {
      setIsSaving(false);
    }
  };

  if (viewMode === 'list') {
    return (
      <div className="fixed inset-0 z-[100] bg-gray-50 flex flex-col">
        <div className="p-6 bg-white border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">Your saved addresses</h2>
          <button onClick={onClose} className="p-2 bg-gray-100 rounded-full">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {savedAddresses.map((addr: SavedAddress) => {
            const Icon = getAddressIcon(addr.type);
            return (
              <div 
                key={addr.id}
                onClick={() => {
                  onLocationSelect({
                    lat: addr.lat,
                    lng: addr.lng,
                    label: addr.label,
                    addressDetails: addr.addressDetails,
                    receiverName: addr.receiverName,
                    receiverPhone: addr.receiverPhone
                  });
                  onClose();
                }}
                className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex gap-4 items-start active:scale-[0.98] transition-all cursor-pointer group"
              >
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center shrink-0">
                  <Icon className="w-6 h-6 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-black text-gray-900 text-lg leading-tight">{addr.type === 'Other' ? addr.label.split(',')[0] : addr.type}</h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPos({ lat: addr.lat, lng: addr.lng });
                          setAddress(addr.label);
                          setAddressType(addr.type);
                          setAddressDetails(addr.addressDetails || '');
                          setReceiverName(addr.receiverName || '');
                          setReceiverPhone(addr.receiverPhone || '');
                          setViewMode('details');
                        }}
                        className="p-2 border border-gray-100 rounded-full hover:bg-gray-50 bg-white shadow-sm"
                      >
                        <Pencil className="w-4 h-4 text-emerald-500" />
                      </button>
                      <button 
                        onClick={(e) => handleDeleteAddress(e, addr.id)}
                        disabled={deletingId === addr.id}
                        className={cn(
                          "p-2 border border-gray-100 rounded-full bg-white shadow-sm transition-all",
                          deletingId === addr.id ? "opacity-50 cursor-not-allowed" : "hover:bg-red-50"
                        )}
                      >
                        {deletingId === addr.id ? (
                          <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4 text-rose-500" />
                        )}
                      </button>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-400 line-clamp-4 leading-relaxed">
                    {addr.addressDetails && `${addr.addressDetails}, `}{addr.label}
                  </p>
                </div>
              </div>
            );
          })}
          
          <button 
            onClick={() => {
              setViewMode('pick');
              setSelectedPos(DEFAULT_CENTER);
              setAddress('Locating...');
              setAddressDetails('');
            }}
            className="w-full p-6 border-2 border-dashed border-gray-200 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-gray-500 hover:border-emerald-500 hover:text-emerald-500 transition-all bg-white"
          >
            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center">
              <Plus className="w-6 h-6" />
            </div>
            <span className="font-bold">Add new address</span>
          </button>
        </div>
      </div>
    );
  }

  const isDetails = viewMode === 'details';

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col transition-all">
      {/* Top Search Layer */}
      <div className="absolute top-0 inset-x-0 z-50 p-4 bg-gradient-to-b from-white/95 to-white/0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              if (viewMode === 'pick' && savedAddresses.length > 0) {
                setViewMode('list');
              } else if (viewMode === 'details') {
                setViewMode('pick');
              } else {
                onClose();
              }
            }}
            className="p-3 bg-white rounded-full shadow-lg border border-gray-100 active:scale-95 transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="flex-1">
            <SearchBox 
              onSelect={(pos, label) => {
                hasInteracted.current = true;
                setSelectedPos(pos);
                setAddress(label);
                setApiError(null);
              }}
              onError={(msg) => setApiError(msg)}
            />
          </div>
        </div>
      </div>

      {/* Map Section */}
      <div className={cn("relative transition-all duration-300", isDetails ? "h-[30vh]" : "flex-1")}>
        {/* API/Network Error Banner */}
        <AnimatePresence>
          {apiError && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-24 inset-x-4 z-50 pointer-events-none"
            >
              <div className="bg-red-500 text-white p-4 rounded-2xl shadow-xl shadow-red-200 flex items-start gap-3 pointer-events-auto backdrop-blur-md">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-black uppercase tracking-widest mb-1">Issue Encountered</p>
                  <p className="text-sm font-bold opacity-90">{apiError}</p>
                </div>
                <button onClick={() => setApiError(null)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <GoogleMap
          center={selectedPos}
          zoom={15}
          onCameraChanged={(e) => {
            const center = e.detail.center;
            if (center) {
              const hasMoved = Math.abs(center.lat - selectedPos.lat) > 0.00001 || 
                               Math.abs(center.lng - selectedPos.lng) > 0.00001;
              if (hasMoved) {
                hasInteracted.current = true;
                setSelectedPos({ lat: center.lat, lng: center.lng });
              }
            }
          }}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          gestureHandling="greedy"
          style={{ width: '100%', height: '100%' }}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        >
        </GoogleMap>
        
        {/* Center Pin Marker */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center -translate-y-8">
          <div className="relative">
            <MapPin className={cn("w-12 h-12 text-rose-500 drop-shadow-2xl fill-rose-100", isLocating ? "animate-pulse" : "animate-bounce")} />
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-1.5 bg-black/20 rounded-full blur-[2px]" />
          </div>
        </div>

        {/* Current Location Button */}
        {!isDetails && (
          <button 
            onClick={() => {
              if (navigator.geolocation) {
                hasInteracted.current = true;
                setIsLocating(true);
                setApiError(null);
                navigator.geolocation.getCurrentPosition(
                  (p) => {
                    setSelectedPos({ lat: p.coords.latitude, lng: p.coords.longitude });
                    setIsLocating(false);
                  },
                  (error) => {
                    setIsLocating(false);
                    if (error.code === error.PERMISSION_DENIED) {
                      setApiError('Location permission denied. Please check your browser settings.');
                    } else {
                      setApiError('Failed to get your location. Please check your connection.');
                    }
                  },
                  { enableHighAccuracy: true, timeout: 5000 }
                );
              }
            }}
            className="absolute bottom-4 right-4 p-4 bg-white rounded-2xl shadow-2xl border border-gray-100 flex items-center gap-2 active:scale-95 transition-all text-gray-700 z-10 font-bold"
          >
            <Navigation className={cn("w-5 h-5 text-rose-500", isLocating && "animate-spin")} />
            <span className="text-sm">Use current location</span>
          </button>
        )}
      </div>

      {/* Bottom Draggable-style Sheet */}
      <div className={cn(
        "bg-white rounded-t-[2.5rem] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] flex flex-col transition-all duration-300",
        isDetails ? "flex-1" : "h-[35vh]"
      )}>
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto my-4 shrink-0" />
        
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
          {/* Header & Address Card */}
          <section>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em]">Delivery details</h3>
            </div>
            <div className="flex items-start gap-4 p-4 bg-rose-50/50 rounded-2xl border border-rose-100/50">
              <div className="p-2.5 bg-white rounded-xl shadow-sm">
                <MapPin className="w-5 h-5 text-rose-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-gray-900 leading-tight mb-1 truncate">{address.split(',')[0]}</p>
                <p className="text-xs text-gray-500 font-medium leading-relaxed line-clamp-2">{address}</p>
              </div>
            </div>
          </section>

          {isDetails && (
            <div className="space-y-6 overflow-hidden">
              {/* Address details input */}
              <div className="space-y-4 pt-2">
                <div className="relative group">
                  <input
                    type="text"
                    value={addressDetails}
                    onChange={(e) => setAddressDetails(e.target.value)}
                    placeholder="Floor, Flat number, House no, Landmark"
                    className="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl px-5 py-4 text-sm font-bold placeholder:text-gray-400 focus:bg-white focus:border-rose-500 focus:ring-0 transition-all outline-none"
                  />
                  <span className="absolute left-5 -top-2 text-[10px] font-black text-gray-400 uppercase bg-white px-1.5 opacity-100 transition-opacity">Address details</span>
                </div>
              </div>

              {/* Receiver details */}
              <section className="space-y-4">
                <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em]">Receiver details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                      <User className="w-4 h-4 text-gray-400 group-focus-within:text-rose-500 transition-colors" />
                    </div>
                    <input
                      type="text"
                      value={receiverName}
                      onChange={(e) => setReceiverName(e.target.value)}
                      placeholder="Receiver's name"
                      className={cn(
                        "w-full bg-gray-50 border-2 border-gray-50 rounded-2xl pl-12 pr-5 py-4 text-sm font-bold placeholder:text-gray-400 focus:bg-white focus:border-rose-500 focus:ring-0 transition-all outline-none",
                        errors.name && "border-red-500 bg-red-50"
                      )}
                    />
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                      <Phone className="w-4 h-4 text-gray-400 group-focus-within:text-rose-500 transition-colors" />
                    </div>
                    <input
                      type="tel"
                      value={receiverPhone}
                      onChange={(e) => setReceiverPhone(e.target.value.replace(/\D/g, ''))}
                      placeholder="Receiver's phone"
                      className={cn(
                        "w-full bg-gray-50 border-2 border-gray-50 rounded-2xl pl-12 pr-5 py-4 text-sm font-bold placeholder:text-gray-400 focus:bg-white focus:border-rose-500 focus:ring-0 transition-all outline-none",
                        errors.phone && "border-red-500 bg-red-50"
                      )}
                    />
                  </div>
                </div>
                {(errors.name || errors.phone) && (
                  <p className="text-[10px] font-bold text-red-500 px-2 italic">Please fill valid receiver details</p>
                )}
              </section>

              {/* Save as selection */}
              <section className="space-y-3">
                <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em]">Save address as</h3>
                <div className="flex gap-3">
                  {[
                    { type: 'Home' as AddressType, icon: Home },
                    { type: 'Work' as AddressType, icon: Building2 },
                    { type: 'Other' as AddressType, icon: MapPin }
                  ].map(({ type, icon: Icon }) => (
                    <button
                      key={type}
                      onClick={() => setAddressType(type)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 p-3.5 rounded-2xl border-2 transition-all active:scale-95",
                        addressType === type 
                          ? "bg-rose-50 border-rose-500 text-rose-600 shadow-sm" 
                          : "bg-white border-gray-100 text-gray-500 hover:border-gray-200"
                      )}
                    >
                      <Icon className={cn("w-4 h-4", addressType === type ? "text-rose-600" : "text-gray-400")} />
                      <span className="text-xs font-black tracking-tight">{type}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* CTA */}
              <button
                onClick={handleConfirm}
                disabled={isSaving}
                className={cn(
                  "w-full bg-rose-600 text-white h-16 rounded-2xl font-black text-lg shadow-xl shadow-rose-200 active:scale-[0.98] transition-all flex items-center justify-center mt-4",
                  isSaving && "opacity-70 cursor-not-allowed"
                )}
              >
                {isSaving ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving...</span>
                  </div>
                ) : "Save Address"}
              </button>
            </div>
          )}

          {viewMode === 'pick' && (
            <div className="space-y-3">
              <button 
                onClick={() => setViewMode('details')}
                className="w-full bg-emerald-600 text-white h-16 rounded-2xl font-black text-lg shadow-xl shadow-emerald-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <span>Confirm Location</span>
              </button>

              {savedAddresses.length > 0 && (
                <button 
                  onClick={() => setViewMode('list')}
                  className="w-full flex items-center justify-center gap-2 py-4 border-2 border-gray-100 rounded-2xl text-gray-500 font-bold hover:bg-gray-50 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to saved addresses
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RestrictionModal({ onClose, reason }: { onClose: () => void, reason: 'missing_key' | 'api_blocked' }) {
  return (
    <div className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-md flex items-end justify-center">
      <div className="w-full bg-white rounded-t-3xl p-8 text-center animate-in slide-in-from-bottom duration-500">
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-8" />
        <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-rose-500" />
        </div>
        <h2 className="text-2xl font-black mb-3 text-gray-900">
          {reason === 'missing_key' ? "API Key Missing" : "Access Restricted"}
        </h2>
        <p className="text-gray-500 mb-8 text-sm leading-relaxed max-w-xs mx-auto">
          {reason === 'missing_key' ? (
            <>Please add your <code className="px-1.5 py-0.5 bg-gray-100 rounded text-rose-600 font-mono">GOOGLE_MAPS_PLATFORM_KEY</code> to the Secrets panel.</>
          ) : (
            <>Your API key is invalid or expired. Check your Google Cloud Console.</>
          )}
        </p>
        <div className="space-y-3">
          <button onClick={() => window.open('https://console.cloud.google.com/google/maps-apis/api-list', '_blank')} className="w-full bg-rose-600 text-white py-4 rounded-2xl font-black shadow-xl shadow-rose-100">Check API Console</button>
          <button onClick={onClose} className="w-full bg-gray-50 text-gray-600 py-4 rounded-2xl font-black">Continue without map</button>
        </div>
      </div>
    </div>
  );
}

function SearchBox({ onSelect, onError }: { 
  onSelect: (pos: { lat: number; lng: number }, label: string) => void;
  onError: (msg: string) => void;
}) {
  const map = useMap();
  const places = useMapsLibrary('places');
  const geocoding = useMapsLibrary('geocoding');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<google.maps.places.AutocompletePrediction[]>([]);

  useEffect(() => {
    if (!places || !query || query.length < 3) {
      setResults([]);
      return;
    }
    const service = new places.AutocompleteService();
    service.getPlacePredictions(
      { input: query, locationBias: map?.getBounds() },
      (predictions, status) => {
        if (status === 'OK') {
          setResults(predictions || []);
        } else if (status === 'OVER_QUERY_LIMIT') {
          onError('Search limit reached. Please try again.');
        }
      }
    );
  }, [places, query, map, onError]);

  const handleSelect = (placeId: string, description: string) => {
    if (!geocoding || !map) return;
    const geocoder = new geocoding.Geocoder();
    geocoder.geocode({ placeId }, (results, status) => {
      if (status === 'OK' && results?.[0]) {
        const pos = results[0].geometry.location;
        onSelect({ lat: pos.lat(), lng: pos.lng() }, description);
        setQuery('');
        setResults([]);
      } else {
        onError('Could not load details for this location.');
      }
    });
  };

  return (
    <div className="relative">
      <div className="relative shadow-lg ring-1 ring-black/5 bg-white rounded-2xl">
        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
          <Search className="w-5 h-5 text-gray-400" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for area, street name..."
          className="w-full pl-12 pr-5 py-4 bg-transparent border-none focus:ring-0 text-sm font-bold text-gray-900 placeholder:text-gray-400"
        />
      </div>

      {results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 max-h-60 overflow-y-auto divide-y divide-gray-50 z-[60]">
          {results.map((item) => (
            <button
              key={item.place_id}
              onClick={() => handleSelect(item.place_id, item.description)}
              className="w-full px-5 py-4 text-left hover:bg-rose-50/50 flex items-start gap-4 transition-colors group"
            >
              <div className="p-2 bg-gray-50 rounded-lg group-hover:bg-rose-50 transition-colors">
                <MapPin className="w-4 h-4 text-gray-400 group-hover:text-rose-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900 truncate tracking-tight">{item.structured_formatting.main_text}</p>
                <p className="text-[10px] text-gray-500 font-bold truncate uppercase tracking-tight">{item.structured_formatting.secondary_text}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
