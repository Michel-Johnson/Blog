from pathlib import Path
import json,re,hashlib
root=Path('/Users/bytedance/ui')
mapping=json.loads((root/'kenji-page-map.json').read_text())
manifest=json.loads((root/'vendor/kenjiendo_live/pages/manifest.json').read_text())
manifest.setdefault('http://kenjiendo.com/contact/', {'file':'vendor/kenjiendo_original/contact.html','local':'kenji-exact-contact.html'})
url_to_local={u:v['local'] for u,v in manifest.items() if v.get('local')}
asset_rewrites=[
("http://kenjiendo.com/wp/wp-content/plugins/contact-form-7/includes/css/styles.css?ver=4.4.2","./vendor/kenjiendo_wp/contact-form-7/includes/css/styles.css?ver=4.4.2"),
("http://kenjiendo.com/wp/wp-content/plugins/contact-form-7/includes/js/jquery.form.min.js?ver=3.51.0-2014.06.20","./vendor/kenjiendo_wp/contact-form-7/js/jquery.form.min.js?ver=3.51.0-2014.06.20"),
("http://kenjiendo.com/wp/wp-content/plugins/contact-form-7/includes/js/scripts.js?ver=4.4.2","./vendor/kenjiendo_wp/contact-form-7/js/scripts.js?ver=4.4.2"),
("http://kenjiendo.com/wp/wp-includes/js/jquery/jquery.js?ver=1.12.4","./vendor/kenjiendo_wp/jquery/jquery.js?ver=1.12.4"),
("http://kenjiendo.com/wp/wp-includes/js/jquery/jquery-migrate.min.js?ver=1.4.1","./vendor/kenjiendo_wp/jquery/jquery-migrate.min.js?ver=1.4.1"),
("http://kenjiendo.com/wp/wp-includes/js/wp-embed.min.js?ver=4.5.32","./vendor/kenjiendo_wp/wp-includes/js/wp-embed.min.js?ver=4.5.32"),
("http://kenjiendo.com/wp/wp-content/themes/kenjiendo_v1/common/img/favicon.ico","./vendor/kenjiendo_v1/common/img/favicon.ico"),
("http://kenjiendo.com/wp/wp-content/themes/kenjiendo_v2/css/style.css","./vendor/kenjiendo_v2/css/style.css"),
("http://kenjiendo.com/wp/wp-content/themes/kenjiendo_v2/js/script.js","./vendor/kenjiendo_v2/js/script-local.js"),
("http://kenjiendo.com/wp/wp-content/themes/kenjiendo_v2","./vendor/kenjiendo_v2"),
("http://kenjiendo.com/wp/wp-content/uploads","./vendor/kenjiendo_wp/uploads"),
("http://kenjiendo.com/testsite/wp-content/themes/kenjiendo_v2","./vendor/kenjiendo_v2"),
("http://kenjiendo.com/testsite/wp-content/uploads/sites/2","./vendor/kenjiendo_wp/uploads"),
("http://kenjiendo.com/testsite/wp-content/uploads","./vendor/kenjiendo_wp/uploads"),
]
# do not rewrite api/canonical/oembed metadata; it was restored verbatim from source
skip_prefixes=('http://kenjiendo.com/wp-json','http://kenjiendo.com/?p=')
for u,local in sorted(url_to_local.items(), key=lambda kv: len(kv[0]), reverse=True):
    asset_rewrites.append((u,'./'+local))

URL_END = r'(?=$|[\"\'<>\s)])'

def replace_url_token(s, old, new):
    return re.sub(re.escape(old) + URL_END, new, s)

def transform(s):
    for old,new in asset_rewrites:
        if old in skip_prefixes: continue
        if old.startswith('http://kenjiendo.com/') and new.startswith('./kenji-exact-'):
            s=replace_url_token(s,old,new)
            s=replace_url_token(s,old.replace('&','&#038;'),new)
        else:
            s=s.replace(old,new)
            s=s.replace(old.replace('&','&#038;'),new)
    s=s.replace('http:\\/\\/kenjiendo.com\\/wp\\/wp-content\\/plugins\\/contact-form-7\\/images\\/ajax-loader.gif', '.\\/vendor\\/kenjiendo_wp\\/contact-form-7\\/images\\/ajax-loader.gif')
    s=s.replace('http:\\/\\/kenjiendo.com\\/wp\\/wp-includes\\/js\\/wp-emoji-release.min.js?ver=4.5.32', '.\\/vendor\\/kenjiendo_wp\\/wp-includes\\/js\\/wp-emoji-release.min.js?ver=4.5.32')
    s=s.replace('http://kenjiendo.com/wp/wp-includes/js/wp-emoji-release.min.js?ver=4.5.32', './vendor/kenjiendo_wp/wp-includes/js/wp-emoji-release.min.js?ver=4.5.32')
    s=s.replace('data-src="/img/kenjiendo2.png"','data-src="./vendor/kenjiendo_v2/img/kenjiendo2.png"')
    return s

def norm(s):
    s=transform(s)
    # Sort the small WP link metadata cluster because earlier rebuilds removed/reinserted metadata after prev/next.
    def sort_head_cluster(m):
        lines=[x.strip() for x in m.group(0).split('\n') if x.strip()]
        return '\n'.join(sorted(lines))
    # only sort consecutive <link rel=...> block after jquery migrate before recentcomments-ish area
    s=re.sub(r"((?:\s*<link rel=(?:'|\")[^>]+>\s*){2,8})", sort_head_cluster, s, count=3)
    s=re.sub(r'\s+', ' ', s).replace('> <','><')
    return s.strip()
rows=[]
for e,r in sorted(mapping.items()):
    es=(root/e).read_text(errors='ignore'); rs=(root/r).read_text(errors='ignore')
    ne,nr=norm(es),norm(rs)
    rows.append({'exact':e,'ref':r,'normalized_equal':ne==nr,'len_exact_norm':len(ne),'len_ref_norm':len(nr),'contains_old_custom': any(tok in es for tok in ['./styles.css','home.js','blog-theme.js','gallery-profile-card','gallery-name-wire','kenji-real-text','kenji-original-text']),'wpjson_ref':'wp-json' in rs,'wpjson_exact':'wp-json' in es,'emoji_ref':'window._wpemojiSettings' in rs,'emoji_exact':'window._wpemojiSettings' in es,'ga_ref':'google-analytics.com/analytics.js' in rs,'ga_exact':'google-analytics.com/analytics.js' in es})
summary={'total':len(rows),'normalized_equal':sum(x['normalized_equal'] for x in rows),'not_equal':sum(not x['normalized_equal'] for x in rows),'old_custom_contamination':sum(x['contains_old_custom'] for x in rows),'wpjson_missing_where_ref_has':sum(x['wpjson_ref'] and not x['wpjson_exact'] for x in rows),'emoji_missing_where_ref_has':sum(x['emoji_ref'] and not x['emoji_exact'] for x in rows),'ga_missing_where_ref_has':sum(x['ga_ref'] and not x['ga_exact'] for x in rows)}
(root/'kenji-normalized-compare-report.json').write_text(json.dumps({'summary':summary,'rows':rows},ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False,indent=2))
for x in rows:
    if not x['normalized_equal']:
        print('DIFF',x['exact'],'len',x['len_exact_norm'],x['len_ref_norm'])
        break
