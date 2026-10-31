// Shared menu taxonomy. Stored codes stay stable; labels are for display only.
(() => {
  const choices = [{"id":"hot-coffee","label":"Hot Coffee"},{"id":"cold-coffee","label":"Cold Coffee"},{"id":"ice-blend","label":"Ice Blend"},{"id":"frappe","label":"Frappe"},{"id":"tea","label":"Tea"},{"id":"non-coffee","label":"Non Coffee"},{"id":"meal-sets","label":"Meal Sets"},{"id":"pasta","label":"Pasta"},{"id":"refresher","label":"Refresher"},{"id":"appetizer","label":"Appetizer"},{"id":"sandwiches","label":"Sandwiches"},{"id":"pizza","label":"Pizza"}];
  const labels = new Map(choices.map(row => [row.id, row.label]));
  const drinks = ["coffee","hot-coffee","cold-coffee","ice-blend","frappe","tea","non-coffee","refresher"], foods = ["food","sandwich","meal","snack","pastry","pasta","dessert","meal-sets","appetizer","sandwiches","pizza"];
  function label(id) { return labels.get(id) || String(id || '').split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '); }
  // Keep existing categories visible until an admin reclassifies each item.
  function filters(items, all = 'All') {
    const known = choices.map(row => row.id), used = [...new Set(items.map(row => row.category))];
    return [all, ...known, ...used.filter(id => !known.includes(id))];
  }
  window.QuvoMenuCategories = { choices, label, filters,
    isDrink: id => drinks.includes(String(id).toLowerCase()),
    isFood: id => foods.includes(String(id).toLowerCase()) };
})();
