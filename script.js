const API = '';  // نفس السيرفر
let currentPage = 1;
let currentQuery = '';
let currentCat = '';
let hasNext = false;

document.addEventListener('DOMContentLoaded', () => {
    loadCategories();
    document.getElementById('searchBtn').addEventListener('click', () => doSearch(1));
    document.getElementById('searchInput').addEventListener('keypress', e => { if (e.key === 'Enter') doSearch(1); });
    document.getElementById('prevPage').addEventListener('click', () => doSearch(currentPage - 1));
    document.getElementById('nextPage').addEventListener('click', () => doSearch(currentPage + 1));
});

async function loadCategories() {
    const res = await fetch('/api/categories');
    const cats = await res.json();
    const select = document.getElementById('categorySelect');
    cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.query;
        opt.textContent = c.name;
        select.appendChild(opt);
    });
}

async function doSearch(page) {
    const q = document.getElementById('searchInput').value.trim();
    const cat = document.getElementById('categorySelect').value;
    currentQuery = q;
    currentCat = cat;
    currentPage = page;

    const params = new URLSearchParams({ page, q, cat });
    const res = await fetch(`/api/search?${params}`);
    const data = await res.json();
    renderResults(data.items);
    hasNext = data.hasNext;
    document.getElementById('prevPage').style.display = page > 1 ? 'inline-block' : 'none';
    document.getElementById('nextPage').style.display = hasNext ? 'inline-block' : 'none';
}

function renderResults(items) {
    const container = document.getElementById('results');
    container.innerHTML = items.map(item => `
        <div class="card" onclick="showDetails('${item.url}')">
            <img src="${item.thumbnail}" alt="${item.title}" onerror="this.src='placeholder.jpg'">
            <h3>${item.title}</h3>
        </div>
    `).join('');
    document.getElementById('details').classList.add('hidden');
    document.getElementById('videoLinks').classList.add('hidden');
}

async function showDetails(url) {
    const res = await fetch(`/api/details?url=${encodeURIComponent(url)}`);
    const det = await res.json();
    const detailDiv = document.getElementById('detailContent');
    detailDiv.innerHTML = `
        <img src="${det.thumbnail}" style="max-width:200px;float:left;margin-left:20px;" onerror="this.src='placeholder.jpg'">
        <h2>${det.title}</h2>
        <p><strong>البلد:</strong> ${det.country}</p>
        <p><strong>القسم:</strong> ${det.category}</p>
        <p><strong>النوع/اللغة/السنة:</strong> ${det.genre}</p>
        <p><strong>الوصف:</strong> ${det.description}</p>
        <p><strong>الحالة:</strong> ${det.status}</p>
    `;
    document.getElementById('details').classList.remove('hidden');
    loadEpisodes(url);
}

async function loadEpisodes(animeUrl) {
    const res = await fetch(`/api/episodes?url=${encodeURIComponent(animeUrl)}`);
    const episodes = await res.json();
    const list = document.getElementById('episodesList');
    list.innerHTML = episodes.map((ep, i) => `
        <li onclick="loadVideos('${ep.url}')">${ep.title || `حلقة ${i+1}`}</li>
    `).join('');
}

async function loadVideos(epUrl) {
    const res = await fetch(`/api/videos?url=${encodeURIComponent(epUrl)}`, { method: 'POST' });
    const videos = await res.json();
    const list = document.getElementById('linksList');
    list.innerHTML = videos.map(v => `<li><a href="${v.url}" target="_blank">${v.quality || 'رابط'}</a></li>`).join('');
    document.getElementById('videoLinks').classList.remove('hidden');
}
