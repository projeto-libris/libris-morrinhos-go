const SUPABASE_URL     = 'https://kkveyupjkgewelovwzgw.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrdmV5dXBqa2dld2Vsb3Z3emd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NzU1MDIsImV4cCI6MjA5NzQ1MTUwMn0.etUcG_0e07QkgAReu6LO_Uv1Q0P5hmCF2y8XBGFWiyA';

  const { createClient } = supabase;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  document.getElementById('footer-year').textContent = new Date().getFullYear();

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
  }

  marked.setOptions({ gfm: true, breaks: true });

  function renderContent(text) {
    if (!text) return '';
    const html = marked.parse(text);
    return DOMPurify.sanitize(html);
  }

  function normalize(str) {
    return (str || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function escapeHtml(str) {
    return (str || '').toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showMaintenance(message) {
    document.title = 'Em manutenção - Libris Morrinhos (Goiás)';
    const body = document.querySelector('.card-body');
    const nav  = document.getElementById('card-nav');
    if (body) body.classList.add('is-maintenance');
    if (nav) nav.style.display = 'none';

    document.getElementById('card-main').innerHTML = `
      <div class="maintenance-block">
        <div class="maintenance-icon">🛠️</div>
        <h1 class="maintenance-title">Em manutenção</h1>
        <p class="maintenance-msg">${escapeHtml(message || 'Voltamos em breve.')}</p>
      </div>
    `;

    const sidebar = document.querySelector('.card-sidebar');
    if (sidebar) sidebar.innerHTML = '';
  }

  async function checkMaintenance() {
    try {
      const { data, error } = await sb
        .from('site_settings')
        .select('is_offline, maintenance_message')
        .eq('id', 1)
        .single();

      if (error || !data) return false;

      if (data.is_offline) {
        showMaintenance(data.maintenance_message);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  async function init() {
    const isOffline = await checkMaintenance();
    if (isOffline) return;

    const params      = new URLSearchParams(window.location.search);
    const postSlug    = params.get('artigo');
    const catSlug     = params.get('categoria');
    const searchQuery = params.get('busca');

    const searchInput = document.getElementById('search-input');
    if (searchInput && searchQuery) searchInput.value = searchQuery;

    const [{ data: categories }, { data: allPostsMini }] = await Promise.all([
      sb.from('categories').select('id, name, slug').order('name'),
      sb.from('posts').select('category_id')
    ]);

    const countMap = {};
    (allPostsMini || []).forEach(p => {
      if (p.category_id) countMap[p.category_id] = (countMap[p.category_id] || 0) + 1;
    });

    buildNav(categories || [], catSlug, postSlug);
    buildSidebar(categories || [], countMap);

    if (searchQuery) {
      await viewSearch(searchQuery);
    } else if (postSlug) {
      await viewPost(postSlug);
    } else if (catSlug) {
      await viewCategory(catSlug, categories || []);
    } else {
      await viewHome();
    }
  }

  function buildNav(categories, activeCat, activePost) {
    const nav = document.getElementById('nav-links');
    const allLink = document.getElementById('nav-all');

    if (!activeCat && !activePost) allLink.classList.add('active');

    categories.forEach(cat => {
      const a = document.createElement('a');
      a.href = `?categoria=${cat.slug}`;
      a.textContent = cat.name;
      if (activeCat === cat.slug) a.classList.add('active');
      nav.appendChild(a);
    });
  }

  function buildSidebar(categories, countMap) {
    const list = document.getElementById('cat-list');
    if (!categories.length) {
      list.innerHTML = '<li><span class="state-msg">Sem categorias.</span></li>';
      return;
    }
    list.innerHTML = categories.map(cat => `
      <li>
        <a href="?categoria=${cat.slug}">${cat.name}</a>
        <span class="cat-count">${countMap[cat.id] || 0}</span>
      </li>
    `).join('');
  }

  async function viewHome() {
    const main = document.getElementById('card-main');

    const { data: posts, error } = await sb
      .from('posts')
      .select('id, title, slug, content, excerpt, published_at, categories(name, slug)')
      .order('published_at', { ascending: false })
      .limit(10);

    if (error) { main.innerHTML = `<p class="state-msg">Erro: ${error.message}</p>`; return; }
    if (!posts || !posts.length) { main.innerHTML = '<p class="state-msg">Nenhum artigo publicado ainda.</p>'; return; }

    const [latest, ...older] = posts;
    const cat = latest.categories;

    let html = `
      <div>
        <div class="post-meta">
          <span>${formatDate(latest.published_at)}</span>
          ${cat ? `<a class="post-cat-tag" href="?categoria=${cat.slug}">${cat.name}</a>` : ''}
        </div>
        <h1 class="post-title">
          <a href="?artigo=${latest.slug}">${latest.title}</a>
        </h1>
        <div class="post-content">${renderContent(latest.content)}</div>
      </div>
    `;

    if (older.length) {
      html += `
        <div class="older-posts">
          <div class="section-label">Artigos publicados anteriormente</div>
          ${older.map(p => `
            <div class="post-list-item">
              <a class="post-list-title" href="?artigo=${p.slug}">${p.title}</a>
              <span class="post-list-date">${formatDate(p.published_at)}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    main.innerHTML = html;
  }

  async function viewPost(slug) {
    const main = document.getElementById('card-main');

    const { data: posts, error } = await sb
      .from('posts')
      .select('id, title, slug, content, published_at, categories(name, slug)')
      .eq('slug', slug)
      .limit(1);

    if (error || !posts || !posts.length) {
      main.innerHTML = `<a class="back-link" href="/">&larr; Voltar</a><p class="state-msg">Artigo não encontrado.</p>`;
      return;
    }

    const post = posts[0];
    const cat  = post.categories;

    document.title = `${post.title} - Libris Morrinhos (Goiás)`;

    main.innerHTML = `
      <a class="back-link" href="/">&larr; Todos os artigos</a>
      <div class="post-meta">
        <span>${formatDate(post.published_at)}</span>
        ${cat ? `<a class="post-cat-tag" href="?categoria=${cat.slug}">${cat.name}</a>` : ''}
      </div>
      <h1 class="post-title" style="font-size:1.85rem">${post.title}</h1>
      <div class="post-content">${renderContent(post.content)}</div>
    `;
  }

  async function viewCategory(catSlug, categories) {
    const main  = document.getElementById('card-main');
    const found = categories.find(c => c.slug === catSlug);

    const { data: posts, error } = await sb
      .from('posts')
      .select('id, title, slug, published_at, categories!inner(slug)')
      .eq('categories.slug', catSlug)
      .order('published_at', { ascending: false });

    if (error) { main.innerHTML = `<p class="state-msg">Erro: ${error.message}</p>`; return; }

    const catName = found ? found.name : catSlug;
    document.title = `${catName} - Libris Morrinhos (Goiás)`;

    let html = `
      <a class="back-link" href="/">&larr; Todos os artigos</a>
      <div class="category-posts-title">${catName}</div>
    `;

    if (!posts || !posts.length) {
      html += '<p class="state-msg">Nenhum artigo nesta categoria ainda.</p>';
    } else {
      html += posts.map(p => `
        <div class="post-list-item">
          <a class="post-list-title" href="?post=${p.slug}">${p.title}</a>
          <span class="post-list-date">${formatDate(p.published_at)}</span>
        </div>
      `).join('');
    }

    main.innerHTML = html;
  }

  async function viewSearch(rawQuery) {
    const main = document.getElementById('card-main');

    const query = normalize(rawQuery);
    if (!query) { await viewHome(); return; }

    main.innerHTML = '<p class="state-msg">Buscando...</p>';

    const { data: posts, error } = await sb
      .from('posts')
      .select('title, slug, excerpt, content, published_at');

    if (error) { main.innerHTML = `<p class="state-msg">Erro: ${error.message}</p>`; return; }

    document.title = `Pesquisa: ${rawQuery} - Libris Morrinhos (Goiás)`;

    if (!posts || !posts.length) {
      main.innerHTML = `<a class="back-link" href="/">&larr; Todos os artigos</a><p class="state-msg">Nenhum artigo encontrado para "${escapeHtml(rawQuery)}".</p>`;
      return;
    }

    const queryWords = query.split(/\s+/).filter(Boolean);

    function wordScore(normText, weightExact, weightSubstr) {
      if (!normText) return 0;
      let score = 0;
      queryWords.forEach(w => {
        const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${escaped}\\b`);
        if (re.test(normText)) score += weightExact;
        else if (normText.includes(w)) score += weightSubstr;
      });
      return score;
    }

    const scored = posts.map(p => {
      const nTitle   = normalize(p.title);
      const nExcerpt = normalize(p.excerpt);
      const nContent = normalize(p.content);

      let score = 0;
      if (nTitle === query) score += 100;
      else if (nTitle.includes(query)) score += 60;
      score += wordScore(nTitle, 15, 8);

      if (nExcerpt.includes(query)) score += 5;
      score += wordScore(nExcerpt, 3, 1);

      if (nContent.includes(query)) score += 2;
      score += wordScore(nContent, 1, 0.5);

      return { post: p, score };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.post.published_at) - new Date(a.post.published_at));

    if (scored.length) {
      window.location.replace(`?post=${scored[0].post.slug}`);
    } else {
      main.innerHTML = `<a class="back-link" href="/">&larr; Todos os artigos</a><p class="state-msg">Nenhum artigo encontrado para "${escapeHtml(rawQuery)}".</p>`;
    }
  }

  init().catch(err => {
    document.getElementById('card-main').innerHTML =
      `<p class="state-msg">Erro ao inicializar: ${err.message}</p>`;
  });
