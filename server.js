const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const BASE_URL = 'https://egydead.space';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ----------------------------------- Helper Axios instance -----------------------------------
const api = axios.create({
    headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'ar,en-US;q=0.9',
        'Referer': BASE_URL + '/',
    },
});

// ----------------------------------- DOOD Regex & Extractor -----------------------------------
const DOOD_REGEX = /(do*d(?:stream)?\.(?:com?|watch|to|s[ho]|cx|la|w[sf]|pm|re|yt|stream))\/[de]\/([0-9a-zA-Z]+)|ds2play/;

async function extractDood(url) {
    try {
        const res = await api.get(url);
        const html = res.data;
        const match = html.match(/\$\.get\('(\/pass_md5\/[^']+)'\)/);
        if (!match) return [];
        const passMd5Path = match[1];
        const doodOrigin = new URL(url).origin;
        const passUrl = doodOrigin + passMd5Path;
        const res2 = await api.get(passUrl, { headers: { Referer: url } });
        const videoUrl = res2.data.trim();
        if (videoUrl.startsWith('http')) {
            return [{ url: videoUrl, quality: 'Dood mirror' }];
        }
    } catch (e) {
        console.error('Dood extract error:', e.message);
    }
    return [];
}

// ----------------------------------- MixDrop Extractor -----------------------------------
async function extractMixDrop(url) {
    try {
        const res = await api.get(url);
        const html = res.data;
        const match = html.match(/var\s+link\s*=\s*atob\("([^"]+)"\)/);
        if (match) {
            const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
            if (decoded.startsWith('http')) {
                return [{ url: decoded, quality: 'MixDrop' }];
            }
        }
    } catch (e) {
        console.error('MixDrop extract error:', e.message);
    }
    return [];
}

// ----------------------------------- StreamWish & generic sources extractor -----------------------------------
const STREAMWISH_REGEX = /ajmidyad|alhayabambi|atabknh[ks]|https:\/\/.*\.sbs\/e\//;

async function extractStreamWishGeneric(url) {
    try {
        const res = await api.get(url);
        const $ = cheerio.load(res.data);
        const script = $('script:containsData(sources)').first().html();
        if (!script) return [];

        // extract sources array
        const sourcesMatch = script.match(/sources:\s*(\[[^\]]*\])/);
        if (!sourcesMatch) return [];
        let sources;
        try {
            sources = JSON.parse(sourcesMatch[1]);
        } catch {
            return [];
        }

        // extract quality labels if present
        const labelsMatch = script.match(/'qualityLabels'\s*:\s*(\{[^}]+\})/);
        let labels = {};
        if (labelsMatch) {
            try {
                labels = JSON.parse(labelsMatch[1].replace(/'/g, '"'));
            } catch { }
        }

        return sources.map(src => ({
            url: src.file,
            quality: labels[src.file] || src.label || 'StreamWish',
        }));
    } catch (e) {
        console.error('StreamWish extract error:', e.message);
    }
    return [];
}

// ----------------------------------- Uqload custom extractor -----------------------------------
async function extractUqload(url) {
    try {
        const newURL = url.replace('https://uqload.co/', 'https://www.uqload.co/');
        const res = await api.get(newURL);
        const $ = cheerio.load(res.data);
        const script = $('script:containsData(sources)').first().html();
        if (!script) return [];
        // data format: sources: ["https://..."]
        const start = script.indexOf('sources: ["') + 11;
        const end = script.indexOf('"]', start);
        if (start > 10 && end > start) {
            const streamLink = script.substring(start, end);
            if (streamLink.startsWith('http')) {
                return [{ url: streamLink, quality: 'Uqload: Mirror' }];
            }
        }
    } catch (e) {
        console.error('Uqload extract error:', e.message);
    }
    return [];
}

// ----------------------------------- Main video dispatcher -----------------------------------
async function extractVideos(url) {
    if (DOOD_REGEX.test(url)) {
        return extractDood(url);
    }
    if (url.includes('mdbekjwqa')) {
        return extractMixDrop(url);
    }
    if (url.includes('uqload')) {
        return extractUqload(url);
    }
    if (STREAMWISH_REGEX.test(url) || url.includes('ahvsh') || url.includes('fanakishtuna')) {
        return extractStreamWishGeneric(url);
    }
    return [];
}

