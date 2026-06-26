const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://animesonline.io';

// --- MANIFEST ---
const manifest = {
    id: "org.animesonline.io",
    version: "1.1.0",
    name: "Animes Online Addon",
    description: "Assista animes diretamente do animesonline.io no Stremio. Organizado por episódios.",
    resources: ["catalog", "meta", "stream"],
    types: ["anime", "series", "movie"],
    idPrefixes: ["ao:"],
    catalogs: [
        {
            type: "anime",
            id: "ao_popular",
            name: "Animes Online - Populares",
            extra: [{ name: "search", isRequired: false }]
        },
        {
            type: "anime",
            id: "ao_recent",
            name: "Animes Online - Lançamentos",
            extra: [{ name: "search", isRequired: false }]
        }
    ]
};

// --- SCRAPER FUNCTIONS ---
async function getCatalog(type, id, search = null) {
    let url = BASE_URL;
    if (search) {
        url = `${BASE_URL}/?s=${encodeURIComponent(search)}`;
    } else if (id === 'ao_recent') {
        url = `${BASE_URL}/lancamentos/`;
    }

    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });
        const $ = cheerio.load(data);
        const results = [];

        // Seletor validado no teste
        $('.listupd article, .bs').each((i, el) => {
            const linkEl = $(el).find('a').first();
            let title = linkEl.attr('title') || $(el).find('h2').text().trim() || $(el).find('.tt').text().trim();
            const link = linkEl.attr('href');
            const poster = $(el).find('img').attr('src');
            
            if (link && title) {
                // Limpar título se vier duplicado (comum no seletor .bs)
                if (title.includes(title.substring(0, title.length / 2)) && title.length > 20) {
                    // Heurística simples para títulos duplicados no .bs
                }

                const slug = link.replace(BASE_URL, '').replace(/\//g, '');
                if (slug) {
                    results.push({
                        id: `ao:${slug}`,
                        type: title.toLowerCase().includes('filme') ? 'movie' : 'series',
                        name: title,
                        poster: poster,
                        description: title
                    });
                }
            }
        });

        return results;
    } catch (e) {
        console.error("Catalog Error:", e.message);
        return [];
    }
}

async function getMeta(id) {
    const slug = id.replace('ao:', '');
    // Tenta carregar a página do anime para pegar a lista de episódios
    // Muitas vezes o slug de um episódio leva à página do anime ou vice-versa
    let url = `${BASE_URL}/anime/${slug}/`;
    
    try {
        let response;
        try {
            response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
        } catch (e) {
            url = `${BASE_URL}/${slug}/`;
            response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
        }

        const $ = cheerio.load(response.data);
        const title = $('.entry-title').text().trim() || $('h1').text().trim();
        const poster = $('.thumb img').attr('src') || $('meta[property="og:image"]').attr('content');
        const description = $('.entry-content p').text().trim() || $('.sinopse').text().trim();
        
        const videos = [];
        // Seletor validado: .eplister li
        $('.eplister li').each((i, el) => {
            const epLink = $(el).find('a').attr('href');
            const epNumText = $(el).find('.epl-num').text().trim();
            const epTitle = $(el).find('.epl-title').text().trim();
            const epNum = parseInt(epNumText) || (i + 1);

            if (epLink) {
                const epSlug = epLink.replace(BASE_URL, '').replace(/\//g, '');
                videos.push({
                    id: `ao:${slug}:${epSlug}`,
                    title: epTitle || `Episódio ${epNum}`,
                    season: 1,
                    number: epNum,
                    released: new Date().toISOString()
                });
            }
        });

        // Se não houver episódios (pode ser um filme ou página de episódio direto)
        if (videos.length === 0) {
            // Verifica se tem link para "Todos os Episódios" para tentar pegar a lista de lá
            const allEpsLink = $('.all-episodes a, a:contains("Todos os Episódios")').attr('href');
            if (allEpsLink && !allEpsLink.includes(url)) {
                const allEpsSlug = allEpsLink.replace(BASE_URL, '').replace('/anime/', '').replace(/\//g, '');
                return await getMeta(`ao:${allEpsSlug}`);
            }

            videos.push({
                id: `ao:${slug}:${slug}`,
                title: title,
                season: 1,
                number: 1
            });
        }

        return {
            id: id,
            type: title.toLowerCase().includes('filme') ? 'movie' : 'series',
            name: title,
            poster: poster,
            description: description,
            videos: videos.sort((a, b) => a.number - b.number)
        };
    } catch (e) {
        console.error("Meta Error:", e.message);
        return null;
    }
}

async function getStreams(id) {
    const parts = id.split(':');
    const epSlug = parts[parts.length - 1];
    const url = `${BASE_URL}/${epSlug}/`;

    try {
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });
        const $ = cheerio.load(data);
        const streams = [];
        
        // No site, o player costuma estar em um iframe ou carregado via JS
        $('iframe').each((i, el) => {
            let src = $(el).attr('src') || $(el).attr('data-src');
            if (src && !src.includes('google') && !src.includes('facebook') && !src.includes('ads')) {
                streams.push({
                    title: `Player ${i + 1}`,
                    url: src.startsWith('//') ? `https:${src}` : src
                });
            }
        });

        return streams;
    } catch (e) {
        console.error("Stream Error:", e.message);
        return [];
    }
}

// --- ADDON HANDLERS ---
const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async (args) => {
    const search = args.extra && args.extra.search ? args.extra.search : null;
    const metas = await getCatalog(args.type, args.id, search);
    return { metas };
});

builder.defineMetaHandler(async (args) => {
    const meta = await getMeta(args.id);
    return { meta };
});

builder.defineStreamHandler(async (args) => {
    const streams = await getStreams(args.id);
    return { streams };
});

// --- SERVER ---
const addonInterface = builder.getInterface();
serveHTTP(addonInterface, { port: process.env.PORT || 7000 });

console.log("Addon running on port", process.env.PORT || 7000);
