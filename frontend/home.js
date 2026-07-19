(() => {
  const themeJump = document.querySelector('[data-theme-jump]');
  const themePicker = document.querySelector('[data-site-theme-picker]');
  if (themeJump && themePicker) {
    themeJump.addEventListener('click', (event) => {
      event.preventDefault();
      themePicker.scrollIntoView({ behavior: 'smooth', block: 'center' });
      themePicker.classList.remove('is-highlighted');
      window.requestAnimationFrame(() => themePicker.classList.add('is-highlighted'));
      window.setTimeout(() => themePicker.classList.remove('is-highlighted'), 1400);
    });
  }

  const authoredPosts = Array.isArray(window.MICHEL_AUTHORED_POSTS) ? window.MICHEL_AUTHORED_POSTS : [];
  let pinnedSlugs = Array.isArray(window.MICHEL_PINNED_POSTS) ? window.MICHEL_PINNED_POSTS : [];
  try {
    const localPins = JSON.parse(window.localStorage.getItem('michel:pinned-posts') || 'null');
    if (Array.isArray(localPins)) pinnedSlugs = localPins;
  } catch (_) {
    // The generated pin file remains the source of truth when storage is unavailable.
  }
  const pinnedRank = new Map(pinnedSlugs.map((slug, index) => [String(slug || '').trim(), index]));
  const sortPinnedPosts = (posts) => posts.slice().sort((a, b) => {
    const rankA = pinnedRank.has(String(a?.slug || '').trim()) ? pinnedRank.get(String(a.slug).trim()) : Number.MAX_SAFE_INTEGER;
    const rankB = pinnedRank.has(String(b?.slug || '').trim()) ? pinnedRank.get(String(b.slug).trim()) : Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });
  const allPosts = sortPinnedPosts(authoredPosts.concat(Array.isArray(window.MICHEL_ALL_POSTS) ? window.MICHEL_ALL_POSTS : []));
  const mountedPosts = sortPinnedPosts(authoredPosts.concat(Array.isArray(window.MICHEL_POSTS) ? window.MICHEL_POSTS : []));
  const selectedBlogList = document.querySelector('.blog-list');
  if (selectedBlogList) {
    const selectedCards = Array.from(selectedBlogList.querySelectorAll(':scope > a'));
    selectedCards
      .sort((a, b) => {
        const slugFor = (node) => {
          try {
            return new URL(node.href, window.location.href).searchParams.get('slug') || '';
          } catch (_) {
            return '';
          }
        };
        const rankFor = (node) => pinnedRank.has(slugFor(node))
          ? pinnedRank.get(slugFor(node))
          : Number.MAX_SAFE_INTEGER;
        return rankFor(a) - rankFor(b);
      })
      .forEach((card) => {
        let slug = '';
        try {
          slug = new URL(card.href, window.location.href).searchParams.get('slug') || '';
        } catch (_) {
          // Leave malformed legacy links in their original relative order.
        }
        card.classList.toggle('is-pinned-post', pinnedRank.has(slug));
        selectedBlogList.appendChild(card);
      });
  }
  const toggle = document.querySelector('[data-all-posts-toggle]');
  const panel = document.querySelector('#all-posts');
  const list = document.querySelector('#all-posts-list');
  const count = document.querySelector('#all-posts-count');
  const activityChart = document.querySelector('[data-activity-chart]');
  const activityTotal = document.querySelector('[data-activity-total]');
  const activityRange = document.querySelector('[data-activity-range]');
  if (!toggle || !panel || !list) return;

  const normalizeUrl = (value) => {
    try {
      return new URL(value || '', window.location.origin).pathname.replace(/\/$/, '');
    } catch (_) {
      return String(value || '').replace(/\/$/, '');
    }
  };

  const localBySource = new Map(
    mountedPosts
      .filter((post) => post.source && post.slug)
      .map((post) => [normalizeUrl(post.source), post.slug])
  );
  const localByTitleDate = new Map(
    mountedPosts
      .filter((post) => post.title && post.date && post.slug)
      .map((post) => [`${post.title}|||${post.date}`, post.slug])
  );

  const safeText = (value, fallback = '') => String(value || fallback).trim();
  const isAiPost = (post) => {
    const category = safeText(post?.category).toLowerCase();
    const tags = Array.isArray(post?.tags)
      ? post.tags
      : String(post?.tags || '').split(/[,，\s]+/);
    return Boolean(post?.ai)
      || category === 'ai'
      || tags.some((tag) => safeText(tag).toLowerCase() === 'ai');
  };
  const visiblePosts = allPosts.filter((post) => !isAiPost(post));
  const hiddenAiPosts = allPosts.filter(isAiPost);
  const cleanSummary = (value, fallback = '') => {
    const withoutImages = String(value || fallback)
      .replace(/<img\b[^>]*>/gi, ' ')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
      .replace(/<[^>]+>/g, ' ');
    return withoutImages.replace(/\s+/g, ' ').trim();
  };
  const splitSpineTokens = (value) => {
    const tokens = [];
    let latin = '';
    for (const char of String(value || '')) {
      if (/[\w.+#&-]/.test(char)) {
        latin += char;
        continue;
      }
      if (latin) {
        tokens.push({ type: 'latin', value: latin });
        latin = '';
      }
      if (char.trim()) tokens.push({ type: 'char', value: char });
    }
    if (latin) tokens.push({ type: 'latin', value: latin });
    return tokens;
  };
  const deriveSpineTitle = (title) => {
    const normalized = safeText(title, 'Untitled')
      .replace(/[《》“”"']/g, '')
      .replace(/\s+/g, ' ');
    if (/^[\x00-\x7f]+$/.test(normalized)) return splitSpineTokens(normalized);
    const cleanCjk = normalized
      .replace(/[A-Za-z][A-Za-z0-9.+#-]*/g, '')
      .replace(/[^\u3400-\u9fff]/g, '');
    if (cleanCjk.length >= 2 && cleanCjk.length <= 5) return splitSpineTokens(cleanCjk);
    const keywordTitle = [
      [/LoRA|微调/i, '微调实战'],
      [/Agent|智能体|聊天机器人/i, '智能体'],
      [/Diffusion|Stable|扩散/i, '扩散模型'],
      [/Transformer|变换器/i, '变换器'],
      [/RAG|检索|Graph/i, '知识检索'],
      [/RLHF|强化学习/i, '强化学习'],
      [/Claude|GPT|大模型对比|主流大模型/i, '模型对比'],
      [/黑盒|可解释/i, '模型黑盒'],
      [/硬件|算力|单卡/i, '算力瓶颈'],
      [/教育|学习/i, '教育未来'],
      [/日记|Diary|Michael/i, '日记'],
      [/编程|代码|Prompt/i, '编程助手'],
      [/图像|绘画|视觉/i, '图像生成']
    ].find(([pattern]) => pattern.test(normalized));
    if (keywordTitle) return splitSpineTokens(keywordTitle[1]);
    const headline = normalized
      .split(/[：:｜|—–-]/)
      .map((part) => part.trim())
      .find((part) => part.length >= 2) || normalized;
    const cjkOnly = headline
      .replace(/[A-Za-z][A-Za-z0-9.+#-]*/g, '')
      .replace(/[^\u3400-\u9fff]/g, '');
    const source = cjkOnly.length >= 2 ? cjkOnly : headline.replace(/[，,。.!！?？()\[\]（）]/g, '');
    const tokens = splitSpineTokens(source);
    const limit = 7;
    if (tokens.length <= limit) return tokens;
    return tokens.slice(0, limit - 1).concat({ type: 'char', value: '…' });
  };
  const isLatinOnlySpine = (tokens) => tokens.length > 0 && tokens.every((token) => token.type === 'latin');
  const latinMeasureContext = document.createElement('canvas').getContext('2d');
  const weakLatinEdgeWords = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
  const balanceSpineWords = (words, lineCount) => {
    if (lineCount <= 1 || words.length <= 1) return [words.join(' ')];
    const actualLineCount = Math.min(lineCount, words.length);
    const candidates = [];
    const collect = (cuts, nextIndex) => {
      if (cuts.length === actualLineCount - 1) {
        const boundaries = [0, ...cuts, words.length];
        const lines = boundaries.slice(0, -1).map((start, index) => words.slice(start, boundaries[index + 1]).join(' '));
        latinMeasureContext.font = '700 100px Georgia, "Noto Serif SC", serif';
        const widths = lines.map((line) => latinMeasureContext.measureText(line).width);
        const largest = Math.max(...widths);
        const smallest = Math.min(...widths);
        const phrasePenalty = lines.reduce((penalty, line, index) => {
          const lineWords = line.toLowerCase().split(' ').filter(Boolean);
          const first = lineWords[0] || '';
          const last = lineWords[lineWords.length - 1] || '';
          if (index > 0 && weakLatinEdgeWords.has(first)) penalty += 150;
          if (index < lines.length - 1 && weakLatinEdgeWords.has(last)) penalty += 180;
          if (lineWords.length === 1 && first.length <= 3) penalty += 140;
          return penalty;
        }, 0);
        candidates.push({ lines, score: largest + (largest - smallest) * 0.32 + phrasePenalty });
        return;
      }
      const remainingCuts = actualLineCount - cuts.length - 1;
      for (let index = nextIndex; index <= words.length - remainingCuts; index += 1) collect([...cuts, index], index + 1);
    };
    collect([], 1);
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0]?.lines || [words.join(' ')];
  };
  const chooseFallbackLatinLayout = (words) => {
    latinMeasureContext.font = '700 100px Georgia, "Noto Serif SC", serif';
    const maxLineCount = Math.min(3, Math.max(1, words.length));
    const maxFontSize = 24;
    const availableLength = 218;
    const availableWidth = 60;
    const minimumRatios = [0.9, 0.76, 0.66];
    let fallback = null;
    for (let lineCount = 1; lineCount <= maxLineCount; lineCount += 1) {
      const lines = balanceSpineWords(words, lineCount);
      const widestAt100 = Math.max(...lines.map((line) => latinMeasureContext.measureText(line).width));
      const fontSize = Math.min(
        maxFontSize,
        availableLength / Math.max(widestAt100 / 100, 0.01),
        availableWidth / Math.max(lines.length * 0.94, 1)
      );
      fallback = { lines, fontSize };
      if (fontSize >= maxFontSize * minimumRatios[lineCount - 1]) return fallback;
    }
    return fallback || { lines: [words.join(' ')], fontSize: maxFontSize };
  };
  const expandSpineGlyphs = (tokens) => {
    const glyphs = tokens.flatMap((token) => {
      if (token.type === 'latin') {
        return Array.from(token.value).map((letter) => ({ type: 'latin', value: letter }));
      }
      return [{ type: token.type, value: token.value }];
    });
    if (glyphs.length <= 10) return glyphs;
    return glyphs.slice(0, 9).concat({ type: 'char', value: '…' });
  };
  const mountSpineTitle = (node, title) => {
    node.textContent = '';
    const tokens = deriveSpineTitle(title);
    const latinOnly = isLatinOnlySpine(tokens);
    node.classList.toggle('is-latin-spine', latinOnly);
    if (latinOnly) {
      const span = document.createElement('span');
      span.className = 'spine-latin-word';
      const words = tokens.map((token) => token.value);
      const layout = chooseFallbackLatinLayout(words);
      layout.lines.forEach((line) => {
        const lineNode = document.createElement('span');
        lineNode.className = 'spine-latin-line';
        lineNode.textContent = line;
        span.appendChild(lineNode);
      });
      node.style.setProperty('--spine-latin-lines', String(layout.lines.length));
      node.style.setProperty('--spine-latin-size', `${Math.max(0.62, layout.fontSize / 24).toFixed(3)}em`);
      node.dataset.spineLayout = layout.lines.length === 1 ? 'single-band' : 'phrase-balanced-bands';
      node.appendChild(span);
      return tokens;
    }
    expandSpineGlyphs(tokens).forEach((token) => {
      const span = document.createElement('span');
      span.className = token.type === 'latin' ? 'spine-latin-letter' : 'spine-ch';
      span.textContent = token.value;
      node.appendChild(span);
    });
    return tokens;
  };
  const sourceToHref = (post) => {
    const source = safeText(post.source, '#');
    const localSlug = post.slug || localBySource.get(normalizeUrl(source)) || localByTitleDate.get(`${post.title}|||${post.date}`);
    let href;
    if (localSlug) href = `./post.html?slug=${encodeURIComponent(localSlug)}`;
    else if (source.startsWith('http://') || source.startsWith('https://')) href = source;
    else if (source.startsWith('/')) href = source;
    else href = `/${source.replace(/^\.\//, '')}`;
    return window.MICHEL_BLOG_THEME ? window.MICHEL_BLOG_THEME.href(href) : href;
  };

  const mountedBySlug = new Map(mountedPosts.filter((post) => post.slug).map((post) => [post.slug, post]));
  const mountedByTitleDate = new Map(mountedPosts.map((post) => [`${post.title}|||${post.date}`, post]));
  const dateKey = (date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
  const parsePostDate = (value) => {
    const match = String(value || '').match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const countWrittenCharacters = (value) => {
    const text = String(value || '')
      .replace(/^---[\s\S]*?---\s*/u, '')
      .replace(/<img\b[^>]*\balt=["']([^"']*)["'][^>]*>/gi, ' $1 ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, ' $1 ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, ' $1 ')
      .replace(/```[\w-]*\n?/g, '')
      .replace(/[`*_>#~|]/g, '')
      .replace(/\s+/g, '');
    return Array.from(text).length;
  };
  const activityLevel = (characters) => {
    if (!characters) return 0;
    if (characters < 500) return 1;
    if (characters < 2000) return 2;
    if (characters < 8000) return 3;
    return 4;
  };

  async function renderWritingActivity() {
    if (!activityChart || ['1', 'loading'].includes(activityChart.dataset.rendered)) return;
    activityChart.dataset.rendered = 'loading';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rangeStart = new Date(today);
    rangeStart.setDate(rangeStart.getDate() - 364);
    const gridStart = new Date(rangeStart);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    const gridEnd = new Date(today);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

    const daily = new Map();
    const dailyDetails = new Map();
    const addDailyDetail = (key, detail) => {
      const details = dailyDetails.get(key) || [];
      const signature = `${detail.identity}|||${detail.action}`;
      if (!details.some((item) => item.signature === signature)) {
        details.push({ ...detail, signature });
        dailyDetails.set(key, details);
      }
    };
    const timestampDate = (value) => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };
    let authoredActivity = null;
    try {
      const response = await fetch('/api/writing-activity', { cache: 'no-store' });
      if (response.ok) {
        const payload = await response.json();
        authoredActivity = payload?.activity?.days || null;
      }
    } catch (_) {
      // Static previews fall back to the published data already in the page.
    }

    const uniquePosts = new Map();
    visiblePosts.filter((post) => !authoredActivity || !post.authored).forEach((post) => {
      const identity = post.slug || normalizeUrl(post.source) || `${post.title}|||${post.date}`;
      if (!uniquePosts.has(identity)) uniquePosts.set(identity, post);
    });
    uniquePosts.forEach((post) => {
      const identity = post.slug || normalizeUrl(post.source) || `${post.title}|||${post.date}`;
      const date = parsePostDate(post.date);
      if (!date || date < rangeStart || date > today) return;
      const mounted = mountedBySlug.get(post.slug) || mountedByTitleDate.get(`${post.title}|||${post.date}`);
      const source = post.markdown || post.content || mounted?.markdown || mounted?.content || post.excerpt || '';
      const characters = countWrittenCharacters(source);
      const key = dateKey(date);
      daily.set(key, (daily.get(key) || 0) + characters);
      const href = sourceToHref(post);
      const baseDetail = {
        identity,
        title: safeText(post.title, 'Untitled'),
        category: safeText(post.category, 'Notes'),
        characters,
        href
      };
      addDailyDetail(key, {
        ...baseDetail,
        action: post.status === 'draft' ? 'Drafted' : 'Published'
      });

      const createdAt = timestampDate(post.createdAt);
      const updatedAt = timestampDate(post.updatedAt);
      const createdKey = createdAt ? dateKey(createdAt) : '';
      const updatedKey = updatedAt ? dateKey(updatedAt) : '';
      if (createdKey && createdKey !== key && createdAt >= rangeStart && createdAt <= today) {
        addDailyDetail(createdKey, { ...baseDetail, action: 'Created' });
      }
      if (updatedKey && updatedKey !== createdKey && updatedKey !== key && updatedAt >= rangeStart && updatedAt <= today) {
        addDailyDetail(updatedKey, { ...baseDetail, action: 'Edited' });
      }
    });

    if (authoredActivity) {
      Object.entries(authoredActivity).forEach(([key, value]) => {
        const date = parsePostDate(key);
        if (!date || date < rangeStart || date > today) return;
        const characters = Number(value?.characters || 0);
        const draftCharacters = Number(value?.draftCharacters || 0);
        const publishedCharacters = Number(value?.publishedCharacters || 0);
        daily.set(key, (daily.get(key) || 0) + characters);
        if (draftCharacters || Number(value?.draftSaves || 0)) {
          addDailyDetail(key, {
            identity: `private-drafts-${key}`,
            title: 'Private drafts',
            category: 'Draft',
            characters: draftCharacters,
            href: '',
            action: 'Drafted'
          });
        }
        if (publishedCharacters || Number(value?.publishedSaves || 0)) {
          addDailyDetail(key, {
            identity: `authored-published-${key}`,
            title: 'Published writing',
            category: 'Published',
            characters: publishedCharacters,
            href: '#all-posts',
            action: 'Published'
          });
        }
      });
    }

    const days = [];
    for (const cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
      days.push(new Date(cursor));
    }
    const weeks = Math.ceil(days.length / 7);
    const months = document.createElement('div');
    months.className = 'writing-activity-months';
    months.style.setProperty('--activity-weeks', weeks);
    let previousMonth = -1;
    days.forEach((date, index) => {
      if (date.getMonth() === previousMonth || date < rangeStart) return;
      previousMonth = date.getMonth();
      const label = document.createElement('span');
      label.textContent = date.toLocaleDateString('en-US', { month: 'short' });
      label.style.gridColumn = `${Math.floor(index / 7) + 1}`;
      months.appendChild(label);
    });

    const plot = document.createElement('div');
    plot.className = 'writing-activity-plot';
    const weekdays = document.createElement('div');
    weekdays.className = 'writing-activity-weekdays';
    ['Sun', '', 'Tue', '', 'Thu', '', 'Sat'].forEach((label) => {
      const span = document.createElement('span');
      span.textContent = label;
      weekdays.appendChild(span);
    });
    const grid = document.createElement('div');
    grid.className = 'writing-activity-grid';
    grid.style.setProperty('--activity-weeks', weeks);
    days.forEach((date) => {
      const key = dateKey(date);
      const characters = date < rangeStart || date > today ? 0 : (daily.get(key) || 0);
      const detailCount = date < rangeStart || date > today ? 0 : (dailyDetails.get(key) || []).length;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'writing-activity-day';
      cell.dataset.level = String(Math.max(activityLevel(characters), detailCount ? 1 : 0));
      cell.dataset.date = key;
      if (date < rangeStart || date > today) cell.classList.add('is-outside-range');
      const readableDate = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      cell.title = characters
        ? `${readableDate}: ${characters.toLocaleString()} characters added`
        : detailCount
          ? `${readableDate}: ${detailCount} article update${detailCount === 1 ? '' : 's'}`
          : `${readableDate}: no writing`;
      cell.setAttribute('aria-label', cell.title);
      grid.appendChild(cell);
    });
    plot.append(weekdays, grid);
    activityChart.replaceChildren(months, plot);

    const detailPanel = document.createElement('section');
    detailPanel.className = 'writing-activity-detail';
    detailPanel.hidden = true;
    detailPanel.setAttribute('aria-live', 'polite');
    activityChart.closest('.writing-activity-scroll')?.insertAdjacentElement('afterend', detailPanel);

    const showDayDetails = (date, key, characters, cell) => {
      grid.querySelectorAll('.writing-activity-day.is-selected').forEach((item) => {
        item.classList.remove('is-selected');
        item.setAttribute('aria-pressed', 'false');
      });
      cell.classList.add('is-selected');
      cell.setAttribute('aria-pressed', 'true');

      const details = dailyDetails.get(key) || [];
      const heading = document.createElement('div');
      heading.className = 'writing-activity-detail-head';
      const title = document.createElement('h4');
      title.textContent = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const summary = document.createElement('span');
      summary.textContent = characters
        ? `${characters.toLocaleString()} characters · ${details.length} ${details.length === 1 ? 'article' : 'articles'}`
        : details.length
          ? `${details.length} ${details.length === 1 ? 'article update' : 'article updates'}`
          : 'No writing activity';
      heading.append(title, summary);
      detailPanel.replaceChildren(heading);

      if (details.length) {
        const list = document.createElement('ul');
        list.className = 'writing-activity-detail-list';
        details.forEach((detail) => {
          const item = document.createElement('li');
          const link = document.createElement(detail.href ? 'a' : 'strong');
          if (detail.href) link.href = detail.href;
          link.textContent = detail.title;
          const meta = document.createElement('span');
          meta.textContent = `${detail.action} · ${detail.category} · ${detail.characters.toLocaleString()} characters`;
          item.append(link, meta);
          list.appendChild(item);
        });
        detailPanel.appendChild(list);
      }
      detailPanel.hidden = false;
      if (window.innerWidth <= 680) detailPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    grid.querySelectorAll('.writing-activity-day').forEach((cell, index) => {
      const date = days[index];
      if (date < rangeStart || date > today) {
        cell.disabled = true;
        return;
      }
      const key = cell.dataset.date;
      const characters = daily.get(key) || 0;
      cell.setAttribute('aria-pressed', 'false');
      cell.addEventListener('click', () => showDayDetails(date, key, characters, cell));
    });
    const total = [...daily.values()].reduce((sum, value) => sum + value, 0);
    if (activityTotal) activityTotal.textContent = `${total.toLocaleString()} characters added`;
    if (activityRange) activityRange.textContent = `${rangeStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} – ${today.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
    activityChart.dataset.rendered = '1';
  }

  const clampBookValue = (value, min, max) => Math.min(max, Math.max(min, value));
  let bookProjectionFrame = 0;

  const modelBookPerspective = () => {
    if (window.innerWidth <= 680 || list.dataset.rendered !== '1') return;

    list.querySelectorAll('.all-post-books').forEach((shelf) => {
      const shelfRect = shelf.getBoundingClientRect();
      const vanishingX = shelfRect.left + shelfRect.width / 2;
      const focalLength = Math.max(920, shelfRect.width * 0.72);

      shelf.querySelectorAll('.all-post-bay').forEach((bay, bayIndex) => {
        const books = [...bay.querySelectorAll(':scope > .all-post-item')];
        if (!books.length) return;

        const bayRect = bay.getBoundingClientRect();
        bay.style.setProperty('--book-camera-focal', `${focalLength.toFixed(1)}px`);
        bay.style.setProperty('--book-camera-x', `${(vanishingX - bayRect.left).toFixed(1)}px`);

        const geometry = books.map((book, index) => {
          const rect = {
            left: bayRect.left + book.offsetLeft,
            right: bayRect.left + book.offsetLeft + book.offsetWidth,
            width: book.offsetWidth,
            height: book.offsetHeight
          };
          const centerX = rect.left + rect.width / 2;
          // Keep enough physical depth for the shelf-wide projection to retain
          // a readable fore-edge instead of collapsing into a decorative line.
          const depth = 30 + ((index * 7 + bayIndex * 5) % 10);
          const shelfView = Math.atan2(vanishingX - centerX, focalLength);
          const baseTilt = Number.parseFloat(book.style.getPropertyValue('--book-tilt')) || 0;
          return { book, rect, centerX, depth, shelfView, baseTilt };
        });

        geometry.forEach((entry, index) => {
          const previous = geometry[index - 1];
          const next = geometry[index + 1];
          const heightPressure = clampBookValue(
            ((next?.rect.height || entry.rect.height) - (previous?.rect.height || entry.rect.height)) / 95,
            -0.34,
            0.34
          );
          const supportLean = ((previous ? 1 : 0) - (next ? 1 : 0)) * 0.42;
          const lean = clampBookValue(entry.baseTilt + supportLean + heightPressure, -1.15, 1.15);
          entry.lean = lean;
          entry.topShift = Math.tan(lean * Math.PI / 180) * entry.rect.height * 0.62;
        });

        geometry.forEach((entry, index) => {
          const previous = geometry[index - 1];
          const next = geometry[index + 1];
          const baseLeftGap = previous ? entry.rect.left - previous.rect.right : 14;
          const baseRightGap = next ? next.rect.left - entry.rect.right : 14;
          const leftOpening = clampBookValue(
            baseLeftGap + entry.topShift - (previous?.topShift || 0),
            0,
            16
          );
          const rightOpening = clampBookValue(
            baseRightGap + (next?.topShift || 0) - entry.topShift,
            0,
            16
          );

          const individualYaw = (((index * 11 + bayIndex * 7) % 9) - 4) * 0.28;
          const supportYaw = ((previous ? 1 : 0) - (next ? 1 : 0)) * 1.1;
          const displayYaw = clampBookValue(individualYaw + supportYaw, -2.4, 2.4);
          const physicalView = entry.shelfView + displayYaw * Math.PI / 180;
          const projectedSide = Math.abs(Math.sin(physicalView)) * entry.depth;
          const visibleOpening = physicalView > 0 ? rightOpening : leftOpening;
          const visibleSide = projectedSide >= 0.45 && visibleOpening >= 0.45
            ? (physicalView > 0 ? 'right' : 'left')
            : 'none';

          entry.book.style.setProperty('--book-yaw', `${displayYaw.toFixed(2)}deg`);
          entry.book.style.setProperty('--book-edge-lean', `${entry.lean.toFixed(2)}deg`);
          entry.book.style.setProperty('--book-depth', `${entry.depth}px`);
          entry.book.style.setProperty('--book-side-clip', `${clampBookValue(visibleOpening, 0, entry.depth).toFixed(2)}px`);
          entry.book.dataset.bookDepth = String(entry.depth);
          entry.book.dataset.bookYaw = displayYaw.toFixed(2);
          entry.book.dataset.viewAngle = (physicalView * 180 / Math.PI).toFixed(2);
          entry.book.dataset.projectedSide = projectedSide.toFixed(2);
          entry.book.dataset.visibleSide = visibleSide;
        });
      });
    });
  };

  const scheduleBookPerspective = () => {
    window.cancelAnimationFrame(bookProjectionFrame);
    bookProjectionFrame = window.requestAnimationFrame(modelBookPerspective);
  };

  window.addEventListener('resize', scheduleBookPerspective, { passive: true });

  function renderAllPosts() {
    if (list.dataset.rendered === '1') return;
    const fragment = document.createDocumentFragment();
    const cellCapacity = 5;
    const cellsPerRow = 2;
    const rowsPerShelf = 3;
    const cellsPerShelf = cellsPerRow * rowsPerShelf;
    const rowCapacity = cellCapacity * cellsPerRow;
    const groupedPosts = visiblePosts.reduce((groups, post) => {
      const category = safeText(post.category, post.ai ? 'AI' : 'Blog');
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(post);
      return groups;
    }, new Map());
    const preferredCategoryOrder = ['Life', 'Notes', 'CV', 'Dev', 'Q&A', 'Blog'];
    const groupedPostEntries = [...groupedPosts.entries()].sort(([nameA], [nameB]) => {
      const indexA = preferredCategoryOrder.indexOf(nameA);
      const indexB = preferredCategoryOrder.indexOf(nameB);
      if (indexA !== -1 || indexB !== -1) {
        return (indexA === -1 ? preferredCategoryOrder.length : indexA) - (indexB === -1 ? preferredCategoryOrder.length : indexB);
      }
      return 0;
    });
    let bookIndex = 0;
    let dividerIndex = 0;

    const makeDivider = (groupName, count, shelfLabel = 'section') => {
      const divider = document.createElement('div');
      divider.className = 'all-post-divider';
      divider.setAttribute('aria-hidden', 'true');
      divider.style.setProperty('--divider-tilt', `${((dividerIndex % 5) - 2) * 0.16}deg`);
      divider.innerHTML = `
        <span></span>
        <strong></strong>
        <em></em>
      `;
      divider.querySelector('span').textContent = shelfLabel;
      divider.querySelector('strong').textContent = groupName;
      divider.querySelector('em').textContent = `${count} posts`;
      dividerIndex += 1;
      return divider;
    };

    const appendBook = (target, post) => {
      const item = document.createElement('a');
      item.className = 'all-post-item';
      if (pinnedRank.has(String(post.slug || '').trim())) item.classList.add('is-pinned-post');
      item.href = sourceToHref(post);
      const category = safeText(post.category, post.ai ? 'AI' : 'Blog');
      const title = safeText(post.title, 'Untitled');
      const date = safeText(post.date, 'No date');
      const excerpt = cleanSummary(post.excerpt);
      item.setAttribute('aria-label', `${title}. ${category}, ${date}`);
      item.dataset.postMeta = `${category} · ${date}`;
      item.style.setProperty('--book-tilt', `${((bookIndex % 7) - 3) * 0.18}deg`);
      item.style.setProperty('--book-height', `${232 + ((bookIndex * 17) % 34)}px`);
      item.innerHTML = `
        <i class="book-solid-face book-solid-face--back" aria-hidden="true"></i>
        <i class="book-solid-face book-solid-face--left" aria-hidden="true"></i>
        <i class="book-solid-face book-solid-face--right" aria-hidden="true"></i>
        <i class="book-solid-face book-solid-face--top" aria-hidden="true"></i>
        <i class="book-solid-face book-solid-face--bottom" aria-hidden="true"></i>
        <span><b></b><time></time></span>
        <strong></strong>
        <em></em>
      `;
      item.querySelector('b').textContent = category;
      item.querySelector('time').textContent = date;
      const spineTokens = mountSpineTitle(item.querySelector('strong'), title);
      item.dataset.spineTitle = spineTokens.map((token) => token.value).join('');
      item.dataset.spineLength = String(spineTokens.length);
      if (spineTokens.length >= 7) item.classList.add('all-post-item--spine-dense');
      else if (spineTokens.length >= 5) item.classList.add('all-post-item--spine-long');
      item.querySelector('em').textContent = excerpt || 'Open this post from Michel Johnson\'s archive.';
      target.appendChild(item);
      const updateTooltipAlignment = () => {
        const rect = item.getBoundingClientRect();
        const tooltipWidth = Math.min(520, window.innerWidth * 0.82);
        const centeredLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
        const centeredRight = rect.left + rect.width / 2 + tooltipWidth / 2;
        if (centeredLeft < 12) item.dataset.tooltipAlign = 'left';
        else if (centeredRight > window.innerWidth - 12) item.dataset.tooltipAlign = 'right';
        else item.dataset.tooltipAlign = 'center';
      };
      item.addEventListener('mouseenter', updateTooltipAlignment);
      item.addEventListener('focus', updateTooltipAlignment);
      bookIndex += 1;
    };

    const makeShelfSection = (cells, label) => {
      const categorySection = document.createElement('section');
      categorySection.className = 'all-post-category all-post-category--packed';
      categorySection.setAttribute('aria-label', label);

      const books = document.createElement('div');
      books.className = 'all-post-books all-post-books--cells';
      categorySection.appendChild(books);

      cells.forEach((cell) => {
        const cellNode = document.createElement('div');
        cellNode.className = `all-post-cell${cell.empty ? ' all-post-cell--empty' : ''}${cell.showDivider === false ? ' all-post-cell--continuation' : ''}`;
        cellNode.style.setProperty('--cell-span', '1');

        if (cell.empty) {
          cellNode.setAttribute('aria-hidden', 'true');
          books.appendChild(cellNode);
          return;
        }

        cellNode.dataset.category = cell.groupName;
        if (cell.showDivider !== false) {
          cellNode.appendChild(makeDivider(
            cell.groupName,
            cell.displayCount ?? cell.posts.length,
            cell.shelfLabel || 'section'
          ));
        }

        const bay = document.createElement('div');
        bay.className = 'all-post-bay';
        cell.posts.forEach((post) => appendBook(bay, post));
        cellNode.appendChild(bay);
        books.appendChild(cellNode);
      });

      const usedCells = cells.length;
      for (let i = usedCells; i < cellsPerShelf; i += 1) {
        const spacer = document.createElement('div');
        spacer.className = 'all-post-cell all-post-cell--empty';
        spacer.setAttribute('aria-hidden', 'true');
        books.appendChild(spacer);
      }
      fragment.appendChild(categorySection);
    };

    const packedRows = [];
    let pendingSmallCell = null;

    const flushPendingSmallCell = () => {
      if (!pendingSmallCell) return;
      packedRows.push([pendingSmallCell, { empty: true }]);
      pendingSmallCell = null;
    };

    groupedPostEntries.forEach(([groupName, posts]) => {
      if (posts.length <= cellCapacity) {
        const smallCell = {
          groupName,
          posts,
          displayCount: posts.length,
          shelfLabel: 'section'
        };
        if (pendingSmallCell) {
          packedRows.push([pendingSmallCell, smallCell]);
          pendingSmallCell = null;
        } else {
          pendingSmallCell = smallCell;
        }
        return;
      }

      flushPendingSmallCell();
      for (let start = 0; start < posts.length; start += rowCapacity) {
        const rowPosts = posts.slice(start, start + rowCapacity);
        const rowNumber = Math.floor(start / rowCapacity) + 1;
        const shelfLabel = posts.length > rowCapacity
          ? `shelf ${String(rowNumber).padStart(2, '0')}`
          : 'section';
        packedRows.push([
          {
            groupName,
            posts: rowPosts.slice(0, cellCapacity),
            displayCount: rowPosts.length,
            shelfLabel
          },
          rowPosts.length > cellCapacity
            ? {
                groupName,
                posts: rowPosts.slice(cellCapacity),
                showDivider: false
              }
            : { empty: true }
        ]);
      }
    });
    flushPendingSmallCell();

    for (let start = 0; start < packedRows.length; start += rowsPerShelf) {
      const shelfRows = packedRows.slice(start, start + rowsPerShelf);
      const cells = shelfRows.flat();
      while (cells.length < cellsPerShelf) cells.push({ empty: true });
      const categoryNames = [...new Set(cells.filter((cell) => !cell.empty).map((cell) => cell.groupName))];
      const shelfNumber = Math.floor(start / rowsPerShelf) + 1;
      makeShelfSection(cells, `${categoryNames.join(', ')} library grid ${shelfNumber}`);
    }
    list.appendChild(fragment);
    list.dataset.layoutVersion = 'library-grid-v74';
    if (count) {
      count.textContent = `${visiblePosts.length} posts`;
    }
    list.dataset.rendered = '1';
    renderWritingActivity();
    window.MICHEL_BOOKSHELF_POSTS = visiblePosts.map((post) => ({
      title: safeText(post.title, 'Untitled'),
      excerpt: cleanSummary(post.excerpt) || 'Open this post from Michel Johnson\'s archive.',
      category: safeText(post.category, post.ai ? 'AI' : 'Blog'),
      date: safeText(post.date, ''),
      slug: post.slug || '',
      href: sourceToHref(post)
    }));
    scheduleBookPerspective();
    window.dispatchEvent(new CustomEvent('michel:posts-rendered', {
      detail: { posts: window.MICHEL_BOOKSHELF_POSTS }
    }));
  }

  function openPanel(shouldScroll = true) {
    renderAllPosts();
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    toggle.textContent = 'Hide all posts';
    if (shouldScroll) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function closePanel() {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = 'View all posts';
  }

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    if (panel.hidden) openPanel(true);
    else closePanel();
  });

  if (window.location.hash === '#all-posts') {
    openPanel(false);
  }

  window.addEventListener('michel:site-theme-change', () => {
    if (list.dataset.rendered === '1') {
      list.dataset.rendered = '0';
      list.replaceChildren();
      renderAllPosts();
    }
  });
})();


(() => {
  const createLinks = document.querySelectorAll('[data-create-link]');
  if (!createLinks.length) return;

  function getAdminHref() {
    const { protocol, hostname, port } = window.location;
    const localHost = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
    if (localHost && port !== '8787') return `${protocol}//${hostname}:8787/admin.html`;
    return './admin.html';
  }

  createLinks.forEach((link) => {
    link.href = getAdminHref();
  });
})();

(() => {
  const openers = document.querySelectorAll('[data-contact-open]');
  const modal = document.querySelector('#contact-modal');
  const backdrop = document.querySelector('.contact-backdrop');
  const closers = document.querySelectorAll('[data-contact-close]');
  const feedback = document.querySelector('[data-contact-feedback]');
  const copyButtons = document.querySelectorAll('[data-copy-contact]');
  if (!openers.length || !modal || !backdrop) return;

  let lastActive = null;
  let closeTimer = null;

  function setOpen(isOpen) {
    if (isOpen) {
      window.clearTimeout(closeTimer);
      lastActive = document.activeElement;
      modal.hidden = false;
      backdrop.hidden = false;
      modal.classList.remove('is-closing');
      backdrop.classList.remove('is-closing');
      document.body.classList.add('contact-open');
      if (feedback) feedback.textContent = '';
      window.requestAnimationFrame(() => modal.querySelector('.contact-close')?.focus());
      return;
    }

    if (modal.hidden || modal.classList.contains('is-closing')) return;
    modal.classList.add('is-closing');
    backdrop.classList.add('is-closing');
    document.body.classList.remove('contact-open');
    closeTimer = window.setTimeout(() => {
      modal.hidden = true;
      backdrop.hidden = true;
      modal.classList.remove('is-closing');
      backdrop.classList.remove('is-closing');
      if (lastActive && typeof lastActive.focus === 'function') lastActive.focus();
    }, 420);
  }

  function closeWithMotion(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    }
    setOpen(false);
  }

  openers.forEach((opener) => {
    opener.addEventListener('click', (event) => {
      event.preventDefault();
      opener.classList.add('is-pressed');
      window.setTimeout(() => opener.classList.remove('is-pressed'), 180);
      setOpen(true);
    });
  });

  closers.forEach((closer) => {
    closer.addEventListener('pointerdown', closeWithMotion, true);
    closer.addEventListener('mousedown', closeWithMotion, true);
    closer.addEventListener('click', closeWithMotion, true);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) setOpen(false);
  });

  async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '0';
    document.body.appendChild(input);
    input.focus();
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('Copy command failed');
  }

  copyButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const value = button.dataset.copyContact || '';
      try {
        await copyText(value);
        if (feedback) feedback.textContent = button.dataset.copyLabel || 'Copied';
      } catch (_) {
        if (feedback) feedback.textContent = value;
      }
    });
  });
})();

(() => {
  const root = document.documentElement;
  const body = document.body;
  if (!body) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const targetSelector = [
    '.hero',
    '.site-nav',
    '.site-theme-section',
    '.hero-copy-block',
    '.sketch-card',
    '.content-section',
    '.section-heading',
    '.note-card',
    '.blog-column',
    '.blog-list a',
    '.all-posts-panel',
    '.all-post-item'
  ].join(',');

  function isGallery() {
    return root.dataset.siteTheme === 'gallery';
  }

  function removeGalleryArtifacts() {
    document.querySelectorAll([
      '.gallery-home',
      '.gallery-source-header',
      '.gallery-sidenav-shell',
      '.toggle[data-gallery-kenji-toggle]',
      '#panel[data-gallery-kenji-panel]',
      '#sound',
      '#sound_effect',
      '.circles',
      '.circle_control',
      '.circle_control_side',
      '.firstload',
      '.gallery-loader',
      '.create_t',
      '.gallery-create-t',
      '[data-gallery-create-t]',
      '.gallery-original-portrait',
      '#kenjiendo',
      '#kenjiendo_bk',
      'canvas[id^="kenjiendo"]',
      '.gallery-source-title-fragments',
      '.gallery-line-frame',
      '.borders'
    ].join(',')).forEach((node) => node.remove());
    body.classList.remove('gallery-entering', 'gallery-panel-open', 'preload');
    root.classList.remove('toggled', 'audio_pause', 'audio_play');
  }

  function galleryBorderMarkup(index) {
    const frames = {
      1: '<svg width="427px" height="350px"><path d="M0.5,0.5h378v259H0.5V0.5"></path><path d="M378.5,5.5h5v5h5v5h5v5h5v259"></path><path d="M5.5,259.5v5h5v5h5v5h5v5h378"></path><path d="M20.5,284.5h378v46h19v19h9.5"></path></svg>',
      2: '<svg width="300px" height="67px"><path d="M299.5,66.5v-66H0.5v66H299.5"></path></svg>',
      3: '<svg width="260.001px" height="169.999px"><path d="M0.353,0.354l129.648,128.939L259.648,0.354"></path><path d="M259.648,10.354L130.001,139.294L0.353,10.354"></path><path d="M0.353,20.354l129.648,128.939L259.648,20.354"></path><path d="M259.648,30.354L130.001,159.294L0.353,30.354"></path><path d="M0.353,40.354l129.648,128.939L259.648,40.354"></path></svg>',
      4: '<svg width="333.836px" height="299.488px"><path d="M237.202,218.406h-141"></path><path d="M0.433,10.5l166.268,287.988L332.97,10.5"></path><path d="M0.433,0.5H332.97l-166.27,287.988L0.433,0.5"></path></svg>',
      5: '<svg width="299.508px" height="299.506px"><path d="M149.797,25.253c68.781,0,124.541,55.759,124.541,124.542 c0,68.781-55.76,124.542-124.541,124.542c-68.783,0-124.543-55.76-124.543-124.542C25.254,81.012,81.014,25.253,149.797,25.253"></path><path d="M274.254,274.252v-249h-249v249H274.254"></path><path d="M286.705,12.803l12.449-12.449"></path><path d="M12.805,286.702L0.354,299.153"></path><path d="M286.701,286.701l12.453,12.452"></path><path d="M12.808,12.807L0.354,0.354"></path></svg>',
      6: '<svg width="780px" height="310px"><path d="M269.501,0.5h9.999v10h10v10h10v10h10v279"></path><path d="M0.5,269.5v10h10v10h10v10h10v10h279"></path></svg>',
      7: '<svg width="333.17px" height="237.136px"><path d="M0.5,236.636V0.5h332.17v236.136H0.5"></path></svg>'
    };
    const groups = {
      1: [1, 2],
      2: [3, 4],
      3: [7],
      4: [5],
      5: [7],
      6: [6],
      7: [7]
    };
    return (groups[Number(index)] || [((Number(index) - 1) % 7) + 1])
      .map((variant) => `<div class="borders gallery-ink-frame borders_${variant}" aria-hidden="true">${frames[variant]}</div>`)
      .join('');
  }

  function ensureGalleryHome() {
    const shell = document.querySelector('.site-shell');
    if (!shell) return null;

    // The earlier Kenji text-canvas experiment can survive in the DOM when the
    // page is restored from bfcache or when an older cached script built the
    // gallery before the new CSS arrives.  That layer is exactly what appears as
    // a rectangular black mask around the title area in Chromium/Samsung.  The
    // adapted gallery now keeps the line interactions only, so remove any stale
    // canvas plane before returning/creating the gallery home.
    let galleryHome = document.querySelector('.gallery-home');
    if (galleryHome) {
      cleanGalleryTitleArtifacts(galleryHome);
      return galleryHome;
    }

    galleryHome = document.createElement('div');
    galleryHome.className = 'gallery-home';
    galleryHome.setAttribute('aria-label', 'Michel Johnson gallery homepage');
    galleryHome.innerHTML = `
      <div class="all gallery-kenji-all gallery-studio" id="gallery-loadbody">
        <section id="top" class="gallery-studio-section gallery-studio-hero">
          <div class="gallery-studio-grid">
            <div class="gallery-studio-card gallery-studio-card--intro trigger viewin gallery-motion-target">
              <p class="gallery-studio-kicker">MICHEL INDEX</p>
              <h1>Ideas, apps, notes.</h1>
              <p>Michel Johnson builds small apps, AI-assisted products and personal writing systems. This theme collects the work in a darker, line-driven reading room.</p>
              <div class="gallery-studio-actions">
                <a href="#gallery-blog" class="btn">READ NOTES</a>
                <a href="#gallery-apps" class="btn btn-ghost">SEE APPS</a>
              </div>
              ${galleryBorderMarkup(1)}
            </div>
            <a href="#gallery-about" class="gallery-studio-card gallery-studio-card--name trigger pjx viewin gallery-motion-target gallery-profile-card">
              <span class="gallery-studio-kicker">PERSONAL SITE</span>
              <h1 id="gallery-title" class="gallery-source-title">MICHEL<br>JOHNSON</h1>
              <p>Sketch by default. Kenji lines as an alternate blog theme.</p>
              ${galleryBorderMarkup(2)}
            </a>
          </div>
        </section>

        <section id="gallery-about" class="gallery-studio-section gallery-studio-band">
          <div class="gallery-studio-card gallery-studio-card--wide trigger viewin gallery-motion-target">
            <p class="gallery-studio-kicker">ABOUT</p>
            <h1>Clear thinking for messy questions.</h1>
            <p>This space is for build logs, learning notes, product sketches and AI essays. The Kenji-inspired theme keeps the page quiet until the pointer touches an object, then lets the linework wake up.</p>
            ${galleryBorderMarkup(3)}
          </div>
        </section>

        <section id="gallery-apps" class="gallery-studio-section gallery-studio-split">
          <div class="gallery-studio-card gallery-studio-card--app trigger gallery-app-feature viewin gallery-motion-target">
            <p class="gallery-studio-kicker">APP 01</p>
            <a class="album_slide" href="https://memflow.micheljohnson.top/" target="_blank" rel="noreferrer">
              <span class="gallery-app-no">01</span>
              <strong>MEMFLOW</strong>
              <em>A TikTok-style knowledge card app for repeatable memory flows.</em>
            </a>
            <div class="gallery-studio-actions"><a href="https://memflow.micheljohnson.top/" target="_blank" rel="noreferrer" class="btn">VIEW APP</a></div>
            ${galleryBorderMarkup(4)}
          </div>
          <div class="gallery-studio-card gallery-studio-card--aside trigger viewin gallery-motion-target">
            <p class="gallery-studio-kicker">APPS</p>
            <h1>Small tools first.</h1>
            <p>Android apps, learning tools, interface sketches and experimental systems will live here as they become public.</p>
            ${galleryBorderMarkup(5)}
          </div>
        </section>

        <section id="gallery-blog" class="gallery-studio-section gallery-studio-blog">
          <div class="gallery-studio-card gallery-studio-card--posts trigger viewin gallery-motion-target">
            <div class="gallery-studio-head">
              <div>
                <p class="gallery-studio-kicker">NEWS</p>
                <h1>Recent writing</h1>
              </div>
              <a class="btn gallery-archive-link" href="#gallery-all-posts" data-gallery-all-posts>ALL POSTS</a>
            </div>
            <div class="news_body"><div class="news_scroll" data-gallery-posts></div></div>
            <div class="gallery-all-posts" id="gallery-all-posts" hidden>
              <div class="gallery-all-posts-head"><span>Complete archive</span><strong data-gallery-all-count></strong></div>
              <div class="gallery-all-posts-list" data-gallery-all-list></div>
            </div>
            ${galleryBorderMarkup(6)}
          </div>
          <div class="gallery-studio-card gallery-studio-card--links trigger viewin gallery-motion-target">
            <div class="link_body">
              <p class="gallery-studio-kicker">LINKS</p>
              <h1>Elsewhere</h1>
              <ul>
                <li><a href="https://github.com/Michel-Johnson" target="_blank" rel="noreferrer">GITHUB</a></li>
                <li><a href="https://memflow.micheljohnson.top/" target="_blank" rel="noreferrer">MEMFLOW</a></li>
                <li><a href="https://www.linkedin.com/in/jiarui-shang-2837a039b" target="_blank" rel="noreferrer">LINKEDIN</a></li>
                <li><a href="mailto:micheljohnsonofficial@gmail.com">GMAIL</a></li>
                <li><a href="#contact" data-contact-open>WECHAT</a></li>
              </ul>
            </div>
            ${galleryBorderMarkup(7)}
          </div>
        </section>
      </div>
    `;
    const themeSection = shell.querySelector('.site-theme-section');
    if (themeSection) themeSection.insertAdjacentElement('afterend', galleryHome);
    else shell.appendChild(galleryHome);

    const posts = sortPinnedPosts(Array.isArray(window.MICHEL_POSTS) ? window.MICHEL_POSTS : []).slice(0, 4);
    const postGrid = galleryHome.querySelector('[data-gallery-posts]');
    posts.forEach((post, index) => {
      const link = document.createElement('a');
      link.className = 'gallery-writing-item post cf viewin';
      link.href = window.MICHEL_BLOG_THEME ? window.MICHEL_BLOG_THEME.href(`./post.html?slug=${encodeURIComponent(post.slug)}`) : `./post.html?slug=${encodeURIComponent(post.slug)}`;
      link.innerHTML = `<article><h2>${post.date || String(index + 1).padStart(2, '0')}</h2><div class="post_body"><h1><span class="gallery-link-text"></span></h1><p></p></div></article>`;
      link.querySelector('.gallery-link-text').textContent = post.title || 'Untitled';
      link.querySelector('p').textContent = cleanSummary(post.excerpt, 'Open this note.');
      postGrid.appendChild(link);
    });

    galleryHome.querySelector('[data-gallery-all-posts]')?.addEventListener('click', (event) => {
      event.preventDefault();
      const panel = galleryHome.querySelector('#gallery-all-posts');
      const list = galleryHome.querySelector('[data-gallery-all-list]');
      if (!panel || !list) return;
      if (list.dataset.rendered !== '1') {
        const all = sortPinnedPosts(Array.isArray(window.MICHEL_ALL_POSTS) ? window.MICHEL_ALL_POSTS : []).filter((post) => !isAiPost(post));
        all.forEach((post, index) => {
          const link = document.createElement('a');
          link.className = 'gallery-writing-item gallery-all-item viewin';
          const slug = post.slug || '';
          link.href = slug ? (window.MICHEL_BLOG_THEME ? window.MICHEL_BLOG_THEME.href(`./post.html?slug=${encodeURIComponent(slug)}`) : `./post.html?slug=${encodeURIComponent(slug)}`) : (post.source || '#');
          link.innerHTML = `<span>${String(index + 1).padStart(2, '0')} / ${post.category || (post.ai ? 'AI' : 'Blog')}</span><strong><span class="gallery-link-text"></span></strong><em></em>`;
          link.querySelector('.gallery-link-text').textContent = post.title || 'Untitled';
          link.querySelector('em').textContent = cleanSummary(post.excerpt, post.date || 'Open this post.');
          list.appendChild(link);
          makeLineSvg(link);
        });
        galleryHome.querySelector('[data-gallery-all-count]').textContent = `${all.length} posts`;
        list.dataset.rendered = '1';
      }
      panel.hidden = !panel.hidden;
      updateGallerySidenav();
      if (!panel.hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    galleryHome.querySelectorAll('[data-contact-open]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        document.querySelector('.brand-lockup[data-contact-open]')?.click();
      });
    });

    return galleryHome;
  }

  function cleanGalleryTitleArtifacts(scope = document) {
    scope.querySelectorAll?.('.gallery-source-title-fragments, .gallery-title-canvas, .gallery-title-bk, .gallery-create-t, .create_t, [data-gallery-create-t], .gallery-original-portrait, .prof, #kenjiendo, #kenjiendo_bk, canvas[id^="kenjiendo"], .gallery-profile-card canvas:not(.gallery-name-wire), .gallery-profile-card [class*="mask"], .gallery-profile-card [id*="mask"], .gallery-profile-card [class*="canvas"], #gallery-title canvas, #gallery-title [class*="mask"], #gallery-title [class*="canvas"], #sound, #sound_effect, .circles, .circle_control, .circle_control_side').forEach((node) => {
      node.remove();
    });
    const title = scope.querySelector?.('.gallery-profile-card .gallery-source-title') || document.querySelector('.gallery-profile-card .gallery-source-title');
    const card = title?.closest('.gallery-profile-card') || scope.querySelector?.('.gallery-profile-card') || document.querySelector('.gallery-profile-card');
    if (card && !card.classList.contains('gallery-studio-card--name')) {
      card.querySelectorAll?.(':scope > :not(.table):not(.gallery-name-wire):not(.borders), .table > :not(.td), .td > :not(#gallery-title)').forEach((node) => node.remove());
    }
    card?.classList.remove('is-title-wiring');
    [card, card?.querySelector('.table'), card?.querySelector('.td'), title].forEach((node) => {
      if (!node) return;
      node.style.setProperty('background', 'transparent', 'important');
      node.style.setProperty('background-color', 'transparent', 'important');
      node.style.setProperty('background-image', 'none', 'important');
      node.style.setProperty('box-shadow', 'none', 'important');
      node.style.setProperty('filter', 'none', 'important');
      node.style.setProperty('-webkit-filter', 'none', 'important');
      node.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
      node.style.setProperty('backdrop-filter', 'none', 'important');
      node.style.setProperty('mix-blend-mode', 'normal', 'important');
      node.style.setProperty('isolation', 'auto', 'important');
    });
    if (!title) return;
    title.querySelectorAll?.('canvas, [class*="mask"], [id*="mask"], [class*="canvas"], [class*="fragment"]').forEach((node) => node.remove());
    title.removeAttribute('data-gallery-fragment-title');
    title.removeAttribute('data-gallery-fragments-ready');
    title.setAttribute('aria-label', 'MICHEL JOHNSON');
    if (!title.textContent.trim()) title.textContent = 'MICHEL JOHNSON';
    title.style.setProperty('color', '#fff', 'important');
    title.style.setProperty('-webkit-text-fill-color', '#fff', 'important');
    title.style.setProperty('-webkit-text-stroke', '0 transparent', 'important');
    title.style.setProperty('text-shadow', 'none', 'important');
    title.style.setProperty('opacity', '1', 'important');
    title.style.setProperty('visibility', 'visible', 'important');
    title.classList.remove('is-title-wiring');
  }

  function scrubGalleryBlackVeils(scope = document) {
    if (!isGallery()) return;
    const safeRoot = (node) => (
      node === document.body ||
      node === document.documentElement ||
      node.classList?.contains('site-shell')
    );
    scope.querySelectorAll?.('*').forEach((node) => {
      if (safeRoot(node)) return;
      const cls = String(node.className || '');
      const id = String(node.id || '');
      const inGallery = node.closest?.('.gallery-home, .gallery-source-header, .gallery-sidenav-shell, #panel, .gallery-menu-toggle, .contact-modal');
      if (!inGallery) return;

      const style = window.getComputedStyle(node);
      const bg = style.backgroundColor || '';
      const bgImage = style.backgroundImage || '';
      const looksLikeVeil =
        /rgba?\(\s*0\s*,\s*0\s*,\s*0/i.test(bg) ||
        /gradient|rgba?\(\s*0\s*,\s*0\s*,\s*0/i.test(bgImage) ||
        /mask|overlay|backdrop|canvas|create_t|kenjiendo/i.test(`${cls} ${id}`);
      if (!looksLikeVeil) return;

      node.style.setProperty('background', 'transparent', 'important');
      node.style.setProperty('background-color', 'transparent', 'important');
      node.style.setProperty('background-image', 'none', 'important');
      node.style.setProperty('box-shadow', 'none', 'important');
      node.style.setProperty('filter', 'none', 'important');
      node.style.setProperty('-webkit-filter', 'none', 'important');
      node.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
      node.style.setProperty('backdrop-filter', 'none', 'important');
      node.style.setProperty('mix-blend-mode', 'normal', 'important');
    });
  }

  function guardGalleryTitleArtifacts() {
    if (guardGalleryTitleArtifacts.started) return;
    guardGalleryTitleArtifacts.started = true;
    const isBadNode = (node) => {
      if (!node || node.nodeType !== 1) return false;
      const el = node;
      const cls = String(el.className || '');
      const id = String(el.id || '');
      return (
        (el.matches?.('.gallery-profile-card canvas, .gallery-source-title-fragments, .gallery-title-canvas, .gallery-title-bk, .gallery-create-t, .create_t, #kenjiendo, #kenjiendo_bk, canvas[id^="kenjiendo"]')) ||
        (el.closest?.('.gallery-profile-card') && (/mask|canvas/i.test(cls) || /mask|canvas/i.test(id)))
      );
    };
    const purge = (node) => {
      if (isBadNode(node)) {
        node.remove();
        return;
      }
      node.querySelectorAll?.('.gallery-profile-card canvas, .gallery-profile-card [class*="mask"], .gallery-profile-card [id*="mask"], .gallery-profile-card [class*="canvas"], .gallery-source-title-fragments, .gallery-title-canvas, .gallery-title-bk, .gallery-create-t, .create_t, #kenjiendo, #kenjiendo_bk, canvas[id^="kenjiendo"]').forEach((item) => item.remove());
      scrubGalleryBlackVeils(node);
    };
    const observer = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach(purge));
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    purge(document);
    scrubGalleryBlackVeils(document);
  }

  function createGalleryTopNavigation() {
    if (document.querySelector('[data-gallery-source-header]')) return;
    const header = document.createElement('header');
    header.className = 'gallery-source-header';
    header.dataset.gallerySourceHeader = '1';
    header.innerHTML = `
      <div class="header">
        <nav aria-label="Gallery source navigation">
          <ul class="navigation cf">
            <li><a class="pjx" href="#top" data-gallery-nav-target="top">HOME</a></li>
            <li><a class="pjx" href="#gallery-about" data-gallery-nav-target="gallery-about">ABOUT</a></li>
            <li><a class="pjx" href="#gallery-apps" data-gallery-nav-target="gallery-apps">ALBUM</a></li>
            <li><a class="pjx" href="#gallery-blog" data-gallery-nav-target="gallery-blog">NEWS</a></li>
            <li><a class="gotobottom" href="#contact" data-gallery-nav-target="contact">CONTACT</a></li>
          </ul>
        </nav>
      </div>`;
    body.prepend(header);
    header.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        if (!isGallery()) return;
        const target = link.dataset.galleryNavTarget;
        if (target === 'contact') {
          document.querySelector('.brand-lockup[data-contact-open]')?.click();
          return;
        }
        const node = document.getElementById(target) || document.querySelector(`#${CSS.escape(target || '')}`);
        const pos = node ? Math.max(0, Math.round(node.getBoundingClientRect().top + window.scrollY)) : 0;
        smoothGalleryScrollTo(pos, 1000);
      });
    });
  }

  function smoothGalleryScrollTo(targetY = 0, duration = 1000) {
    const startY = window.scrollY || document.documentElement.scrollTop || 0;
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const endY = Math.max(0, Math.min(maxY, Number(targetY) || 0));
    if (reduceMotion || duration <= 0) {
      window.scrollTo(0, endY);
      return;
    }
    const startTime = performance.now();
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const step = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      window.scrollTo(0, startY + ((endY - startY) * ease(progress)));
      if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  }

  function setupGalleryAnchorRouting() {
    if (body.dataset.galleryAnchorReady === '1') return;
    body.dataset.galleryAnchorReady = '1';
    document.addEventListener('click', (event) => {
      const link = event.target.closest?.('a[href^="#"]');
      if (!link || !isGallery()) return;
      const hash = link.getAttribute('href') || '';
      if (!hash || hash === '#') return;
      const target = document.getElementById(hash.slice(1));
      if (!target) return;
      event.preventDefault();
      smoothGalleryScrollTo(Math.max(0, Math.round(target.getBoundingClientRect().top + window.scrollY)), 1000);
    });
  }

  function createGallerySidenav() {
    if (document.querySelector('[data-gallery-sidenav]')) return;
    const aside = document.createElement('aside');
    aside.className = 'gallery-sidenav-shell';
    aside.setAttribute('aria-label', 'Gallery section navigation');
    // Preserve the source structure: a fixed `.sidenav` list with a center
    // `.gototop` item.  The letters are decorative section markers, while the
    // data-pos values below are computed from the Michel page layout.
    aside.innerHTML = `
      <div class="header">
        <nav>
          <ul class="sidenav cf" data-gallery-sidenav>
            <li class="on"><a href="" aria-label="Top">K</a></li>
            <li><a href="" aria-label="About">E</a></li>
            <li><a href="" aria-label="Profile">N</a></li>
            <li><a href="" aria-label="Apps">J</a></li>
            <li><a href="" aria-label="App detail">I</a></li>
            <li class="gototop"><a href="" data-pos="0" aria-label="Go to top"><img src="./vendor/kenjiendo_v2/img/gototop.png" width="11" alt=""></a></li>
            <li><a href="" aria-label="News">E</a></li>
            <li><a href="" aria-label="Links">N</a></li>
            <li><a href="" aria-label="Archive">D</a></li>
            <li><a href="" aria-label="End">O</a></li>
          </ul>
        </nav>
      </div>`;
    body.appendChild(aside);
    const links = aside.querySelectorAll('.sidenav a');
    links.forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        if (!isGallery()) return;
        const pos = Number(link.dataset.pos || 0);
        smoothGalleryScrollTo(pos, link.closest('.gototop') ? 1800 : 1000);
      });
    });
    updateGallerySidenav();
  }

  function updateGallerySidenav() {
    const nav = document.querySelector('[data-gallery-sidenav]');
    if (!nav) return;
    const items = Array.from(nav.children);
    if (!isGallery()) {
      items.forEach((item) => item.classList.remove('on'));
      return;
    }

    // Match the original kenjiendo.com section map.  The source uses fixed
    // scroll offsets and only reveals the center gototop marker at the very
    // last section; computing dynamic offsets for Michel content made the
    // triangle appear far too early and broke source behavior parity.
    const sideoffset = {
      p1: 503,
      p2: 903,
      p3: 1304,
      p4: 1704,
      p5: 2504,
      p6: 2903,
      p7: 3304,
      p8: 3703
    };
    const mapping = [
      [0, 0],
      [1, sideoffset.p1],
      [2, sideoffset.p2],
      [3, sideoffset.p3],
      [4, sideoffset.p4],
      [6, sideoffset.p5],
      [7, sideoffset.p6],
      [8, sideoffset.p7],
      [9, sideoffset.p8]
    ];
    mapping.forEach(([itemIndex, pos]) => {
      const link = items[itemIndex]?.querySelector('a');
      if (link) link.dataset.pos = String(pos);
    });
    const topLink = items[5]?.querySelector('a');
    if (topLink) topLink.dataset.pos = '0';

    const wT = window.scrollY || document.documentElement.scrollTop || 0;
    let activeItem = 0;
    if (wT < sideoffset.p1) activeItem = 0;
    else if (wT < sideoffset.p2) activeItem = 1;
    else if (wT < sideoffset.p3) activeItem = 2;
    else if (wT < sideoffset.p4) activeItem = 3;
    else if (wT < sideoffset.p5) activeItem = 4;
    else if (wT < sideoffset.p6) activeItem = 6;
    else if (wT < sideoffset.p7) activeItem = 7;
    else if (wT < sideoffset.p8) activeItem = 8;
    else activeItem = 9;

    items.forEach((item) => item.classList.remove('on'));
    items[activeItem]?.classList.add('on');
    if (activeItem === 9) items[5]?.classList.add('on');
  }

  const galleryCircleLinesMarkup = `<g class="circle_control_lines"> <line x1="242.284" y1="0" x2="242.284" y2="7.527"/> <line x1="242.284" y1="477.036" x2="242.284" y2="484.563"/> <line x1="233.827" y1="0.148" x2="234.09" y2="7.67"/> <line x1="250.477" y1="476.894" x2="250.739" y2="484.417"/> <line x1="225.382" y1="0.59" x2="225.907" y2="8.1"/> <line x1="258.659" y1="476.464" x2="259.184" y2="483.974"/> <line x1="216.957" y1="1.327" x2="217.744" y2="8.814"/> <line x1="266.822" y1="475.751" x2="267.609" y2="483.237"/> <line x1="208.563" y1="2.358" x2="209.611" y2="9.812"/> <line x1="274.954" y1="474.753" x2="276.003" y2="482.206"/> <line x1="200.211" y1="3.681" x2="201.518" y2="11.095"/> <line x1="283.047" y1="473.472" x2="284.355" y2="480.884"/> <line x1="191.909" y1="5.294" x2="193.474" y2="12.658"/> <line x1="291.091" y1="471.907" x2="292.656" y2="479.269"/> <line x1="183.669" y1="7.197" x2="185.49" y2="14.501"/> <line x1="299.074" y1="470.063" x2="300.896" y2="477.366"/> <line x1="175.501" y1="9.386" x2="177.575" y2="16.622"/> <line x1="306.988" y1="467.942" x2="309.066" y2="475.179"/> <line x1="167.413" y1="11.858" x2="169.74" y2="19.018"/> <line x1="314.824" y1="465.546" x2="317.154" y2="472.706"/> <line x1="159.416" y1="14.612" x2="161.992" y2="21.686"/> <line x1="322.572" y1="462.88" x2="325.148" y2="469.952"/> <line x1="151.521" y1="17.642" x2="154.342" y2="24.622"/> <line x1="330.222" y1="459.942" x2="333.042" y2="466.923"/> <line x1="143.736" y1="20.946" x2="146.8" y2="27.824"/> <line x1="337.765" y1="456.741" x2="340.828" y2="463.618"/> <line x1="136.072" y1="24.52" x2="139.374" y2="31.287"/> <line x1="345.191" y1="453.278" x2="348.494" y2="460.044"/> <line x1="128.536" y1="28.36" x2="132.072" y2="35.007"/> <line x1="352.492" y1="449.56" x2="356.029" y2="456.202"/> <line x1="121.14" y1="32.459" x2="124.905" y2="38.979"/> <line x1="359.66" y1="445.587" x2="363.425" y2="452.103"/> <line x1="113.891" y1="36.815" x2="117.881" y2="43.2"/> <line x1="366.683" y1="441.366" x2="370.673" y2="447.747"/> <line x1="106.798" y1="41.421" x2="111.01" y2="47.663"/> <line x1="373.554" y1="436.903" x2="377.767" y2="443.142"/> <line x1="99.871" y1="46.272" x2="104.297" y2="52.362"/> <line x1="380.267" y1="432.204" x2="384.693" y2="438.292"/> <line x1="93.117" y1="51.362" x2="97.753" y2="57.293"/> <line x1="386.81" y1="427.272" x2="391.449" y2="433.204"/> <line x1="86.544" y1="56.684" x2="91.386" y2="62.451"/> <line x1="393.179" y1="422.116" x2="398.019" y2="427.882"/> <line x1="80.162" y1="62.232" x2="85.202" y2="67.827"/> <line x1="399.363" y1="416.741" x2="404.402" y2="422.335"/> <line x1="73.977" y1="68" x2="79.209" y2="73.415"/> <line x1="405.355" y1="411.153" x2="410.587" y2="416.565"/> <line x1="67.997" y1="73.98" x2="73.415" y2="79.208"/> <line x1="411.15" y1="405.36" x2="416.568" y2="410.585"/> <line x1="62.229" y1="80.166" x2="67.827" y2="85.201"/> <line x1="416.738" y1="399.366" x2="422.333" y2="404.399"/> <line x1="56.682" y1="86.548" x2="62.45" y2="91.386"/> <line x1="422.113" y1="393.183" x2="427.882" y2="398.017"/> <line x1="51.36" y1="93.121" x2="57.293" y2="97.753"/> <line x1="427.269" y1="386.813" x2="433.205" y2="391.444"/> <line x1="46.27" y1="99.875" x2="52.362" y2="104.298"/> <line x1="432.201" y1="380.271" x2="438.294" y2="384.691"/> <line x1="41.419" y1="106.802" x2="47.662" y2="111.01"/> <line x1="436.9" y1="373.558" x2="443.144" y2="377.764"/> <line x1="36.813" y1="113.894" x2="43.2" y2="117.882"/> <line x1="441.363" y1="366.686" x2="447.751" y2="370.671"/> <line x1="32.458" y1="121.144" x2="38.979" y2="124.905"/> <line x1="445.583" y1="359.662" x2="452.105" y2="363.423"/> <line x1="28.358" y1="128.54" x2="35.007" y2="132.072"/> <line x1="449.554" y1="352.495" x2="456.207" y2="356.026"/> <line x1="24.519" y1="136.075" x2="31.287" y2="139.374"/> <line x1="453.275" y1="345.194" x2="460.044" y2="348.491"/> <line x1="20.945" y1="143.74" x2="27.824" y2="146.8"/> <line x1="456.74" y1="337.769" x2="463.621" y2="340.827"/> <line x1="17.641" y1="151.524" x2="24.622" y2="154.343"/> <line x1="459.941" y1="330.226" x2="466.923" y2="333.042"/> <line x1="14.61" y1="159.419" x2="21.686" y2="161.993"/> <line x1="462.876" y1="322.576" x2="469.953" y2="325.147"/> <line x1="11.857" y1="167.416" x2="19.018" y2="169.741"/> <line x1="465.546" y1="314.829" x2="472.707" y2="317.151"/> <line x1="9.385" y1="175.503" x2="16.623" y2="177.577"/> <line x1="467.941" y1="306.992" x2="475.179" y2="309.064"/> <line x1="7.196" y1="183.671" x2="14.502" y2="185.492"/> <line x1="470.062" y1="299.077" x2="477.369" y2="300.896"/> <line x1="5.294" y1="191.912" x2="12.659" y2="193.476"/> <line x1="471.906" y1="291.094" x2="479.271" y2="292.655"/> <line x1="3.681" y1="200.213" x2="11.096" y2="201.52"/> <line x1="473.47" y1="283.052" x2="480.884" y2="284.354"/> <line x1="2.358" y1="208.565" x2="9.814" y2="209.612"/> <line x1="474.751" y1="274.958" x2="482.207" y2="276.003"/> <line x1="1.327" y1="216.959" x2="8.815" y2="217.746"/> <line x1="475.751" y1="266.825" x2="483.238" y2="267.608"/> <line x1="0.59" y1="225.384" x2="8.102" y2="225.909"/> <line x1="476.464" y1="258.662" x2="483.974" y2="259.185"/> <line x1="0.148" y1="233.829" x2="7.672" y2="234.092"/> <line x1="476.892" y1="250.479" x2="484.417" y2="250.739"/> <line x1="0" y1="242.285" x2="7.529" y2="242.285"/> <line x1="477.037" y1="242.288" x2="484.564" y2="242.284"/> <line x1="0.147" y1="250.74" x2="7.671" y2="250.478"/> <line x1="476.892" y1="234.094" x2="484.417" y2="233.828"/> <line x1="0.59" y1="259.185" x2="8.101" y2="258.659"/> <line x1="476.464" y1="225.912" x2="483.976" y2="225.382"/> <line x1="1.327" y1="267.61" x2="8.814" y2="266.823"/> <line x1="475.751" y1="217.749" x2="483.238" y2="216.958"/> <line x1="2.358" y1="276.003" x2="9.813" y2="274.956"/> <line x1="474.751" y1="209.616" x2="482.207" y2="208.565"/> <line x1="3.681" y1="284.356" x2="11.095" y2="283.05"/> <line x1="473.47" y1="201.522" x2="480.884" y2="200.212"/> <line x1="5.294" y1="292.657" x2="12.659" y2="291.093"/> <line x1="471.906" y1="193.479" x2="479.271" y2="191.91"/> <line x1="7.196" y1="300.897" x2="14.502" y2="299.077"/> <line x1="470.064" y1="185.495" x2="477.369" y2="183.67"/> <line x1="9.385" y1="309.067" x2="16.623" y2="306.991"/> <line x1="467.943" y1="177.58" x2="475.181" y2="175.502"/> <line x1="11.857" y1="317.154" x2="19.018" y2="314.829"/> <line x1="465.546" y1="169.744" x2="472.708" y2="167.415"/> <line x1="14.611" y1="325.151" x2="21.686" y2="322.576"/> <line x1="462.878" y1="161.997" x2="469.953" y2="159.418"/> <line x1="17.642" y1="333.046" x2="24.622" y2="330.226"/> <line x1="459.943" y1="154.347" x2="466.921" y2="151.523"/> <line x1="20.946" y1="340.831" x2="27.825" y2="337.769"/> <line x1="456.742" y1="146.804" x2="463.619" y2="143.739"/> <line x1="24.52" y1="348.495" x2="31.288" y2="345.195"/> <line x1="453.279" y1="139.378" x2="460.044" y2="136.074"/> <line x1="28.359" y1="356.03" x2="35.008" y2="352.497"/> <line x1="449.558" y1="132.077" x2="456.205" y2="128.539"/> <line x1="32.459" y1="363.427" x2="38.98" y2="359.663"/> <line x1="445.585" y1="124.911" x2="452.105" y2="121.143"/> <line x1="36.814" y1="370.677" x2="43.201" y2="366.687"/> <line x1="441.367" y1="117.887" x2="447.75" y2="113.894"/> <line x1="41.42" y1="377.769" x2="47.663" y2="373.56"/> <line x1="436.904" y1="111.015" x2="443.144" y2="106.802"/> <line x1="46.271" y1="384.696" x2="52.363" y2="380.271"/> <line x1="432.203" y1="104.303" x2="438.292" y2="99.874"/> <line x1="51.361" y1="391.45" x2="57.294" y2="386.815"/> <line x1="427.271" y1="97.759" x2="433.203" y2="93.12"/> <line x1="56.683" y1="398.023" x2="62.451" y2="393.183"/> <line x1="422.115" y1="91.391" x2="427.882" y2="86.548"/> <line x1="62.23" y1="404.405" x2="67.828" y2="399.366"/> <line x1="416.74" y1="85.207" x2="422.333" y2="80.166"/> <line x1="67.998" y1="410.591" x2="73.416" y2="405.36"/> <line x1="411.152" y1="79.214" x2="416.566" y2="73.98"/> <line x1="73.978" y1="416.569" x2="79.21" y2="411.155"/> <line x1="405.357" y1="73.42" x2="410.585" y2="68"/> <line x1="80.163" y1="422.337" x2="85.203" y2="416.743"/> <line x1="399.365" y1="67.832" x2="404.402" y2="62.233"/> <line x1="86.545" y1="427.886" x2="91.386" y2="422.118"/> <line x1="393.181" y1="62.456" x2="398.019" y2="56.686"/> <line x1="93.118" y1="433.208" x2="97.754" y2="427.274"/> <line x1="386.812" y1="57.299" x2="391.447" y2="51.364"/> <line x1="99.872" y1="438.296" x2="104.298" y2="432.206"/> <line x1="380.269" y1="52.368" x2="384.691" y2="46.274"/> <line x1="106.799" y1="443.147" x2="111.011" y2="436.907"/> <line x1="373.558" y1="47.668" x2="377.765" y2="41.424"/> <line x1="113.892" y1="447.753" x2="117.882" y2="441.37"/> <line x1="366.685" y1="43.205" x2="370.671" y2="36.818"/> <line x1="121.141" y1="452.108" x2="124.906" y2="445.591"/> <line x1="359.662" y1="38.985" x2="363.423" y2="32.463"/> <line x1="128.537" y1="456.21" x2="132.073" y2="449.563"/> <line x1="352.494" y1="35.012" x2="356.027" y2="28.363"/> <line x1="136.073" y1="460.048" x2="139.375" y2="453.282"/> <line x1="345.193" y1="31.292" x2="348.492" y2="24.523"/> <line x1="143.737" y1="463.622" x2="146.801" y2="456.745"/> <line x1="337.769" y1="27.829" x2="340.828" y2="20.95"/> <line x1="151.521" y1="466.929" x2="154.343" y2="459.948"/> <line x1="330.226" y1="24.627" x2="333.042" y2="17.645"/> <line x1="159.416" y1="469.958" x2="161.994" y2="462.886"/> <line x1="322.576" y1="21.69" x2="325.148" y2="14.614"/> <line x1="167.412" y1="472.71" x2="169.741" y2="465.552"/> <line x1="314.83" y1="19.022" x2="317.154" y2="11.861"/> <line x1="175.499" y1="475.183" x2="177.577" y2="467.946"/> <line x1="306.992" y1="16.627" x2="309.066" y2="9.389"/> <line x1="183.667" y1="477.372" x2="185.492" y2="470.067"/> <line x1="299.078" y1="14.506" x2="300.896" y2="7.2"/> <line x1="191.907" y1="479.274" x2="193.476" y2="471.911"/> <line x1="291.093" y1="12.663" x2="292.656" y2="5.297"/> <line x1="200.209" y1="480.888" x2="201.52" y2="473.474"/> <line x1="283.05" y1="11.099" x2="284.355" y2="3.684"/> <line x1="208.563" y1="482.212" x2="209.613" y2="474.757"/> <line x1="274.956" y1="9.817" x2="276.003" y2="2.361"/> <line x1="216.957" y1="483.241" x2="217.746" y2="475.755"/> <line x1="266.822" y1="8.819" x2="267.609" y2="1.331"/> <line x1="225.381" y1="483.979" x2="225.909" y2="476.468"/> <line x1="258.659" y1="8.105" x2="259.184" y2="0.594"/> <line x1="233.826" y1="484.421" x2="234.092" y2="476.897"/> <line x1="250.477" y1="7.676" x2="250.739" y2="0.151"/> </g>`;

  function galleryPlayIconMarkup() {
    return '<div class="circle_control_play"><svg width="17.337px" height="20px"><polygon points="0.5,0.866 16.336,9.999 0.5,19.133 "/></svg></div><div class="circle_control_pause cf"><div></div><div></div></div>';
  }

  function createGalleryCircleControl() {
    if (document.querySelector('[data-gallery-circle-system]')) return;
    const audio = document.createElement('audio');
    audio.id = 'sound';
    audio.setAttribute('data-gallery-circle-system', 'audio');
    audio.preload = 'auto';
    audio.controls = true;
    audio.loop = true;
    audio.innerHTML = '<source src="./vendor/kenjiendo_wp/uploads/2014/09/002.mp3" type="audio/mp3">';

    const side = document.createElement('div');
    side.className = 'circle_control_side';
    side.setAttribute('data-gallery-circle-system', 'side');
    side.innerHTML = `<div class="inner">${galleryPlayIconMarkup()}</div>`;

    const circles = document.createElement('div');
    circles.className = 'circles';
    circles.setAttribute('data-gallery-circle-system', 'circles');
    circles.innerHTML = `
      <div class="circle">
        <div class="circle_control">
          <div class="circle_control_wrap">
            <div class="circle_control_hide"><input type="text" value="0" class="dial" aria-hidden="true"></div>
            <div class="circle_control_player"><div class="inner">${galleryPlayIconMarkup()}</div></div>
            <div class="circle_control_outer">
              <svg class="circle_control_body" width="484.565px" height="484.563px" viewBox="0 0 484.565 484.563" aria-hidden="true">
                ${galleryCircleLinesMarkup}
                <circle class="circle_control_bar" fill="none" cx="242.283" cy="242.282" r="224.5"/>
                <circle class="circle_control_bar_bk" fill="none" cx="242.283" cy="242.282" r="224.5"/>
              </svg>
            </div>
          </div>
        </div>
        <canvas id="sound_effect" aria-hidden="true"></canvas>
      </div>`;

    body.prepend(audio);
    body.append(side, circles);
  }

  function setupGalleryAudioMotion() {
    if (body.dataset.galleryAudioReady === '1') return;
    body.dataset.galleryAudioReady = '1';
    root.classList.add('audio_pause');
    const audio = document.getElementById('sound');
    const canvas = document.getElementById('sound_effect');
    const ctx = canvas?.getContext('2d');
    const circleBar = document.querySelector('.circle_control_bar');
    const lines = Array.from(document.querySelectorAll('.circle_control_lines line'));
    const settings = { circles: 30, hue: 0 };
    const maxMagnitude = 1024 * 255;
    let analyser = null;
    let audioContext = null;
    let source = null;
    let raf = 0;
    let synthetic = true;

    lines.forEach((line, index) => {
      line.style.strokeDashoffset = '0px';
      line.style.transitionDelay = `${index / 500}s`;
    });

    const setCanvasSize = () => {
      if (!canvas || !ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth || document.documentElement.clientWidth || 1;
      const h = window.innerHeight || document.documentElement.clientHeight || 1;
      canvas.width = Math.ceil(w * dpr);
      canvas.height = Math.ceil(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const audioProgress = (percent = 0) => {
      if (!circleBar) return;
      const radius = Number(circleBar.getAttribute('r') || 224.5);
      const circumference = Math.PI * (radius * 2);
      const clamped = Math.max(0, Math.min(100, percent || 0));
      if (clamped > 0) root.classList.add('circle_control_begin');
      circleBar.style.strokeDashoffset = `${((100 - clamped) / 100) * circumference}px`;
    };

    const setPlaying = (playing) => {
      root.classList.toggle('audio_play', playing);
      root.classList.toggle('audio_pause', !playing);
    };

    const ensureAudioContext = () => {
      if (!audio || audioContext || (!window.AudioContext && !window.webkitAudioContext)) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioContext = new AC();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        source = audioContext.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        synthetic = false;
      } catch (_) {
        synthetic = true;
      }
    };

    const draw = () => {
      raf = window.requestAnimationFrame(draw);
      if (!ctx || !canvas) return;
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const halfW = w / 2;
      const halfH = h / 2;
      let data = null;
      if (analyser && !synthetic) {
        data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
      }
      // Keep this canvas transparent. The gallery page itself already owns the
      // black background; repainting the full audio canvas black creates an
      // extra composited dark plate that reads like a mask in Chromium/Samsung.
      ctx.clearRect(0, 0, w, h);
      const now = performance.now() / 1000;
      for (let i = 0; i < settings.circles; i += 1) {
        let magnitude = 0;
        if (data) {
          const bins = Math.max(1, Math.floor(1024 / (i + 1)));
          for (let b = 0; b < bins && b < data.length; b += 1) magnitude += data[b];
        } else {
          const playingBoost = root.classList.contains('audio_play') ? 1 : 0.35;
          magnitude = (Math.sin(now * (1.2 + i * 0.08) + i * 0.7) * 0.5 + 0.5) * 4200 * playingBoost;
        }
        const ratio = magnitude / (maxMagnitude / settings.circles);
        const strength = ratio * h / settings.circles;
        const alpha = (1 / settings.circles) + 0.1;
        ctx.strokeStyle = `hsla(${settings.hue * 2}, 50%, 50%, ${alpha})`;
        ctx.fillStyle = `hsla(${settings.hue * 2}, 50%, 50%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(halfW, halfH, strength, 0, Math.PI * 2, true);
        ctx.stroke();
        ctx.fill();
      }
      if (synthetic && root.classList.contains('audio_play')) {
        const percent = ((now * 8) % 100);
        settings.hue = Math.floor(now * 24) % 360;
        if (circleBar) circleBar.style.stroke = `hsla(${settings.hue * 2},50%,50%,1)`;
        audioProgress(percent);
      }
    };

    const play = async () => {
      ensureAudioContext();
      try { await audioContext?.resume?.(); } catch (_) {}
      try { await audio?.play?.(); synthetic = false; } catch (_) { synthetic = true; }
      setPlaying(true);
    };
    const pause = () => {
      try { audio?.pause?.(); } catch (_) {}
      setPlaying(false);
    };

    document.querySelectorAll('.circle_control_play').forEach((button) => button.addEventListener('click', (event) => { event.preventDefault(); play(); }));
    document.querySelectorAll('.circle_control_pause').forEach((button) => button.addEventListener('click', (event) => { event.preventDefault(); pause(); }));
    document.querySelectorAll('.circle_control').forEach((node) => {
      node.addEventListener('mousedown', () => node.classList.add('grab'));
      node.addEventListener('mouseup', () => node.classList.remove('grab'));
      node.addEventListener('mouseleave', () => node.classList.remove('grab'));
    });

    audio?.addEventListener('timeupdate', () => {
      const total = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      const current = audio.currentTime || 0;
      settings.hue = Math.floor(current) % 360;
      if (circleBar) circleBar.style.stroke = `hsla(${settings.hue * 2},50%,50%,1)`;
      if (total) audioProgress((current / total) * 100);
      setPlaying(!audio.paused && !audio.ended && current > 0);
    }, true);
    audio?.addEventListener('pause', () => setPlaying(false));
    audio?.addEventListener('play', () => setPlaying(true));

    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);
    if (!raf) draw();
  }

  function setupGalleryHover() {
    if (body.dataset.galleryHoverReady === '1') return;
    body.dataset.galleryHoverReady = '1';
    const moveProfile = (event) => {
      if (!isGallery()) return;
      const halfH = (window.innerHeight || document.documentElement.clientHeight || 0) / 2;
      const y = event.clientY || 0;
      const topOffset = (y - halfH) / 20;
      const bottomOffset = (y - halfH) / 30;
      document.querySelectorAll('[data-gallery-parallax-top]').forEach((node) => {
        node.style.transform = `translateY(${topOffset}px)`;
      });
      document.querySelectorAll('[data-gallery-parallax-bottom]').forEach((node) => {
        node.style.transform = `translateY(${bottomOffset}px)`;
      });
    };
    window.addEventListener('mousemove', moveProfile, { passive: true });
  }


  function initGalleryCreateCanvas(scope = document) {
    const holder = scope.querySelector?.('[data-gallery-create-t]') || document.querySelector('[data-gallery-create-t]');
    if (!holder || holder.dataset.galleryCreateReady === '1') return;
    const canvas = holder.querySelector('[data-gallery-create-canvas]') || document.getElementById('kenjiendo');
    const bgCanvas = holder.querySelector('[data-gallery-create-bk]') || document.getElementById('kenjiendo_bk');
    const ctx = canvas?.getContext?.('2d');
    const bgctx = bgCanvas?.getContext?.('2d');
    if (!canvas || !bgCanvas || !ctx || !bgctx) return;

    holder.dataset.galleryCreateReady = '1';
    const imageW = 300;
    const imageH = 3918;
    const cW = 800;
    const cH = imageH;
    let imgX = (cW - imageW) / 2;
    let imgY = (cH - imageH) / 2;
    const ua = navigator.userAgent.toLowerCase();
    const density = ua.includes('chrome') ? 12 : 18;
    const interval = ua.includes('chrome') ? 20 : 40;
    const range = 6;
    const speed = 48;
    const megane = 130;
    const strokeMegane = 25;
    const jimble = 2;
    const particles = [];
    const sourceCanvas = document.createElement('canvas');
    const sourceCtx = sourceCanvas.getContext('2d');
    let targetX = -9999;
    let targetY = -9999;
    let imageReady = false;
    let timer = 0;

    const refreshMouseOrigin = () => {
      const rect = holder.getBoundingClientRect();
      holder.dataset.galleryCreateLeft = String(rect.left + window.scrollX);
      holder.dataset.galleryCreateTop = String(rect.top + window.scrollY);
    };

    const setCanvas = () => {
      canvas.width = cW;
      canvas.height = cH;
      bgCanvas.width = cW;
      bgCanvas.height = cH;
      canvas.style.width = `${cW}px`;
      canvas.style.height = `${cH}px`;
      bgCanvas.style.width = `${cW}px`;
      bgCanvas.style.height = `${cH}px`;
    };

    const setupParticles = () => {
      particles.length = 0;
      let data;
      try {
        data = sourceCtx.getImageData(0, 0, cW, cH).data;
      } catch (_) {
        return;
      }
      for (let x = 0; x < cW; x += density) {
        for (let y = 0; y < cH; y += density) {
          const alpha = data[((x + (y * cW)) * 4) + 3];
          if (alpha === 255) particles.push({ x, y, x0: x, y0: y });
        }
      }
    };

    const prepare = () => {
      setCanvas();
      bgctx.clearRect(0, 0, cW, cH);
      sourceCanvas.width = cW;
      sourceCanvas.height = cH;
      sourceCtx.clearRect(0, 0, cW, cH);
      sourceCtx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, imgX, imgY, image.naturalWidth, image.naturalHeight);
      try {
        const imageData = sourceCtx.getImageData(0, 0, cW, cH);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 8) {
            data[i + 3] = 0;
          } else {
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
          }
        }
        sourceCtx.putImageData(imageData, 0, 0);
      } catch (_) {}
      try {
        const sourceData = sourceCtx.getImageData(0, 0, cW, cH);
        holder.dataset.galleryTitleHasInk = sourceData.data.some((value, index) => index % 4 === 3 && value > 8) ? '1' : '0';
      } catch (_) {
        holder.dataset.galleryTitleHasInk = '1';
      }
      // Keep the sampler canvas data-only. Painting the title bitmap into a
      // second DOM canvas leaves a faint dark rectangle/halo in Chromium-based
      // browsers even when the canvas is hidden by CSS. Sample directly from the
      // offscreen source canvas instead.
      setupParticles();
      ctx.clearRect(0, 0, cW, cH);
      imageReady = true;
    };

    const draw = () => {
      if (!imageReady || !isGallery()) return;
      ctx.clearRect(0, 0, cW, cH);
      const pointerActive = targetX > -megane && targetY > -megane && targetX < cW + megane && targetY < cH + megane;

      // The reference effect is the title bitmap itself being decomposed by
      // the pointer, with the remaining glyph fragments turning into a fine
      // white wire field.  Keep the canvas transparent and never draw a soft
      // spotlight/veil: any soft destination-out gradient reads as a black
      // mask on this all-black page.
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';

      // The adapted gallery page already has a real white text layer for
      // Michel's name. Drawing the huge Kenji source-title bitmap here creates
      // an extra composited layer; when the pointer effect runs on a black
      // background, Chromium/Samsung read that layer as a visible black mask.
      // Keep this canvas strictly additive: only draw the white wire fragments
      // on hover, never a filled title plate and never a destination-out hole.

      const activeParticles = [];
      for (let i = 0, len = particles.length; i < len; i += 1) {
        const p = particles[i];
        if (pointerActive) {
          const dx = targetX - p.x;
          const dy = targetY - p.y;
          const dist = Math.max(0.001, Math.sqrt((dx * dx) + (dy * dy)));
          p.x = (p.x - ((dx / dist) * (range / dist) * speed)) - ((p.x - p.x0) / 2);
          p.y = (p.y - ((dy / dist) * (range / dist) * speed)) - ((p.y - p.y0) / 2);
          const nearX = p.x - targetX;
          const nearY = p.y - targetY;
          const nearDist = Math.sqrt((nearX * nearX) + (nearY * nearY));
          if (nearDist < megane) activeParticles.push(p);
        } else {
          p.x += (p.x0 - p.x) / 2;
          p.y += (p.y0 - p.y) / 2;
        }
      }

      for (let i = 0, len = activeParticles.length; i < len; i += 1) {
        const p = activeParticles[i];
        for (let j = i + 1; j < len; j += 1) {
          const q = activeParticles[j];
          const sx = p.x - q.x;
          const sy = p.y - q.y;
          const strokeDist = Math.sqrt((sx * sx) + (sy * sy));
          if (strokeDist < strokeMegane) {
            ctx.beginPath();
            ctx.lineWidth = 0.24;
            ctx.strokeStyle = 'rgba(255,255,255,1)';
            ctx.moveTo(p.x + (Math.random() * jimble - jimble / 2), p.y + (Math.random() * jimble - jimble / 2));
            ctx.lineTo(q.x + (Math.random() * jimble - jimble / 2), q.y + (Math.random() * jimble - jimble / 2));
            ctx.lineTo(p.x0, p.y0);
            ctx.lineTo(q.x0, q.y0);
            ctx.closePath();
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    };

    const updatePointer = (event) => {
      const left = Number(holder.dataset.galleryCreateLeft || 0);
      const top = Number(holder.dataset.galleryCreateTop || 0);
      targetX = event.pageX - left;
      targetY = event.pageY - top;
    };

    const image = new Image();
    image.onload = () => {
      refreshMouseOrigin();
      prepare();
      window.clearInterval(timer);
      timer = window.setInterval(draw, interval);
      holder.dataset.galleryCreateTimer = String(timer);
    };
    image.onerror = () => { holder.dataset.galleryCreateReady = '0'; };
    image.src = './vendor/kenjiendo_v2/img/kenjiendo2.png';
    if (image.complete && image.naturalWidth) image.onload();

    window.addEventListener('mousemove', updatePointer, { passive: true });
    window.addEventListener('resize', () => {
      refreshMouseOrigin();
      if (imageReady) prepare();
    });
    window.addEventListener('scroll', refreshMouseOrigin, { passive: true });
  }

  function makeLineSvg(node) {
    if (node.querySelector(':scope > .borders')) return;
    node.classList.add('trigger');
    const variants = ['borders_1', 'borders_2', 'borders_3', 'borders_4', 'borders_5', 'borders_6', 'borders_7', 'borders_8', 'borders_9', 'borders_10'];
    const allTargets = Array.from(document.querySelectorAll('.gallery-tile, .gallery-work-item, .gallery-writing-item, .sketch-card, .note-card, .blog-list a, .all-post-item'));
    const siblingIndex = allTargets.includes(node) ? allTargets.indexOf(node) : Array.from(node.parentElement?.children || []).indexOf(node);
    const variant = variants[Math.max(0, siblingIndex) % variants.length] || 'borders_1';
    const wrap = document.createElement('div');
    wrap.className = `borders ${variant}`;
    wrap.setAttribute('aria-hidden', 'true');
    const frames = {
      borders_1: '<svg width="427px" height="350px"><path d="M0.5,0.5h378v259H0.5V0.5"></path><path d="M378.5,5.5h5v5h5v5h5v5h5v259"></path><path d="M5.5,259.5v5h5v5h5v5h5v5h378"></path><path d="M20.5,284.5h378v46h19v19h9.5"></path></svg>',
      borders_2: '<svg width="300px" height="67px"><path d="M299.5,66.5v-66H0.5v66H299.5"></path></svg>',
      borders_3: '<svg width="260.001px" height="169.999px"><path d="M0.353,0.354l129.648,128.939L259.648,0.354"></path><path d="M259.648,10.354L130.001,139.294L0.353,10.354"></path><path d="M0.353,20.354l129.648,128.939L259.648,20.354"></path><path d="M259.648,30.354L130.001,159.294L0.353,30.354"></path><path d="M0.353,40.354l129.648,128.939L259.648,40.354"></path></svg>',
      borders_4: '<svg width="333.836px" height="299.488px"><path d="M237.202,218.406h-141"></path><path d="M0.433,10.5l166.268,287.988L332.97,10.5"></path><path d="M0.433,0.5H332.97l-166.27,287.988L0.433,0.5"></path></svg>',
      borders_5: '<svg width="299.508px" height="299.506px"><defs><pattern id="pattern1" x="10" y="10" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="1" height="1" style="stroke:none;fill:rgba(255,255,255,.3)"></rect></pattern></defs><path d="M149.797,25.253c68.781,0,124.541,55.759,124.541,124.542 c0,68.781-55.76,124.542-124.541,124.542c-68.783,0-124.543-55.76-124.543-124.542C25.254,81.012,81.014,25.253,149.797,25.253"></path><path d="M274.254,274.252v-249h-249v249H274.254"></path><g><path d="M286.705,12.803l12.449-12.449"></path><path d="M12.805,286.702L0.354,299.153"></path><path d="M286.701,286.701l12.453,12.452"></path><path d="M12.808,12.807L0.354,0.354"></path></g></svg>',
      borders_6: '<svg width="780px" height="310px"><path d="M269.501,0.5h9.999v10h10v10h10v10h10v279"></path><path d="M0.5,269.5v10h10v10h10v10h10v10h279"></path></svg>',
      borders_7: '<svg width="333.17px" height="237.136px"><path d="M0.5,236.636V0.5h332.17v236.136H0.5"></path></svg>',
      borders_8: '<svg width="320px" height="570px" viewBox="-339 90 320 570"><defs><pattern id="pattern2" x="10" y="10" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="1" height="1" style="stroke:none;fill:rgba(255,255,255,.3)"></rect></pattern></defs><path d="M-338.5,90.5h299v549h-299V90.5"></path><path class="dotted" d="M-19.5,659.5v-549h-5v-5h-5v-5h-5v-5h-299v549h5v5h5v5h5v5H-19.5"></path></svg>',
      borders_9: '<svg width="280px" height="680px"><path d="M259.5,679.5v-5h5v-5h5v-5h5V5.5h-259v5h-5v5h-5v5h-5v659H259.5"></path><path d="M20.5,0.5h259v659h-259V0.5"></path></svg>',
      borders_10: '<svg width="260.295px" height="355.846px"><path d="M0,169.645L130.147,40.705l129.647,128.939v185L130.147,225.705 L0,354.644l0.5-185"></path><path d="M0.5,159.645L130.147,30.705l129.647,128.939"></path><path d="M259.795,149.645L130.147,20.705L0.5,149.645"></path><path d="M0.5,139.645L130.147,10.705l129.647,128.939"></path><path d="M259.795,129.645L130.147,0.705L0.5,129.645"></path></svg>'
    };
    wrap.innerHTML = frames[variant] || frames.borders_1;
    node.appendChild(wrap);
    initGalleryLineFrame(wrap);
  }

  function initGalleryLineFrame(rootNode = document) {
    rootNode.querySelectorAll('.gallery-line-frame path, .borders path').forEach((path, index) => {
      path.removeAttribute('pathLength');
      const length = Math.max(1, Math.ceil(path.getTotalLength() * 100) / 100);
      path.style.setProperty('stroke-dasharray', `${length} ${length}`);
      path.style.setProperty('stroke-dashoffset', `${length}`);
      path.style.setProperty('--kenji-border-length', `${length}px`);
      path.style.setProperty('--gallery-line-index', index);
    });
  }


  function ensureGalleryTitleWireCanvas() {
    const card = document.querySelector('.gallery-profile-card');
    const title = card?.querySelector('.gallery-source-title');
    if (!card || !title) return null;

    // Keep the old Kenji canvas/mask planes out, but allow one small, transparent
    // canvas that sits only on top of the title text.  It never paints black and
    // never uses destination-out, so it cannot produce the dark veil the user saw.
    card.querySelectorAll('.gallery-source-title-fragments, .gallery-title-canvas, .gallery-title-bk, [class*="mask"], [id*="mask"], :scope > canvas:not(.gallery-name-wire)').forEach((node) => node.remove());
    let canvas = card.querySelector(':scope > .gallery-name-wire[data-gallery-safe-wire="1"]');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'gallery-name-wire';
      canvas.dataset.gallerySafeWire = '1';
      canvas.setAttribute('aria-hidden', 'true');
      card.appendChild(canvas);
    }
    canvas.style.setProperty('background', 'transparent', 'important');
    canvas.style.setProperty('background-color', 'transparent', 'important');
    canvas.style.setProperty('background-image', 'none', 'important');
    canvas.style.setProperty('mix-blend-mode', 'normal', 'important');
    return canvas;
  }

  function setupGalleryNameWire() {
    const card = document.querySelector('.gallery-profile-card');
    const title = card?.querySelector('.gallery-source-title');
    const canvas = card?.querySelector('.gallery-name-wire');
    if (!card || !title || !canvas || canvas.dataset.galleryNameWireReady === '1') return;
    canvas.dataset.galleryNameWireReady = '1';
    const ctx = canvas.getContext('2d', { alpha: true });
    const textMask = document.createElement('canvas');
    const maskCtx = textMask.getContext('2d', { willReadFrequently: true });
    if (!ctx || !maskCtx) return;

    let text = (title.textContent || '').trim();
    let rect = null;
    let titleRect = null;
    let dpr = 1;
    let particles = [];
    let samplePoints = [];
    let pointer = { x: -9999, y: -9999, active: false };
    let raf = 0;
    let lastMove = 0;

    const parsePx = (value, fallback = 0) => {
      const n = Number.parseFloat(value);
      return Number.isFinite(n) ? n : fallback;
    };

    const getTitleMetrics = () => {
      const cs = window.getComputedStyle(title);
      const fontSize = parsePx(cs.fontSize, 20);
      const fontWeight = cs.fontWeight || '800';
      const fontFamily = cs.fontFamily || 'Arial, Helvetica, sans-serif';
      const letterSpacing = parsePx(cs.letterSpacing, 0);
      const font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      return { cs, font, fontSize, fontWeight, fontFamily, letterSpacing };
    };

    const measureLetterSpacedText = (context, value, spacing) => {
      let width = 0;
      Array.from(value).forEach((char, index, chars) => {
        width += context.measureText(char).width;
        if (index < chars.length - 1) width += spacing;
      });
      return width;
    };

    const drawLetterSpacedText = (context, value, x, y, spacing) => {
      let cursor = x;
      Array.from(value).forEach((char, index, chars) => {
        context.fillText(char, cursor, y);
        cursor += context.measureText(char).width;
        if (index < chars.length - 1) cursor += spacing;
      });
    };

    const drawBaseTitle = (context, alpha = 1) => {
      const metrics = getTitleMetrics();
      context.save();
      context.font = metrics.font;
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillStyle = `rgba(255,255,255,${alpha})`;
      const drawWidth = measureLetterSpacedText(context, text, metrics.letterSpacing);
      const x = ((rect?.pad || 0) + ((titleRect.width - drawWidth) / 2));
      const y = ((rect?.pad || 0) + (titleRect.height / 2) + (metrics.fontSize * 0.02));
      drawLetterSpacedText(context, text, x, y, metrics.letterSpacing);
      context.restore();
    };

    const rebuild = () => {
      const cardRect = card.getBoundingClientRect();
      titleRect = title.getBoundingClientRect();
      const pad = 18;
      const cssLeft = Math.max(0, titleRect.left - cardRect.left - pad);
      const cssTop = Math.max(0, titleRect.top - cardRect.top - pad);
      const w = Math.max(1, Math.ceil(titleRect.width + (pad * 2)));
      const h = Math.max(1, Math.ceil(titleRect.height + (pad * 2)));
      rect = { left: cardRect.left + cssLeft, top: cardRect.top + cssTop, width: w, height: h, pad };
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      textMask.width = w;
      textMask.height = h;
      canvas.style.setProperty('left', `${cssLeft}px`, 'important');
      canvas.style.setProperty('top', `${cssTop}px`, 'important');
      canvas.style.setProperty('width', `${w}px`, 'important');
      canvas.style.setProperty('height', `${h}px`, 'important');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      maskCtx.setTransform(1, 0, 0, 1, 0, 0);
      maskCtx.clearRect(0, 0, w, h);
      text = (title.textContent || '').trim();
      drawBaseTitle(maskCtx, 1);

      const data = maskCtx.getImageData(0, 0, w, h).data;
      samplePoints = [];
      const step = Math.max(2, Math.round(w / 170));
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const alpha = data[((y * w + x) * 4) + 3];
          if (alpha > 40) samplePoints.push({ x, y });
        }
      }
      particles = samplePoints.map((p, index) => ({
        x: p.x,
        y: p.y,
        x0: p.x,
        y0: p.y,
        vx: 0,
        vy: 0,
        phase: index * 0.37
      }));
      draw();
    };

    const drawWire = () => {
      const radius = Math.max(46, Math.min(64, rect.width * 0.16));
      const linkDistance = 14;
      const now = performance.now() / 900;
      const active = [];

      particles.forEach((p) => {
        const dx = p.x0 - pointer.x;
        const dy = p.y0 - pointer.y;
        const dist = Math.hypot(dx, dy);
        const influence = pointer.active ? Math.max(0, 1 - dist / radius) : 0;
        if (influence > 0) {
          const angle = Math.atan2(dy, dx) + Math.sin(now + p.phase) * 0.22;
          const push = influence * 2.15;
          p.vx += Math.cos(angle) * push * 0.032;
          p.vy += Math.sin(angle) * push * 0.032;
          active.push(p);
        }
        p.vx += (p.x0 - p.x) * 0.105;
        p.vy += (p.y0 - p.y) * 0.105;
        p.vx *= 0.66;
        p.vy *= 0.66;
        p.x += p.vx;
        p.y += p.vy;
      });

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Draw the whole title as dense tiny white strokes on a transparent canvas.
      // This replaces the previous destination-out erase, so there is no black
      // circular/gradient hole and no black pixels are ever painted here.
      particles.forEach((p, index) => {
        const wobble = Math.sin(now * 1.6 + p.phase) * 0.22;
        const near = pointer.active ? Math.max(0, 1 - Math.hypot(p.x0 - pointer.x, p.y0 - pointer.y) / radius) : 0;
        const len = 1.05 + near * 2.15;
        const angle = (index % 3 === 0 ? 0 : (index % 3 === 1 ? Math.PI / 2 : -0.62)) + wobble + near * 0.55;
        ctx.globalAlpha = 0.45 + near * 0.46;
        ctx.strokeStyle = 'rgba(255,255,255,1)';
        ctx.lineWidth = 0.58 + near * 0.42;
        ctx.beginPath();
        ctx.moveTo(p.x - Math.cos(angle) * len, p.y - Math.sin(angle) * len);
        ctx.lineTo(p.x + Math.cos(angle) * len, p.y + Math.sin(angle) * len);
        ctx.stroke();
      });

      ctx.lineWidth = 0.45;
      ctx.strokeStyle = 'rgba(255,255,255,.86)';
      for (let i = 0; i < active.length; i += 1) {
        const a = active[i];
        let links = 0;
        for (let j = i + 1; j < active.length && links < 2; j += 1) {
          const b = active[j];
          const gap = Math.hypot(a.x - b.x, a.y - b.y);
          if (gap < linkDistance) {
            ctx.globalAlpha = Math.min(0.38, Math.max(0, 1 - gap / linkDistance));
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            links += 1;
          }
        }
      }
      ctx.restore();
    };

    const draw = () => {
      raf = 0;
      if (!rect) return;
      ctx.clearRect(0, 0, rect.width, rect.height);
      if (!pointer.active) return;
      drawWire();
      if (pointer.active || performance.now() - lastMove < 500) raf = window.requestAnimationFrame(draw);
    };

    const queue = () => { if (!raf) raf = window.requestAnimationFrame(draw); };
    const hideFilledTitle = () => {
      title.style.setProperty('opacity', '0', 'important');
      title.style.setProperty('color', 'transparent', 'important');
      title.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
    };
    const showFilledTitle = () => {
      title.style.setProperty('opacity', '1', 'important');
      title.style.setProperty('color', '#fff', 'important');
      title.style.setProperty('-webkit-text-fill-color', '#fff', 'important');
    };

    const move = (event) => {
      const canvasRect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - canvasRect.left;
      pointer.y = event.clientY - canvasRect.top;
      pointer.active = true;
      lastMove = performance.now();
      card.classList.add('is-title-wiring');
      hideFilledTitle();
      queue();
    };
    const leave = () => {
      pointer.active = false;
      card.classList.remove('is-title-wiring');
      showFilledTitle();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => { p.x = p.x0; p.y = p.y0; p.vx = 0; p.vy = 0; });
    };

    title.addEventListener('pointerenter', move, { passive: true });
    title.addEventListener('pointermove', move, { passive: true });
    title.addEventListener('pointerleave', leave, { passive: true });
    card.addEventListener('pointerleave', leave, { passive: true });
    window.addEventListener('resize', () => { rebuild(); queue(); });
    window.setTimeout(rebuild, 80);
    rebuild();
  }

  function setupGalleryTitleFragments() {
    const title = document.querySelector('[data-gallery-fragment-title]');
    if (!title || title.dataset.galleryFragmentsReady === '1') return;
    title.dataset.galleryFragmentsReady = '1';
    const text = title.textContent || '';
    title.setAttribute('aria-label', text.trim());
    title.textContent = '';

    const letters = [];
    Array.from(text).forEach((char, index) => {
      const span = document.createElement('span');
      span.className = char === ' ' ? 'gallery-title-space' : 'gallery-title-letter';
      span.textContent = char === ' ' ? '\u00a0' : char;
      span.style.setProperty('--letter-index', index);
      title.appendChild(span);
      if (char !== ' ') letters.push(span);
    });

    const canvas = document.createElement('canvas');
    canvas.className = 'gallery-source-title-fragments';
    canvas.setAttribute('aria-hidden', 'true');
    title.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let rect = null;
    let dpr = 1;
    let points = [];
    let pointer = { x: -9999, y: -9999, active: false };
    let raf = 0;

    const rebuild = () => {
      rect = title.getBoundingClientRect();
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      points = [];
      letters.forEach((letter, letterIndex) => {
        const r = letter.getBoundingClientRect();
        const localX = r.left - rect.left;
        const localY = r.top - rect.top;
        const count = Math.max(5, Math.min(13, Math.round(r.width / 3)));
        for (let i = 0; i < count; i += 1) {
              const px = localX + 2 + ((r.width - 4) * ((i + 0.5) / count));
          const py = localY + (r.height * (0.30 + ((i % 3) * 0.18)));
          points.push({ x: px, y: py, ox: px, oy: py, letterIndex, phase: (i * 0.71) + letterIndex });
        }
      });
    };

    const draw = () => {
      raf = 0;
      if (!ctx || !rect) return;
      ctx.clearRect(0, 0, rect.width, rect.height);
      if (!pointer.active) return;
      const active = [];
      const radius = 76;
      points.forEach((p) => {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < radius) {
          const force = (1 - dist / radius) * 18;
          p.x += (dx / dist) * force + Math.sin(performance.now() / 120 + p.phase) * 0.45;
          p.y += (dy / dist) * force + Math.cos(performance.now() / 140 + p.phase) * 0.45;
          active.push(p);
        } else {
          p.x += (p.ox - p.x) * 0.18;
          p.y += (p.oy - p.y) * 0.18;
        }
      });
      ctx.strokeStyle = 'rgba(255,255,255,.72)';
      ctx.lineWidth = 0.7;
      for (let i = 0; i < active.length; i += 1) {
        const a = active[i];
        for (let j = i + 1; j < active.length; j += 1) {
          const b = active[j];
          if (a.letterIndex !== b.letterIndex && Math.abs(a.letterIndex - b.letterIndex) > 1) continue;
          const gap = Math.hypot(a.x - b.x, a.y - b.y);
          if (gap < 24) {
            ctx.globalAlpha = Math.max(0, 1 - gap / 24) * 0.7;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,.78)';
      active.forEach((p) => {
        ctx.fillRect(p.x - 0.32, p.y - 0.32, 0.64, 0.64);
      });
      if (pointer.active) raf = window.requestAnimationFrame(draw);
    };

    const queue = () => { if (!raf) raf = window.requestAnimationFrame(draw); };
    const updatePointer = (event) => {
      rect = title.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = pointer.x >= -20 && pointer.y >= -20 && pointer.x <= rect.width + 20 && pointer.y <= rect.height + 20;
      queue();
    };
    const leave = () => {
      pointer.active = false;
      letters.forEach((letter) => letter.style.removeProperty('--fragment-shift'));
      queue();
    };

    title.addEventListener('pointermove', updatePointer, { passive: true });
    title.addEventListener('pointerenter', updatePointer, { passive: true });
    title.addEventListener('pointerleave', leave, { passive: true });
    window.addEventListener('resize', () => { rebuild(); queue(); });
    window.setTimeout(rebuild, 80);
    rebuild();
  }

  function createGalleryPanel() {
    const oldToggle = document.querySelector('.gallery-menu-toggle');
    const oldPanel = document.querySelector('.gallery-panel');
    oldToggle?.remove();
    oldPanel?.remove();
    if (document.querySelector('.toggle[data-gallery-kenji-toggle]')) return;

    const toggle = document.createElement('button');
    toggle.className = 'toggle';
    toggle.type = 'button';
    toggle.dataset.galleryKenjiToggle = '1';
    toggle.setAttribute('aria-label', 'Open gallery navigation panel');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<div class="toggle_body"><div class="bars bars_1"></div><div class="bars bars_2"></div><div class="bars bars_3"></div><div class="bars bars_4"></div><div class="bars bars_5"></div><div class="bars bars_6"></div><div class="bars bars_7"></div><div class="bars bars_8"></div><div class="bars bars_9"></div></div>';

    const panel = document.createElement('nav');
    panel.id = 'panel';
    panel.dataset.galleryKenjiPanel = '1';
    panel.setAttribute('aria-label', 'Gallery navigation panel');
    panel.setAttribute('aria-hidden', 'true');

    const panelItems = [
      { label: 'Home', back: 'Top', href: '#top', svg: '<svg version="1.1" x="0px" y="0px" width="72px" height="72px" viewBox="0 0 72 72"><path d="M67.572,37.08L38.686,8.168c-1.476-1.534-3.892-1.534-5.368,0L4.428,37.08c-1.48,1.529-0.929,2.786,1.224,2.786h6.023V62.07 c0,1.603,0.068,2.912,2.966,2.912h14.022V42.706h14.67v22.276h14.72c2.211,0,2.272-1.307,2.272-2.912V39.866h6.019C68.493,39.866,69.048,38.613,67.572,37.08z"/></svg>' },
      { label: 'Apps', back: 'Products', href: '#apps', svg: '<svg version="1.1" x="0px" y="0px" width="72px" height="72px" viewBox="0 0 72 72"><path d="M54.812,52.014c-8.873-3.234-11.711-5.963-11.711-11.805c0-3.506,2.711-2.361,3.899-8.784c0.493-2.664,2.887-0.043,3.349-6.124c0-2.423-1.308-3.028-1.308-3.028s0.666-3.589,0.925-6.347C50.284,12.484,47.98,3.6,35.661,3.6c-12.316,0-14.627,8.885-14.303,12.326c0.259,2.758,0.925,6.347,0.925,6.347s-1.31,0.601-1.31,3.028 c0.457,6.08,2.851,3.46,3.344,6.124c1.192,6.423,3.902,5.278,3.902,8.784c0,5.843-2.837,8.572-11.711,11.805 C7.602,55.253,1.82,58.561,1.82,60.818c0,2.255,0,7.578,0,7.578H69.5c0,0,0-5.323,0-7.578C69.5,58.564,63.715,55.257,54.812,52.014L54.812,52.014z"/></svg>' },
      { label: 'Blog', back: 'Writing', href: '#blog', svg: '<svg version="1.1" x="0px" y="0px" width="72px" height="72px" viewBox="0 0 72 72"><path d="M62.003,25.304C56.305,12.038,47.128,1.936,42.486,3.826c-7.879,3.204,4.699,18.59-34.005,34.322c-3.344,1.356-4.19,6.797-2.79,10.047c1.397,3.252,5.969,6.488,9.313,5.131c0.576-0.234,2.704-0.918,2.704-0.918c2.387,3.203,4.885,1.303,5.774,3.341c1.066,2.448,3.38,7.765,4.165,9.571c0.792,1.808,2.578,3.486,3.874,2.992c1.289-0.492,5.692-2.17,7.375-2.808c1.685-0.637,2.088-2.142,1.574-3.325c-0.555-1.275-2.83-1.65-3.479-3.14c-0.652-1.49-2.772-6.261-3.38-7.765c-0.828-2.045,0.932-3.709,3.492-3.975c17.619-1.836,20.912,9.047,26.91,6.606C68.645,52.014,67.7,38.57,62.003,25.304L62.003,25.304z M60.02,46.822c-1.031,0.418-7.963-5.047-12.396-15.361c-4.429-10.31-3.87-19.735-2.845-20.153c1.031-0.421,7.795,6.178,12.227,16.488C61.43,38.104,61.049,46.404,60.02,46.822z"/></svg>' },
      { label: 'MemFlow', back: 'Open', href: 'https://memflow.micheljohnson.top/', target: '_blank', svg: '<svg version="1.1" x="0px" y="0px" width="72px" height="72px" viewBox="0 0 72 72"><path d="M21.996,9.824v42.721c-2.326-0.486-5.033-0.302-7.718,0.691c-6.037,2.242-8.168,7.703-6.566,12.189c1.598,4.489,6.325,6.305,12.362,4.061c5.126-1.903,8.485-6.123,8.399-10.104c0,0,0-22.655,0-35.291l25.564-5.857v27.108c-2.326-0.486-5.033-0.302-7.719,0.691c-6.041,2.242-8.172,7.703-6.569,12.189c1.603,4.489,6.325,6.305,12.366,4.062c5.13-1.904,8.482-6.124,8.402-10.104V1.549L21.996,9.824L21.996,9.824z"/></svg>' },
      { label: 'Contact', back: 'Links', action: 'contact', svg: '<svg version="1.1" x="0px" y="0px" width="72px" height="72px" viewBox="0 0 72 72"><path d="M67.298,9.486C66.062,9.922,4.942,31.457,3.74,31.882c-1.022,0.36-1.253,1.242-0.036,1.724c1.444,0.58,13.666,5.476,13.666,5.476h-0.004l8.104,3.247c0,0,39.012-28.652,39.542-29.038c0.529-0.389,1.146,0.342,0.76,0.76c-0.385,0.421-28.336,30.65-28.336,30.65c-0.004,0-0.004,0-0.004,0l-1.626,1.814l2.156,1.158c0,0,16.74,9.012,17.932,9.655c1.045,0.562,2.405,0.094,2.707-1.206c0.356-1.534,10.242-44.143,10.463-45.086C69.35,9.802,68.536,9.05,67.298,9.486L67.298,9.486zM25.398,61.783c0,0.889,0.5,1.134,1.192,0.508c0.9-0.82,10.256-9.216,10.256-9.216l-11.448-5.927V61.783z"/></svg>' },
      { label: 'GitHub', back: 'Code', href: 'https://github.com/Michel-Johnson', target: '_blank', svg: '<svg version="1.1" x="0px" y="0px" width="72px" height="72px" viewBox="0 0 72 72"><path d="M54,14.864H43.718c-1.217,0-2.573,1.598-2.573,3.74v7.423H54v10.584H41.145v31.787h-12.14V36.615H18V26.027h11.005v-6.228c0-8.932,6.199-16.2,14.71-16.2H54v11.264V14.864z"/></svg>' },
      { label: 'LinkedIn', back: 'Profile', href: 'https://www.linkedin.com/in/jiarui-shang-2837a039b', target: '_blank', svg: '<svg version="1.1" x="0px" y="0px" width="72px" height="72px" viewBox="0 0 72 72"><path d="M69.12,15.455c-2.44,1.084-5.058,1.811-7.808,2.142c2.808-1.681,4.963-4.345,5.976-7.517c-2.624,1.555-5.533,2.689-8.626,3.298c-2.48-2.642-6.012-4.291-9.922-4.291c-7.506,0-13.59,6.084-13.59,13.586c0,1.066,0.119,2.102,0.353,3.096C24.21,25.204,14.195,19.793,7.495,11.571c-1.174,2.005-1.847,4.342-1.847,6.833c0,4.716,2.401,8.874,6.048,11.311c-2.228-0.072-4.324-0.68-6.156-1.699c0,0.058,0,0.112,0,0.169c0,6.584,4.687,12.074,10.901,13.327c-1.138,0.311-2.34,0.475-3.582,0.475c-0.875,0-1.724-0.082-2.556-0.24c1.728,5.4,6.75,9.328,12.694,9.436C18.346,54.829,12.489,57,6.12,57c-1.098,0-2.178-0.064-3.24-0.191c6.012,3.856,13.154,6.106,20.833,6.106c24.995,0,38.664-20.707,38.664-38.668c0-0.587-0.011-1.174-0.04-1.757C64.994,20.575,67.294,18.181,69.12,15.455L69.12,15.455z"/></svg>' },
      { label: 'Gmail', back: 'Copy', action: 'gmail', svg: '<svg version="1.1" x="0px" y="0px" width="72px" height="72px" viewBox="0 0 72 72"><path d="M54,46.8c-2.477,0-4.745,0.839-6.566,2.239L28.646,37.768c0.09-0.576,0.155-1.166,0.155-1.769c0-0.605-0.065-1.192-0.155-1.768l18.788-11.272c1.822,1.4,4.09,2.239,6.566,2.239c5.962,0,10.8-4.835,10.8-10.8s-4.838-10.8-10.8-10.8s-10.8,4.835-10.8,10.8c0,0.601,0.065,1.192,0.157,1.768L24.57,27.441c-1.822-1.404-4.093-2.243-6.57-2.243c-5.965,0-10.8,4.835-10.8,10.8c0,5.962,4.835,10.8,10.8,10.8c2.477,0,4.748-0.839,6.57-2.239l18.788,11.272C43.264,56.407,43.2,56.994,43.2,57.6c0,5.961,4.838,10.799,10.8,10.799S64.8,63.561,64.8,57.6C64.8,51.637,59.962,46.799,54,46.8L54,46.8z"/></svg>' },
      { label: 'Theme', back: 'Switch', action: 'theme', svg: '<svg version="1.1" x="0px" y="0px" width="72px" height="72px" viewBox="0 0 72 72"><path d="M2.419,48.441L3.6,43.402l-1.181-5.209c-0.032-0.155-0.328-0.274-0.691-0.274c-0.367,0-0.662,0.119-0.691,0.274L0,43.402l1.04,5.039c0.029,0.158,0.324,0.274,0.691,0.274C2.091,48.716,2.386,48.602,2.419,48.441z M9.799,51.239l1.001-7.79L9.799,31.4c-0.029-0.31-0.403-0.551-0.857-0.551c-0.457,0-0.832,0.238-0.853,0.547L7.2,43.449l0.889,7.79c0.022,0.306,0.396,0.544,0.853,0.544C9.396,51.787,9.77,51.545,9.799,51.239z M17.165,51.113L18,43.452l-0.835-16.045c-0.022-0.374-0.468-0.673-1.012-0.673c-0.547,0-0.994,0.295-1.012,0.673l-0.742,16.045l0.742,7.664c0.018,0.374,0.464,0.67,1.012,0.67C16.697,51.786,17.143,51.491,17.165,51.113z M37.001,51.826c0.022,0,25.556,0.014,25.722,0.014c5.127,0,9.277-4.018,9.277-8.975s-4.15-8.975-9.277-8.975c-1.273,0-2.484,0.248-3.589,0.698c-0.737-8.086-7.754-14.429-16.308-14.429c-2.092,0-4.133,0.396-5.934,1.073c-0.698,0.263-0.889,0.529-0.893,1.051v28.48C36.007,51.314,36.446,51.771,37.001,51.826L37.001,51.826z"/></svg>' }
    ];

    panel.innerHTML = `<div id="mask" aria-hidden="true"></div><ul>${panelItems.map((item, index) => {
      const inner = `<div class="front">${item.svg}</div><div class="back"><div class="wrap"><h3>${item.label}</h3><p class="panelbtn">${item.back}</p></div></div>`;
      if (item.action) return `<li class="panel-${index + 1}"><button type="button" class="multi_a" data-gallery-panel-action="${item.action}">${inner}</button></li>`;
      return `<li class="panel-${index + 1}"><a href="${item.href}"${item.target ? ` target="${item.target}" rel="noopener"` : ''}>${inner}</a></li>`;
    }).join('')}</ul>`;

    body.append(toggle, panel);

    function setOpen(open) {
      root.classList.toggle('toggled', open);
      body.classList.toggle('gallery-panel-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    }

    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      setOpen(!root.classList.contains('toggled'));
    });
    panel.querySelector('#mask')?.addEventListener('click', () => setOpen(false));
    panel.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => window.setTimeout(() => setOpen(false), 180));
    });
    panel.querySelectorAll('[data-gallery-panel-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const action = button.dataset.galleryPanelAction;
        setOpen(false);
        if (action === 'contact') document.querySelector('.brand-lockup[data-contact-open]')?.click();
        if (action === 'theme') document.querySelector('[data-theme-jump]')?.click();
        if (action === 'gmail') {
          try { await navigator.clipboard.writeText('micheljohnsonofficial@gmail.com'); } catch (_) {}
          document.querySelector('.brand-lockup[data-contact-open]')?.click();
        }
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false);
    });
  }

  function prepareTargets() {
    const galleryHome = isGallery() ? ensureGalleryHome() : null;
    document.querySelectorAll(targetSelector).forEach((node) => {
      if (node.dataset.galleryPanel === '1') return;
      node.classList.add('gallery-motion-target', 'viewin');
      node.style.removeProperty('--gallery-delay');
    });
    galleryHome?.querySelectorAll('.gallery-motion-target, .gallery-tile, .gallery-work-item, .gallery-writing-item').forEach((node) => {
      node.classList.add('gallery-motion-target', 'viewin');
      node.style.removeProperty('--gallery-delay');
    });
    if (isGallery()) {
      document.querySelectorAll('.sketch-card, .note-card, .blog-list a, .all-post-item').forEach(makeLineSvg);
    }
    initGalleryLineFrame(document);
  }

  function revealVisible() {
    const wT = window.scrollY || document.documentElement.scrollTop || 0;
    const wH = window.innerHeight || document.documentElement.clientHeight || 0;
    document.querySelectorAll('.viewin').forEach((node) => {
      const top = node.getBoundingClientRect().top + wT;
      const come = reduceMotion || (wT + wH > top + 100);
      node.classList.toggle('come', come);
      node.classList.toggle('gallery-come', come);
    });
  }

  function startObserver() {
    if (!body.classList.contains('gallery-ready') && !reduceMotion) return;
    revealVisible();
  }

  function removeLoader() {
    body.classList.remove('gallery-entering', 'preload');
    body.classList.add('gallery-ready');
    document.querySelector('.gallery-loader')?.remove();
    window.setTimeout(() => document.querySelector('.firstload')?.remove(), 1000);
    window.setTimeout(() => document.documentElement.classList.add('loaded'), 1000);
    revealVisible();
    updateGallerySidenav();
    startObserver();
  }

  function preloadGalleryAssets(onProgress) {
    const sources = ['./vendor/kenjiendo_v2/img/kenjiendo2.png', './vendor/kenjiendo_v2/img/main.jpg'];
    let loaded = 0;
    const done = () => {
      loaded += 1;
      onProgress(Math.ceil((100 * loaded) / sources.length));
    };
    sources.forEach((src) => {
      const image = new Image();
      image.onload = done;
      image.onerror = done;
      image.src = src;
      if (image.complete) done();
    });
  }

  function runLoader() {
    if (!isGallery() || reduceMotion) {
      removeLoader();
      return;
    }
    document.querySelector('.gallery-loader')?.remove();
    document.querySelector('.firstload')?.remove();
    body.classList.remove('gallery-ready');
    body.classList.add('gallery-entering', 'preload');
    const loader = document.createElement('div');
    loader.className = 'firstload gallery-loader';
    loader.setAttribute('aria-hidden', 'true');
    loader.innerHTML = '<div class="firstload_body"><div class="firstload_title"><div><h2><img src="./vendor/kenjiendo_v2/img/subtitle.png" width="213" alt="KENJI ENDO"></h2><h1><img src="./vendor/kenjiendo_v2/img/loading_4.png" width="755" alt="KENJI ENDO"></h1></div></div><span class="preloadbar"></span></div>';
    body.appendChild(loader);
    const bar = loader.querySelector('.preloadbar');
    let target = 0;
    let current = 0;
    let finished = false;
    preloadGalleryAssets((progress) => { target = Math.max(target, progress); });
    const timer = window.setInterval(() => {
      if (current < target) {
        current += 1;
        if (bar) bar.style.width = `${current}%`;
      }
      if (!finished && current >= 100) {
        finished = true;
        window.clearInterval(timer);
        loader.classList.add('is-leaving');
        removeLoader();
      }
    }, 10);
  }

  function setupGalleryMotion() {
    const gallery = isGallery();
    body.classList.toggle('gallery-theme-active', gallery);
    removeGalleryArtifacts();
    if (gallery) {
      prepareTargets();
      createGalleryTopNavigation();
      setupGalleryAnchorRouting();
      createGallerySidenav();
      setupGalleryHover();
      // Keep the adapted title clean: remove stale mask/canvas experiments.
      // They caused the visible black plate around the white title.
      guardGalleryTitleArtifacts();
      cleanGalleryTitleArtifacts(document);
      scrubGalleryBlackVeils(document);
      // Do not install the approximate title-particle canvas here.  It hid the
      // solid white title and made the black page background read as a local
      // mask/veil around the letters.  Keep the Gallery title as clean source
      // text until we can replace it with the original effect without overlays.
      removeGalleryNameWire();
      createGalleryPanel();
      body.classList.add('preview-home');
      body.classList.add('gallery-ready');
      revealVisible();
      updateGallerySidenav();
      startObserver();
      return;
    }
    prepareTargets();
    startObserver();
    body.classList.remove('gallery-entering', 'gallery-ready', 'gallery-panel-open', 'preload');
    return;
  }

  function removeGalleryNameWire() {
    document.querySelectorAll('.gallery-name-wire, .gallery-source-title-fragments, .gallery-title-canvas, .gallery-title-bk, .gallery-profile-card canvas, .gallery-profile-card [class*="mask"], .gallery-profile-card [id*="mask"], .gallery-profile-card [class*="canvas"], .gallery-profile-card [class*="fragment"]').forEach((node) => node.remove());
    document.querySelectorAll('.gallery-profile-card.is-title-wiring').forEach((node) => node.classList.remove('is-title-wiring'));
    document.querySelectorAll('.gallery-profile-card .gallery-source-title, #gallery-title').forEach((title) => {
      title.style.setProperty('opacity', '1', 'important');
      title.style.setProperty('visibility', 'visible', 'important');
      title.style.setProperty('color', '#fff', 'important');
      title.style.setProperty('-webkit-text-fill-color', '#fff', 'important');
      title.style.setProperty('background', 'transparent', 'important');
      title.style.setProperty('background-color', 'transparent', 'important');
      title.style.setProperty('background-image', 'none', 'important');
      title.style.setProperty('box-shadow', 'none', 'important');
      title.style.setProperty('filter', 'none', 'important');
      title.style.setProperty('-webkit-filter', 'none', 'important');
    });
  }

  setupGalleryMotion(false);
  window.addEventListener('michel:site-theme-change', () => {
    setupGalleryMotion();
  });
  window.addEventListener('scroll', () => {
    revealVisible();
    updateGallerySidenav();
  }, { passive: true });
  window.addEventListener('resize', () => {
    revealVisible();
    updateGallerySidenav();
  });
  window.addEventListener('hashchange', () => window.setTimeout(revealVisible, 80));
})();
