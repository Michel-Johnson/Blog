(() => {
  const en = new URLSearchParams(location.search).get('lang') === 'en';
  document.documentElement.lang = en ? 'en' : 'zh-CN';
  const readerPaths = new Set(['/', '/index.html', '/post.html', '/book.html']);
  function href(value, language = en ? 'en' : 'zh') {
    const url = new URL(value, location.href);
    if (url.origin === location.origin && readerPaths.has(url.pathname)) {
      if (language === 'en') url.searchParams.set('lang','en'); else url.searchParams.delete('lang');
    }
    return url.href;
  }
  const nav = document.querySelector('.nav-links, .book-nav');
  const switcher = document.createElement('a');
  switcher.className = 'language-switch';
  switcher.href = href(location.href,en ? 'zh' : 'en');
  switcher.textContent = en ? '中文' : 'English';
  switcher.lang = en ? 'zh-CN' : 'en';
  switcher.setAttribute('aria-label',en ? 'Read in Chinese' : 'Read in English');
  nav?.append(switcher);
  for (const language of ['zh','en']) {
    const alternate = document.createElement('link');
    alternate.rel = 'alternate'; alternate.hreflang = language === 'zh' ? 'zh-CN' : 'en';
    alternate.href = href(location.href,language); document.head.append(alternate);
  }
  if (en) {
    if (document.querySelector('[data-book-title]')) document.title = 'Contents · Michel Johnson';
    document.querySelector('.book-note')?.setAttribute('aria-label','Reading guide');
    const labels = {
      '[data-book-title]':'Loading contents…',
      '.book-hero .book-kicker':'Book · Reading series',
      '.book-back':'Back to bookshelf',
      '.book-note strong':'Continue reading from where you left off.',
      '.book-note small':'Reading progress is saved on this device.',
      '#book-index-title':'Chapters',
      '.book-index-heading > span':'Read in order, or start with any chapter.',
      '[data-book-empty]':'This book has no published chapters yet.'
    };
    Object.entries(labels).forEach(([selector,text])=>{const node=document.querySelector(selector);if(node)node.textContent=text;});
  }
  function localizeLinks(root) {
    if (!root.querySelectorAll) return;
    const links = [...root.querySelectorAll('a[href]')];
    if (root.matches?.('a[href]')) links.push(root);
    links.filter(link=>link !== switcher && !link.hasAttribute('data-original-language')).forEach(link=>{const next=href(link.href);if(next!==link.href)link.href=next;});
  }
  localizeLinks(document.body);
  new MutationObserver(records=>records.forEach(record=>record.type==='attributes' ? localizeLinks(record.target) : record.addedNodes.forEach(localizeLinks)))
    .observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['href']});

  // Capture dynamic links too, including shelf entries rendered after startup.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (link && link !== switcher && !link.hasAttribute('data-original-language')) link.href = href(link.href);
  },true);
  function notice(message) {
    const note = document.createElement('div');
    note.className = 'translation-notice';
    note.setAttribute('role','status');
    note.append(document.createTextNode(message+' '));
    const original = document.createElement('a');
    original.href = href(location.href,'zh');
    original.textContent = 'Read Chinese original';
    original.setAttribute('data-original-language','');
    note.append(original);
    const refresh = document.createElement('a');
    refresh.href = location.href; refresh.textContent = 'Refresh';
    note.append(document.createTextNode(' · '),refresh);
    const anchor = document.querySelector('#post-content, [data-book-summary], #all-posts-list, #blog-title');
    anchor?.before(note);
  }
  async function load() {
    if (!en) return;
    const chinese = value => /[\u3400-\u9fff]/u.test(String(value || ''));
    function englishPost(post, entry, index) {
      const readable = entry?.status === 'ready' || entry?.hasPreviousEdition;
      const translated = {...post,translationStatus:readable ? 'ready' : entry?.status || 'pending',originalTitle:post.title};
      for (const key of ['title','excerpt','bookTitle','category','tags']) if (entry?.[key] !== undefined) translated[key]=entry[key];
      if (chinese(translated.title)) translated.title = `Article ${index + 1}`;
      if (chinese(translated.bookTitle)) translated.bookTitle = 'Reading series';
      if (chinese(translated.excerpt)) translated.excerpt = '';
      if (chinese(translated.category)) translated.category = 'Notes';
      translated.tags = (translated.tags || []).filter(tag=>!chinese(tag));
      translated.markdown = readable ? entry.markdown || '' : '';
      translated.content = readable ? entry.content || '' : '';
      if (!readable) {
        translated.markdown = 'The English edition is being prepared. Please return shortly, or use the language switch to read the Chinese original.';
      }
      return translated;
    }
    try {
      const slug = new URLSearchParams(location.search).get('slug');
      const paths = ['/api/translations/en'];
      if (slug) paths.push('/api/translations/en?slug='+encodeURIComponent(slug));
      const payloads = await Promise.all(paths.map(async path => {
        const response = await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(15000)});
        if (!response.ok) throw new Error('Translation unavailable');
        return response.json();
      }));
      const lookup = new Map();
      for (const entry of payloads.flatMap(p=>p.posts || [])) {
        for (const alias of [entry.slug,entry.originalSlug,...(entry.aliases || [])].filter(Boolean)) lookup.set(alias,entry);
      }
      for (const key of ['MICHEL_AUTHORED_POSTS','MICHEL_POSTS','MICHEL_ALL_POSTS']) {
        window[key] = (window[key] || []).map((post,index) => {
          const entry = [post.slug,post.originalSlug,...(post.aliases || [])].map(k=>lookup.get(k)).find(Boolean);
          return englishPost(post,entry,index);
        });
      }
      if (slug) {
        const entry = lookup.get(slug);
        if (entry?.hasPreviousEdition) notice('The Chinese article has changed. You are reading the previous English edition while its update is pending.');
      }
    } catch (_) {
      for (const key of ['MICHEL_AUTHORED_POSTS','MICHEL_POSTS','MICHEL_ALL_POSTS']) window[key]=(window[key] || []).map((post,index)=>englishPost(post,null,index));
      notice('English translations are temporarily unavailable. Please try again shortly.');
    }
  }
  window.MichelLanguage = {en,href,t:(zh,english)=>en ? english : zh,notice};
  window.MichelLanguage.ready = load();
})();
