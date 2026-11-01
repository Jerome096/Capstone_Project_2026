<?php
declare(strict_types=1);

// Small, dependency-free OOXML writer. Values are explicitly typed; user text is never a formula.
function audit_xml(string $value):string {
    $value=preg_replace('/[^\x{9}\x{A}\x{D}\x{20}-\x{D7FF}\x{E000}-\x{FFFD}\x{10000}-\x{10FFFF}]/u','',$value)??'';
    return htmlspecialchars($value,ENT_XML1|ENT_QUOTES,'UTF-8');
}
function audit_zip(array $files):string {
    $body='';$directory='';$count=0;
    foreach($files as $name=>$bytes){
        $compressed=gzdeflate($bytes,6);if($compressed===false)throw new RuntimeException('Workbook compression failed.');
        $offset=strlen($body);$crc=crc32($bytes);$size=strlen($bytes);$length=strlen($compressed);$n=strlen($name);
        $body.=pack('VvvvvvVVVvv',0x04034b50,20,0,8,0,33,$crc,$length,$size,$n,0).$name.$compressed;
        $directory.=pack('VvvvvvvVVVvvvvvVV',0x02014b50,20,20,0,8,0,33,$crc,$length,$size,$n,0,0,0,0,0,$offset).$name;$count++;
    }
    return $body.$directory.pack('VvvvvVVv',0x06054b50,0,0,$count,$count,strlen($directory),strlen($body),0);
}
function audit_column(int $n):string {$s='';while($n>0){$n--;$s=chr(65+$n%26).$s;$n=intdiv($n,26);}return $s;}
function audit_number(string|int $amount):array {return ['number'=>(string)$amount];}
function audit_local(?string $time):string {return $time?(new DateTimeImmutable($time,new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Asia/Manila'))->format('Y-m-d H:i:s'):'';}
function audit_workbook(array $report,string $id,string $actor):string {
    $tabs=[];
    $rows=[['Business date','Order','Source','Status at cutoff','Status basis','Placed Manila','Paid Manila','Served Manila','Method code','Method label snapshot','Label basis','Payment ID','Order value PHP','Collected PHP','Tender PHP','Change PHP','Item total PHP','Payment reference','Approved by','QR version used','EOD closure','Cancellation reason']];
    foreach($report['orders'] as $o)$rows[]=[$o['business_date'],$o['order_number'],$o['order_source'],$o['audit_status'],$o['status_basis'],audit_local($o['created_at']),audit_local($o['paid_at']),audit_local($o['served_at']),$o['payment_method']??'',$o['method_label']??'',$o['label_basis'],$o['payment_id']??'',audit_number($o['total_amount']),audit_number($o['amount_applied']),audit_number($o['amount_received']),audit_number($o['change_amount']),audit_number($o['item_total']),$o['payment_reference']??'',$o['approved_by']??'',$o['qr_version']??'',$o['closure_id']!==null?(string)$o['closure_id']:'',$o['cancellation_reason']??''];$tabs['Sales Register']=$rows;
    $rows=[['Order','Line','Category','Item snapshot','Quantity','Unit price PHP','Line total PHP','Customization snapshot','Item notes']];
    foreach($report['items'] as $i)$rows[]=[$i['order_number'],audit_number($i['line_number']),$i['category'],$i['item_name'],audit_number($i['quantity']),audit_number($i['unit_price']),audit_number($i['line_total']),$i['customization_json'],$i['notes']];$tabs['Item Detail']=$rows;
    $rows=[['Business date','Store-wide cash collections PHP','Opening PHP','Other cash in PHP','Refunds PHP','Other cash out PHP','Drops PHP','Counted PHP','Expected PHP','Over or short PHP','Evidence','Note','Revision','Recorded by','Saved Manila','Comparable with filters']];
    foreach($report['cash'] as $c){$p=$c['entry']['payload']??[];$row=[$c['date'],audit_number($c['collection'])];foreach(['opening','cashIn','refunds','cashOut','drops','counted'] as $k)$row[]=isset($p[$k])?audit_number($p[$k]):'';$row[]=$c['expected']!==null?audit_number($c['expected']):'';$row[]=$c['variance']!==null?audit_number($c['variance']):'';$rows[]=array_merge($row,[$p['evidence']??'',$p['note']??'',(string)($c['entry']['revision']??''),$c['entry']['actor']??'',audit_local($c['entry']['created_at']??null),$c['comparable']?'yes':'store-wide only; filtered sales differ']);}$tabs['Cash Reconciliation']=$rows;
    $rows=[['Exception ID','Business date','Type','Record','Issue','Amount for review PHP (not additive)','Explanation','Review status','Review note','Review evidence','Reviewed by','Review saved Manila']];
    foreach($report['exceptions'] as $e){$p=$e['review']['payload']??[];$rows[]=[$e['id'],$e['date'],$e['type'],$e['record'],$e['label'],audit_number($e['amount']),$e['detail'],$e['reviewStatus'],$p['note']??'',$p['evidence']??'',$e['review']['actor']??'',audit_local($e['review']['created_at']??null)];}$tabs['Exceptions']=$rows;
    $rows=[['Operation','EOD','Opening business date','Opened Manila','Closed Manila','Opened by','Closed by','Beginning cash PHP','Cash collections PHP','All-method collections PHP','Other cash in PHP','Payouts PHP','Cash drops PHP','Expected cash PHP','Declared count PHP','Difference PHP','Cash status','Frozen closing record JSON']];
    foreach($report['cashOperations']??[] as $r){$row=[$r['operationId'],$r['closureId'],$r['businessDate'],audit_local($r['openedAt']),audit_local($r['closedAt']),$r['openedBy'],$r['closedBy']];foreach(['openingCash','cashSales','totalSales','otherCashIn','cashPayouts','cashDrops','expectedCash','actualCash','cashDifference'] as $field)$row[]=audit_number($r[$field]);$rows[]=array_merge($row,[$r['cashStatus'],json_encode($r,JSON_THROW_ON_ERROR)]);}$tabs['EOD Cash Operations']=$rows;
    $rows=[['Approval ID','Approved Manila','Action','Movement / order ID','Operation ID','Amount PHP','Requested by','Approved by','Reason','Evidence','Scope']];
    foreach($report['actionApprovals']??[] as $r){$d=json_decode($r['details_json'],true,64,JSON_THROW_ON_ERROR);$rows[]=[(string)$r['approval_id'],audit_local($r['approved_at']),$r['action'],$r['entity_key'],(string)($d['operationId']??''),isset($d['amount'])?audit_number($d['amount']):'',$r['requested_by_name'],$r['approved_by_name'],$d['reason']??$d['note']??'',$d['evidence']??'','All approved actions in selected business window; independent of sales method/source filters.'];}$tabs['Admin Approvals']=$rows;
    return audit_xlsx($tabs);
}
function audit_xlsx(array $tabs):string {
    $ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';$rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';$header='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';$files=[];$sheetRefs='';$links='';$types='';$i=0;
    foreach($tabs as $name=>$rows){$i++;$sheetRefs.='<sheet name="'.audit_xml($name).'" sheetId="'.$i.'" r:id="s'.$i.'"/>';$links.='<Relationship Id="s'.$i.'" Type="'.$rel.'/worksheet" Target="worksheets/sheet'.$i.'.xml"/>';$types.='<Override PartName="/xl/worksheets/sheet'.$i.'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        $xml='';$max=1;
        foreach($rows as $ri=>$row){$xml.='<row r="'.($ri+1).'" ht="'.($ri===0?36:32).'" customHeight="1">';foreach($row as $ci=>$v){$ref=audit_column($ci+1).($ri+1);$max=max($max,$ci+1);$numeric=is_array($v)&&array_key_exists('number',$v);$style=$ri===0?1:($numeric?2:0);$xml.='<c r="'.$ref.'" s="'.$style.'"'.($numeric?'':' t="inlineStr"').'>'.($numeric?'<v>'.audit_xml($v['number']).'</v>':'<is><t xml:space="preserve">'.audit_xml((string)$v).'</t></is>').'</c>';}$xml.='</row>';}
        $files['xl/worksheets/sheet'.$i.'.xml']=$header.'<worksheet xmlns="'.$ns.'"><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="'.$max.'" width="27" customWidth="1"/></cols><sheetData>'.$xml.'</sheetData><autoFilter ref="A1:'.audit_column($max).max(1,count($rows)).'"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>';
    }
    $files['xl/workbook.xml']=$header.'<workbook xmlns="'.$ns.'" xmlns:r="'.$rel.'"><sheets>'.$sheetRefs.'</sheets></workbook>';
    $files['xl/_rels/workbook.xml.rels']=$header.'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'.$links.'<Relationship Id="styles" Type="'.$rel.'/styles" Target="styles.xml"/></Relationships>';
    $files['_rels/.rels']=$header.'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="'.$rel.'/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    $files['[Content_Types].xml']=$header.'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'.$types.'</Types>';
    $files['xl/styles.xml']=$header.'<styleSheet xmlns="'.$ns.'"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1D291F"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1"/></xf><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    return audit_zip($files);
}
