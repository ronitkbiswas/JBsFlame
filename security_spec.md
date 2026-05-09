# Security Specification - JB's Flame

## Data Invariants
1. A user profile must correspond to the authenticated UID.
2. Only Admins can modify the menu.
3. Users can only read their own orders.
4. Admins can manage all orders.
5. Order status can only be moved to terminal states ('Delivered', 'Cancelled') once.

## The Dirty Dozen Payloads (Denied)
1. Creating a user profile for a different UID.
2. Setting `role: 'admin'` on self-signup.
3. Updating a menu item as a customer.
4. Reading another user's order document.
5. Listing orders without a userId filter (as a customer).
6. Creating an order with a massive string as ID.
7. Updating an order's `total` after it's been placed.
8. Injecting a ghost field `isVerified: true` into a menu item.
9. Changing the `createdAt` timestamp on an update.
10. Deleting a user profile (forbidden).
11. Setting own `role` to `admin` via profile update.
12. Accessing PII (email) of another user.

## Permissions Map
- `users/{userId}`: Read (Owner/Admin), Create (Owner, role='customer'), Update (Owner, role unchanged).
- `menu_items/{itemId}`: Read (Public), Write (Admin).
- `orders/{orderId}`: Create (Auth, owner), Read (Owner/Admin), Update (Admin for status; Owner for cancellation).