// ========================================== EXPRESS ROUTES ==========================================

// Serve static files (index.html, style.css, script.js)
app.use(express.static(__dirname, { index: 'index.html' }));

// ----------------------------------- /api/popular -----------------------------------
app.get('/api/popular', async (req, res) => {
    try {
        const { data } = await api.get(BASE_URL);
        const $ = cheerio.load(data);
        const items = [];
        $('div.pin-posts-list li.movieItem').each((i, el) => {
            const a = $(el).find('a').first();
            const href = a.attr('href');
            const title = $(el).find('h1.BottomTitle').text().trim();
            const thumb = $(el).find('img').attr('src');
            if (href) items.push({ url: href, title, thumbnail: thumb });
        });
        res.json(items);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ----------------------------------- /api/latest?page=1 -----------------------------------
app.get('/api/latest', async (req, res) => {
    const page = req.query.page || 1;
    try {
        const { data } = await api.get(`${BASE_URL}/?page=${page}/`);
        const $ = cheerio.load(data);
        const items = [];
        $('section.main-section li.movieItem').each((i, el) => {
            const a = $(el).find('a').first();
            const href = a.attr('href');
            const title = $(el).find('h1.BottomTitle').text().trim();
            const thumb = $(el).find('img').attr('src');
            if (href) items.push({ url: href, title, thumbnail: thumb });
        });
        // next page existence
        const next = $('div.pagination ul.page-numbers li a.next').length > 0;
        res.json({ items, hasNext: next });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ----------------------------------- /api/search?q=...&page=1&cat=category/... -----------------------------------
app.get('/api/search', async (req, res) => {
    const { q, page = 1, cat } = req.query;
    let url;
    if (q && q.trim()) {
        url = `${BASE_URL}/page/${page}/?s=${encodeURIComponent(q)}`;
    } else if (cat) {
        url = `${BASE_URL}/${cat}/?page=${page}/`;
    } else {
        // fallback to popular
        url = BASE_URL;
    }
    try {
        const { data } = await api.get(url);
        const $ = cheerio.load(data);
        const items = [];
        $('div.catHolder li.movieItem').each((i, el) => {
            const a = $(el).find('a').first();
            const href = a.attr('href');
            const title = $(el).find('h1.BottomTitle').text().trim();
            const thumb = $(el).find('img').attr('src');
            if (href) items.push({ url: href, title, thumbnail: thumb });
        });
        const nextPage = $('div.pagination-two a:contains(›)').length > 0;
        res.json({ items, hasNext: nextPage });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ----------------------------------- /api/details?url=... (relative url) -----------------------------------
app.get('/api/details', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url required' });
    try {
        const { data } = await api.get(BASE_URL + url);
        const $ = cheerio.load(data);
        const title = $('div.infoBox div.singleTitle').text().trim();
        const thumbnail = $('div.single-thumbnail img').attr('src');
        const country = $('div.LeftBox li:contains(البلد) a').text().trim();
        const category = $('div.LeftBox li:contains(القسم) a').text().trim();
        const genre = $('div.LeftBox li:contains(النوع) a, div.LeftBox li:contains(اللغه) a, div.LeftBox li:contains(السنه) a')
            .map((i, el) => $(el).text().trim()).get().join(', ');
        const description = $('div.infoBox div.extra-content p').text().trim();
        const status = (title.includes('كامل') || title.includes('فيلم')) ? 'Completed' : 'Ongoing';
        res.json({ title, thumbnail, country, category, genre, description, status });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ----------------------------------- /api/episodes?url=... -----------------------------------
app.get('/api/episodes', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url required' });
    try {
        const episodes = [];
        const addEpisodes = async (epUrl, final = false) => {
            const fullUrl = epUrl.startsWith('http') ? epUrl : BASE_URL + epUrl;
            const { data } = await api.get(fullUrl);
            const $ = cheerio.load(data);

            if (final) {
                $('div.EpsList li a').each((i, el) => {
                    const href = $(el).attr('href');
                    let name = $(el).attr('title') || $(el).text().trim();
                    const seasonText = $('div.infoBox div.singleTitle').text();
                    if (seasonText.includes('موسم')) {
                        const seasonNum = seasonText.split('الموسم ')[1]?.split(' ')[0];
                        name = `الموسم ${seasonNum} ${name}`;
                    }
                    if (href) episodes.push({ url: href, title: name });
                });
            } else if (epUrl.includes('assembly')) {
                $('div.salery-list li.movieItem a').each((i, el) => {
                    const href = $(el).attr('href');
                    const title = $(el).attr('title') || $(el).text().trim();
                    if (href) episodes.push({ url: href, title });
                });
            } else if (epUrl.includes('serie') || epUrl.includes('season')) {
                const seasonList = $('div.seasons-list li.movieItem a');
                if (seasonList.length === 0) {
                    $('div.EpsList li a').each((i, el) => {
                        const href = $(el).attr('href');
                        const name = $(el).attr('title') || $(el).text().trim();
                        if (href) episodes.push({ url: href, title: name });
                    });
                } else {
                    const seasonLinks = [];
                    seasonList.each((i, el) => seasonLinks.push($(el).attr('href')));
                    for (const link of seasonLinks) {
                        await addEpisodes(link, true);
                    }
                }
            } else if (epUrl.includes('episode')) {
                const parentLink = $('#breadcrumbs li a[itemprop=url]').attr('href');
                if (parentLink) {
                    await addEpisodes(parentLink);
                }
            } else {
                episodes.push({ url: epUrl, title: 'مشاهدة' });
            }
        };
        await addEpisodes(url);
        res.json(episodes);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ----------------------------------- /api/videos?url=... (episode relative url) -----------------------------------
app.post('/api/videos', async (req, res) => {
    const url = req.query.url; // still pass via query to simplify frontend fetch
    if (!url) return res.status(400).json({ error: 'url required' });
    try {
        const postUrl = BASE_URL + url;
        const response = await api.post(postUrl, 'View=1', {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': BASE_URL + '/',
            },
        });
        const $ = cheerio.load(response.data);
        const servers = [];
        $('ul.serversList li').each((i, el) => {
            const dataLink = $(el).attr('data-link');
            if (dataLink) servers.push(dataLink);
        });

        // extract videos concurrently
        const videoArrays = await Promise.all(servers.map(srv => extractVideos(srv)));
        const allVideos = videoArrays.flat();
        res.json(allVideos);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ----------------------------------- /api/categories -----------------------------------
app.get('/api/categories', (req, res) => {
    res.json([
        { name: 'اختر القسم', query: '' },
        { name: 'افلام اجنبى', query: 'category/افلام-اجنبي' },
        { name: 'افلام اسلام الجيزاوى', query: 'category/ترجمات-اسلام-الجيزاوي' },
        { name: 'افلام انمى', query: 'category/افلام-كرتون' },
        { name: 'افلام تركيه', query: 'category/افلام-تركية' },
        { name: 'افلام اسيويه', query: 'category/افلام-اسيوية' },
        { name: 'افلام مدبلجة', query: 'category/افلام-اجنبية-مدبلجة' },
        { name: 'سلاسل افلام', query: 'assembly' },
        { name: 'مسلسلات اجنبية', query: 'series-category/مسلسلات-اجنبي' },
        { name: 'مسلسلات انمى', query: 'series-category/مسلسلات-انمي' },
        { name: 'مسلسلات تركية', query: 'series-category/مسلسلات-تركية' },
        { name: 'مسلسلات اسيوىة', query: 'series-category/مسلسلات-اسيوية' },
        { name: 'مسلسلات لاتينية', query: 'series-category/مسلسلات-لاتينية' },
        { name: 'المسلسلات الكاملة', query: 'serie' },
        { name: 'المواسم الكاملة', query: 'season' },
    ]);
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
