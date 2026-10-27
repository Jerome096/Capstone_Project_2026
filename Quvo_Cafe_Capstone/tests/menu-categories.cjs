const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const files=['Quvo_Cafe_Capstone/shared/js/menu-categories.js','Quvo_Cafe_Online_Ordering/shared/menu-categories.js','Quvo_Cafe_Customer_Branded(3)/shared/menu-categories.js','kitchen/shared/menu-categories.js'];
let checks=0;const check=(condition,label)=>{assert.ok(condition,label);checks++;};
for(const file of files){
 check(fs.readFileSync(path.join(root,file),'utf8')===fs.readFileSync(path.join(root,files[0]),'utf8'),'all applications share identical taxonomy');
 const context=vm.createContext({Intl});context.window=context;vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 const api=context.QuvoMenuCategories;check(api.choices.length===12,'twelve admin categories');
 for(const category of api.choices){check(api.label(category.id)===category.label,'readable label for '+category.id);check(api.isDrink(category.id)!==api.isFood(category.id),'exactly one preparation route for '+category.id);}
 check(api.filters([{category:'coffee'},{category:'pizza'},{category:'pizza'}]).length===14,'all new filters plus a legacy category without duplicates');
 check(api.isDrink('coffee')&&api.isFood('food')&&api.isFood('pastry'),'legacy order routes are preserved');
 check(api.label('non-coffee')==='Non Coffee'&&api.label('sandwiches')==='Sandwiches','labels use cafe category names');
}
const context=vm.createContext({Intl});context.window=context;
for(const file of ['Quvo_Cafe_Capstone/shared/js/menu-categories.js','Quvo_Cafe_Capstone/shared/js/menu-options.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
for(const category of context.QuvoMenuCategories.choices){const groups=context.QuvoMenuOptions.groups({category:category.id});check(context.QuvoMenuCategories.isDrink(category.id)?groups.length===2:groups.length===0,'default drink controls follow '+category.id);}
console.log('PASS: '+checks+' category-label, filter, legacy routing and drink-control checks.');
