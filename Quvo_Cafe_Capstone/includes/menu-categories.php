<?php
declare(strict_types=1);
const QUVO_MENU_CATEGORIES = ['hot-coffee','cold-coffee','ice-blend','frappe','tea','non-coffee','meal-sets','pasta','refresher','appetizer','sandwiches','pizza'];
const QUVO_LEGACY_MENU_CATEGORIES = ['coffee','food','pastry'];
const QUVO_DRINK_CATEGORIES = ['coffee','hot-coffee','cold-coffee','ice-blend','frappe','tea','non-coffee','refresher'];
const QUVO_KITCHEN_CATEGORIES = ['food','sandwich','meal','snack','pastry','pasta','dessert','meal-sets','appetizer','sandwiches','pizza'];
function menu_category_is_drink(string $category): bool { return in_array($category, QUVO_DRINK_CATEGORIES, true); }
