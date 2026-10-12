// Online menu starts empty until its backend is connected.
// Status labels describe the UI workflow; they are not sample orders.
const CUSTOMER_DATA = {
  categories: ["All"],
  menuItems: [],
  orderStatuses: [
    {
      key: "Received",
      title: "Received",
      description: "Your order has been submitted and is waiting for cashier payment confirmation.",
    },
    {
      key: "Preparing",
      title: "Preparing",
      description: "The staff is preparing your food and drinks.",
    },
    {
      key: "Ready",
      title: "Ready",
      description: "Your order is ready for pickup or delivery coordination.",
    },
    {
      key: "Served",
      title: "Served",
      description: "Your order has been served. Thank you for ordering.",
    },
  ],
};
