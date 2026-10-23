<?php
declare(strict_types=1);
require_once __DIR__.'/orders.php';

function website_content_defaults(): array
{
    return [
        'headline'=>'Good coffee.', 'accent'=>'Better company.',
        'intro'=>"For the catch-ups, the quiet afternoons, and the small breaks that make a day feel a little brighter. Welcome to Quvo Café.",
        'story'=>"Some of the best moments happen over something simple: a coffee, a comforting meal, a conversation with someone you haven't seen in a while.\n\nThat's the feeling behind this little corner of Quvo. A place to settle in, enjoy your favorites, and make time for the people and things that matter to you.",
        'address'=>'', 'hours'=>'', 'phone'=>'', 'email'=>'', 'social'=>'',
        'home_eyebrow'=>'Welcome to Quvo Café',
        'home_headline'=>"Your next coffee\nbreak starts", 'home_accent'=>'here.',
        'home_intro'=>'A good cup, a comforting bite, a moment just for you. Find your favorite and make a little room for Quvo.',
        'story_headline'=>"Come for a cup.\nStay for the", 'story_accent'=>'feeling.',
    ];
}

function website_content_limits(): array
{
    return ['headline'=>65,'accent'=>65,'intro'=>500,'story'=>4000,'address'=>500,'hours'=>500,'phone'=>50,'email'=>254,'social'=>500,'home_eyebrow'=>80,'home_headline'=>120,'home_accent'=>65,'home_intro'=>500,'story_headline'=>120,'story_accent'=>65];
}

function website_content_validate(mixed $input): array
{
    if (!is_array($input) || array_is_list($input)) throw new OrderError('Enter the website content.',422);
    $result=[];
    foreach (website_content_limits() as $field=>$limit) {
        $value=$input[$field]??(website_content_defaults()[$field]??'');
        if (!is_string($value) || preg_match('//u',$value)!==1 || str_contains($value,"\0")) throw new OrderError('Enter valid text for '.$field.'.',422);
        $value=trim(str_replace(["\r\n","\r"],"\n",$value));
        if (preg_match_all('/./us',$value)>$limit) throw new OrderError(ucfirst($field).' must be '.$limit.' characters or fewer.',422);
        $result[$field]=$value;
    }
    if ($result['headline']==='') throw new OrderError('Add an About page headline.',422);
    if ($result['home_headline']==='') throw new OrderError('Add a Home page headline.',422);
    if ($result['story_headline']==='') throw new OrderError('Add a cafe story section heading.',422);
    if ($result['email']!=='' && !filter_var($result['email'],FILTER_VALIDATE_EMAIL)) throw new OrderError('Enter a valid cafe email address.',422);
    if ($result['social']!=='') {
        $parts=parse_url($result['social']);
        if (!filter_var($result['social'],FILTER_VALIDATE_URL) || !is_array($parts) || !in_array(strtolower($parts['scheme']??''),['https','http'],true) || isset($parts['user']) || isset($parts['pass'])) throw new OrderError('Use a full https:// or http:// social link.',422);
    }
    return $result;
}

function website_content_merge(mixed $stored): array
{
    $content=website_content_defaults();
    foreach ($content as $key=>$value) if (isset($stored[$key]) && is_string($stored[$key])) $content[$key]=$stored[$key];
    return $content;
}

function website_content_read(PDO $db): array
{
    $defaults=website_content_defaults();
    if (!$db->query("SELECT OBJECT_ID('dbo.website_content','U')")->fetchColumn()) return ['content'=>$defaults,'version'=>null,'setupRequired'=>true];
    $row=$db->query('SELECT content_json,CONVERT(varchar(36),content_version) AS version FROM dbo.website_content WHERE content_id=1')->fetch();
    if (!$row) return ['content'=>$defaults,'version'=>null,'setupRequired'=>true];
    $stored=json_decode($row['content_json'],true,512,JSON_THROW_ON_ERROR);
    return ['content'=>website_content_merge($stored),'version'=>$row['version'],'setupRequired'=>false];
}

function website_content_actor(array $actor): void
{
    if (($actor['role']??null)!=='admin') throw new OrderError('Only admins can edit website content.',403);
}

// The caller owns the transaction. A version protects another admin's saved changes.
function website_content_save(PDO $db,array $actor,mixed $content,mixed $version): array
{
    website_content_actor($actor);
    if (!$db->inTransaction()) throw new LogicException('Website content updates require a transaction.');
    if (!is_array($content) || array_is_list($content)) throw new OrderError('Enter the website content.',422);
    if (!is_string($version) || !preg_match('/\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/i',$version)) throw new OrderError('Reload the current website content before saving.',409,'content_changed');
    $query=$db->query('SELECT content_json,CONVERT(varchar(36),content_version) version FROM dbo.website_content WITH (UPDLOCK,HOLDLOCK) WHERE content_id=1');
    $current=$query->fetch();$query->closeCursor();
    if (!$current || strcasecmp((string)$current['version'],$version)!==0) throw new OrderError('Another admin changed this page. Your draft is kept. Reload the saved content before saving again.',409,'content_changed');
    // Older open admin tabs omit newly added fields. Preserve saved text instead of resetting it.
    $stored=website_content_merge(json_decode($current['content_json'],true,512,JSON_THROW_ON_ERROR));
    $content=website_content_validate(array_replace($stored,$content));
    $db->prepare('UPDATE dbo.website_content SET content_json=?,content_version=NEWID(),updated_by_staff_id=?,updated_at=SYSUTCDATETIME() WHERE content_id=1')
        ->execute([json_encode($content,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),(int)$actor['staff_id']]);
    $db->prepare("INSERT dbo.system_audit_log(actor_staff_id,action,entity_type,entity_key,details_json) VALUES(?,'website_content_updated','website_content','about',?)")
        ->execute([(int)$actor['staff_id'],json_encode(['fields'=>array_keys($content)],JSON_THROW_ON_ERROR)]);
    return website_content_read($db);
}
