export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'customer' | 'admin';
  phoneNumber?: string;
  createdAt: any;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  available: boolean;
  createdAt: any;
}

export type OrderStatus = 'Pending' | 'Accepted' | 'Preparing' | 'Ready' | 'Out for Delivery' | 'Delivered' | 'Cancelled' | 'Rejected';

export interface CartItem extends MenuItem {
  quantity: number;
}

export interface Order {
  id: string;
  userId: string;
  userName?: string;
  userPhone?: string;
  items: CartItem[];
  status: OrderStatus;
  total: number;
  address: {
    lat: number;
    lng: number;
    label: string;
    addressDetails?: string;
    receiverName?: string;
    receiverPhone?: string;
  };
  createdAt: any;
  updatedAt: any;
  cancellationRequested?: boolean;
}

export type AddressType = 'Home' | 'Work' | 'Other';

export interface SavedAddress {
  id?: string;
  userId: string;
  label: string;
  addressText: string;
  addressDetails?: string;
  receiverName?: string;
  receiverPhone?: string;
  lat: number;
  lng: number;
  type: AddressType;
  isDefault: boolean;
  createdAt: any;
}
