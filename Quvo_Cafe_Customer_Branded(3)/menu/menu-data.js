// Approved dine-in sessions load available menu records from SQL through the protected API.
// Status labels describe the UI workflow; they are not sample orders.
const CUSTOMER_DATA = {
  tableNumber: "",
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
      description: "Your order is ready and will be served to your table.",
    },
    {
      key: "Served",
      title: "Served",
      description: "Your order has been served. Thank you for ordering.",
    },
  ],
};
