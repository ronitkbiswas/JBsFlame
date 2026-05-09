import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db, auth } from './firebase';

const SAMPLE_DATA = [
  {
    name: "Classic Paneer Tikka",
    category: "Starters",
    price: 320,
    description: "Cottage cheese chunks marinated in spiced yogurt and grilled in tandoor.",
    imageUrl: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&q=80&w=400",
    available: true
  },
  {
    name: "Hara Bhara Kebab",
    category: "Starters",
    price: 280,
    description: "Crispy spinach and green pea patties served with mint chutney.",
    imageUrl: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&q=80&w=400",
    available: true
  },
  {
    name: "Chicken Reshmi Kebab",
    category: "Starters",
    price: 450,
    description: "Silky smooth chicken breasts marinated in cream, cheese and cashew paste.",
    imageUrl: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&q=80&w=400",
    available: true
  },
  {
    name: "Aloo Biryani",
    category: "Main Course",
    price: 380,
    description: "Aromatic basmati rice cooked with perfectly spiced potatoes in traditional style.",
    imageUrl: "https://images.unsplash.com/photo-1589302168068-1c499118f919?auto=format&fit=crop&q=80&w=400",
    available: true
  },
  {
    name: "Mutton Kosha",
    category: "Main Course",
    price: 650,
    description: "Slow cooked tender mutton in a rich, dark and spicy gravy.",
    imageUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=400",
    available: true
  },
  {
    name: "Butter Garlic Naan",
    category: "Breads",
    price: 85,
    description: "Soft leavened bread cooked in clay oven and topped with fresh garlic and butter.",
    imageUrl: "https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&q=80&w=400",
    available: true
  },
  {
    name: "Laccha Paratha",
    category: "Breads",
    price: 65,
    description: "Layered flaky whole wheat bread cooked on a flat griddle.",
    imageUrl: "https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&q=80&w=400",
    available: true
  }
];

export async function seedMenu() {
  // Only attempt seeding if the user is the bootstrap admin and email is verified
  if (auth.currentUser?.email !== 'ronitkbiswas@gmail.com') return;

  try {
    const menuRef = collection(db, 'menu_items');
    const snapshot = await getDocs(menuRef);
    
    if (snapshot.empty) {
      console.log('Seeding menu data...');
      for (const item of SAMPLE_DATA) {
        await addDoc(menuRef, { ...item, createdAt: new Date() });
      }
      console.log('Seeding complete!');
    }
  } catch (error) {
    console.warn('Seeding failed (likely permission denied):', error);
  }
}
