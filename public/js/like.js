document.addEventListener('DOMContentLoaded', async () => {
  const likeBtn = document.getElementById('like-btn');
  const likeCount = document.getElementById('like-count');
  const visitCount = document.getElementById('visit-count');

  async function fetchStats(){
    try{
      const r = await fetch('/api/stats', { credentials: 'same-origin' });
      const d = await r.json();
      if (likeCount) likeCount.textContent = d.likes ?? 0;
      if (visitCount) visitCount.textContent = d.visits ?? 0;
      if (d.liked) likeBtn?.classList.add('liked');
    }catch(_){}
  }

likeBtn?.addEventListener('click', async () => {
  try{
    const r = await fetch('/api/like', {
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json'}
    });
    const d = await r.json();
    if (d.likes != null) likeCount.textContent = d.likes;

    if (d.liked) {
      // Visual feedback
      likeBtn.classList.add('liked', 'pulse', 'heartbeat', 'pop');

      // Clean up temporary classes after animations finish
      setTimeout(()=> likeBtn.classList.remove('pulse'), 920);
      setTimeout(()=> likeBtn.classList.remove('heartbeat'), 560);
      setTimeout(()=> likeBtn.classList.remove('pop'), 380);
    }
  }catch(_){}
});

  fetchStats();
});
