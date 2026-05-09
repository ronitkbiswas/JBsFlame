import React from 'react';
import { ShoppingBag, ChevronUp, ChevronRight, Minus, Plus, Trash2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CartItem } from '../types';
import { formatPrice, cn } from '../lib/utils';

interface CartViewProps {
  items: CartItem[];
  onUpdateQuantity: (id: string, delta: number) => void;
  onCheckout: () => void;
  onClearCart?: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  deliveryAddress?: string;
  hasActiveOrder?: boolean;
}

export default function CartView({ items, onUpdateQuantity, onCheckout, onClearCart, isOpen, setIsOpen, deliveryAddress, hasActiveOrder }: CartViewProps) {
  const [showClearConfirm, setShowClearConfirm] = React.useState(false);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const deliveryFee = subtotal > 0 ? 40 : 0;
  const taxes = subtotal * 0.05;
  const total = subtotal + deliveryFee + taxes;

  if (totalItems === 0) return null;

  return (
    <>
      {/* Sticky Bottom Bar */}
      <div 
        className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-6 pt-2 bg-gradient-to-t from-white via-white to-transparent"
        onClick={() => setIsOpen(true)}
      >
        <motion.div 
          layoutId="cart-bar"
          className="bg-emerald-600 text-white p-4 rounded-2xl flex items-center justify-between shadow-2xl cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg relative">
              <ShoppingBag className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 bg-white text-emerald-600 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {totalItems}
              </span>
            </div>
            <div>
              <p className="text-xs font-medium opacity-90">{totalItems} Item{totalItems > 1 ? 's' : ''}</p>
              <p className="font-bold">{formatPrice(subtotal)}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div 
              className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setShowClearConfirm(true);
              }}
            >
              <Trash2 className="w-5 h-5 text-emerald-100" />
            </div>
            <div className="flex items-center gap-1 font-bold">
              VIEW CART <ChevronRight className="w-5 h-5" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Cart Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/60 z-50"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[32px] z-[60] max-h-[85vh] flex flex-col"
            >
              <div className="p-4 border-b sticky top-0 bg-white z-10 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">My Cart</h2>
                  {deliveryAddress && (
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest line-clamp-1">
                      Delivering in <span className="text-rose-600">{deliveryAddress}</span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setShowClearConfirm(true)}
                    className="p-2.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all"
                    title="Clear Cart"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button onClick={() => setIsOpen(false)} className="p-2.5 text-gray-400 hover:bg-gray-100 rounded-2xl transition-all">
                    <ChevronUp className="w-6 h-6 rotate-180" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-32">
                <div className="space-y-4">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between group">
                      <div className="flex-1 min-w-0 pr-4">
                         <div className="flex items-center gap-2">
                           <div className={cn("w-3 h-3 border flex items-center justify-center", item.category.toLowerCase().includes('starter') ? 'border-green-600' : 'border-red-600')}>
                             <div className={cn("w-1.5 h-1.5 rounded-full", item.category.toLowerCase().includes('starter') ? 'bg-green-600' : 'bg-red-600')} />
                           </div>
                           <p className="font-bold text-gray-900 group-hover:text-rose-600 transition-colors uppercase text-xs tracking-wide">{item.name}</p>
                         </div>
                         <p className="text-sm font-medium text-gray-500 mt-0.5">{formatPrice(item.price)}</p>
                      </div>
                      
                      <div className="flex items-center gap-3 bg-rose-50 border border-rose-100 rounded-lg p-1 shrink-0">
                        <button 
                          onClick={(e) => { e.stopPropagation(); onUpdateQuantity(item.id, -1); }}
                          className="w-7 h-7 flex items-center justify-center text-rose-600 font-bold hover:bg-rose-100 rounded transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5 stroke-[3]" />
                        </button>
                        <span className="text-sm font-bold w-4 text-center">{item.quantity}</span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onUpdateQuantity(item.id, 1); }}
                          className="w-7 h-7 flex items-center justify-center text-rose-600 font-bold hover:bg-rose-100 rounded transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Subtotal</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Delivery Fee</span>
                    <span>{formatPrice(deliveryFee)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Taxes (5% GST)</span>
                    <span>{formatPrice(taxes)}</span>
                  </div>
                  <div className="h-px bg-gray-200 my-2" />
                  <div className="flex justify-between text-lg font-bold text-gray-900">
                    <span>Grand Total</span>
                    <span>{formatPrice(total)}</span>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-white border-t sticky bottom-0">
                <button 
                  onClick={onCheckout}
                  disabled={hasActiveOrder}
                  className={cn(
                    "w-full h-14 rounded-2xl font-bold text-lg shadow-xl transition-all active:scale-95",
                    hasActiveOrder 
                      ? "bg-gray-200 text-gray-400 shadow-none cursor-not-allowed" 
                      : "bg-rose-600 text-white shadow-rose-200 focus:ring-4 focus:ring-rose-200"
                  )}
                >
                  {hasActiveOrder ? 'Active Order in Progress' : `Place Order • ${formatPrice(total)}`}
                </button>
                {hasActiveOrder && (
                  <p className="text-[10px] text-center mt-3 text-gray-400 font-bold uppercase tracking-tight">
                    You can only place one order at a time.
                  </p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Clear Cart Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowClearConfirm(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[32px] p-8 relative z-10 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-rose-500" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Clear your cart?</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-8">
                Are you sure you want to remove all items from your cart? This action cannot be undone.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="py-4 rounded-2xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    onClearCart?.();
                    setShowClearConfirm(false);
                    setIsOpen(false);
                  }}
                  className="py-4 rounded-2xl font-bold text-white bg-rose-600 shadow-lg shadow-rose-200 hover:bg-rose-700 transition-colors"
                >
                  Yes, Clear
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
