<?php
declare(strict_types=1);

function menu_default_groups(string $category):array {
    if(!in_array($category,['coffee','non-coffee'],true))return [];
    return [
        ['id'=>'sugar-level','label'=>'Sugar level','type'=>'select','required'=>true,'default'=>'sugar-100','choices'=>array_map(fn($n)=>['id'=>'sugar-'.$n,'label'=>$n.'%'],[100,75,50,25,0])],
        ['id'=>'ice-level','label'=>'Ice level','type'=>'select','required'=>true,'default'=>'ice-regular','choices'=>[
            ['id'=>'ice-regular','label'=>'Regular ice'],['id'=>'ice-less','label'=>'Less ice'],['id'=>'ice-none','label'=>'No ice'],['id'=>'ice-hot','label'=>'Hot'],
        ]],
    ];
}
function menu_option_id(mixed $value):string {
    if(!is_string($value)||!preg_match('/\A[a-zA-Z0-9_-]{1,40}\z/',$value))throw new OrderError('An option or choice has an invalid identifier.');
    return $value;
}
function menu_validate_groups(mixed $groups):array {
    if(!is_array($groups)||!array_is_list($groups)||count($groups)>10)throw new OrderError('Add up to 10 option groups per menu item.');
    $result=[];$ids=[];$labels=[];
    foreach($groups as $group){
        if(!is_array($group))throw new OrderError('Invalid menu option group.');
        $id=menu_option_id($group['id']??null);$label=orders_text($group['label']??null,80,true);
        if(isset($ids[$id])||in_array(strtolower($label),$labels,true))throw new OrderError('Use a different name for each option group.');
        if(!in_array($group['type']??null,['radio','select'],true)||!is_bool($group['required']??null))throw new OrderError('Choose Radio buttons or Dropdown for each group.');
        $choices=$group['choices']??null;
        if(!is_array($choices)||!array_is_list($choices)||count($choices)<1||count($choices)>20)throw new OrderError('Add between 1 and 20 choices to each option group.');
        $clean=[];$choiceIds=[];$choiceLabels=[];
        foreach($choices as $choice){
            if(!is_array($choice))throw new OrderError('Invalid option choice.');
            $choiceId=menu_option_id($choice['id']??null);$choiceLabel=orders_text($choice['label']??null,80,true);
            if(isset($choiceIds[$choiceId])||in_array(strtolower($choiceLabel),$choiceLabels,true))throw new OrderError('Use different choices within an option group.');
            $choiceIds[$choiceId]=true;$choiceLabels[]=strtolower($choiceLabel);$clean[]=['id'=>$choiceId,'label'=>$choiceLabel];
        }
        $default=$group['default']??'';
        if(!is_string($default)||($default!==''&&!isset($choiceIds[$default])))throw new OrderError('Choose an existing default choice or No default.');
        $ids[$id]=true;$labels[]=strtolower($label);
        $result[]=['id'=>$id,'label'=>$label,'type'=>$group['type'],'required'=>$group['required'],'default'=>$default,'choices'=>$clean];
    }
    return $result;
}
function menu_groups(array $row):array {
    $json=$row['option_groups_json']??null;
    return $json===null?menu_default_groups($row['category']):json_decode($json,true,32,JSON_THROW_ON_ERROR);
}
function menu_options_version(array $row):string {
    return hash('sha256',json_encode(menu_groups($row),JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
}
function menu_selection_input(mixed $value):array {
    if(!is_array($value)||($value!==[]&&array_is_list($value))||count($value)>10)throw new OrderError('Invalid menu selections.');
    $result=[];
    foreach($value as $id=>$choice){$id=menu_option_id((string)$id);if($choice!=='')$result[$id]=menu_option_id($choice);}
    ksort($result);return $result;
}
function menu_custom_json(array $custom):string {
    $json=json_encode($custom,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
    if(strlen(iconv('UTF-8','UTF-16LE',$json))>8000)throw new OrderError('The selected option labels are too long. Ask an admin to shorten them.');
    return $json;
}
function menu_selected_customization(array $row,array $custom):array {
    if(!array_key_exists('options',$custom)){
        if(($row['option_groups_json']??null)!==null)throw new OrderError('Menu options have changed. Refresh the menu and choose your options.',409,'options_changed');
        return $custom;
    }
    if(!is_string($custom['optionsVersion']??null)||!hash_equals(menu_options_version($row),$custom['optionsVersion']))throw new OrderError('Menu options have changed. Refresh the menu and review your choices.',409,'options_changed');
    $selected=$custom['options'];$snapshot=[];
    foreach(menu_groups($row) as $group){
        $choice=$selected[$group['id']]??'';unset($selected[$group['id']]);
        if($choice===''){if($group['required'])throw new OrderError('Choose '.$group['label'].' for '.$row['item_name'].'.',409,'options_changed');continue;}
        $match=null;foreach($group['choices'] as $option)if($option['id']===$choice){$match=$option;break;}
        if(!$match)throw new OrderError('A menu choice has changed. Refresh the menu and choose again.',409,'options_changed');
        $snapshot[]=['id'=>$group['id'],'label'=>$group['label'],'choiceId'=>$match['id'],'value'=>$match['label']];
    }
    if($selected!==[])throw new OrderError('An option is no longer offered. Refresh the menu.',409,'options_changed');
    return ['size'=>'Not applicable','sugarLevel'=>'Not applicable','iceLevel'=>'Not applicable','options'=>$snapshot];
}
