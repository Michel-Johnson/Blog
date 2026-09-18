(() => {
  if (navigator.webdriver || location.search.includes('theme=professional')) return;
  let id;
  try {
    id = localStorage.getItem('michel-visitor-v1') || crypto.randomUUID();
    localStorage.setItem('michel-visitor-v1', id);
  } catch { id = crypto.randomUUID(); }
  const slug = new URLSearchParams(location.search).get('slug');
  const page = location.pathname === '/post.html' && slug ? '/post.html?slug=' + slug.slice(0,120) : '/';
  const send = () => fetch('/api/traffic', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id,page}), keepalive:true
  }).catch(() => {});
  if (document.readyState === 'complete') send();
  else window.addEventListener('load', send, {once:true});
})();
