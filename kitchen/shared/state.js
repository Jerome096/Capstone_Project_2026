// Kitchen records come only from authenticated SQL requests.
const KITCHEN_ITEM_CATEGORIES=["food","sandwich","meal","snack","pastry","pasta","dessert","meal-sets","appetizer","sandwiches","pizza"];
let orders=[];
let activeOrderId=null;
let searchTerm="";
let categoryFilter="all";
const kitchenSql={user:null,csrf:'',loading:false,changing:false,connected:false,revision:0};
