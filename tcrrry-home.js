const MEM_CACHE = {};

function sanitizeMetadata(track, artist) {
  let cleanTrack = track || '';
  let cleanArtist = artist || '';
  
  if (cleanArtist === '' || cleanArtist === '黄霄' || cleanArtist === '黄' || cleanArtist.includes('\uFFFD')) {
    cleanArtist = '黄霄雲';
  }
  
  const trackLower = cleanTrack.toLowerCase();
  if (cleanTrack.includes('式微') || trackLower.includes('shivi') || trackLower.includes('式微')) {
    cleanTrack = '式微 (《牧神记》动画片尾曲)';
    cleanArtist = '黄霄雲';
  } else if (cleanTrack.includes('莲花') || trackLower.includes('lianhua') || trackLower.includes('盛开')) {
    cleanTrack = '莲花盛开 (庆祝澳门回归25周年青春献礼歌)';
    cleanArtist = '黄霄雲';
  }
  
  return { track: cleanTrack, artist: cleanArtist };
}

function cleanName(str) {
  if (!str) return '';
  // Remove standard parenthesized descriptors like (feat. ...), (with ...), (remastered ...)
  let cleaned = str
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\(with.*?\)/gi, '')
    .replace(/\(remastered.*?\)/gi, '')
    .replace(/\(.*? - Single\)/gi, '')
    .replace(/\(.*? - EP\)/gi, '')
    .replace(/\(.*? - Album\)/gi, '');
    
  // Strip general parentheses (both English and Chinese full-width) and brackets at the end of the song title
  cleaned = cleaned.replace(/[\(（\[【].*?[\)）\]】]/g, '');
  
  // Handle truncated or unbalanced open parentheses at the end of the string
  cleaned = cleaned.replace(/[\(（\[【].*$/, '');
  
  return cleaned.trim();
}

function isBilibiliTrack(t) {
  if (!t) return false;
  const name = (t.name || '').toLowerCase();
  const artist = (t.artist?.['#text'] || '').toLowerCase();
  const album = (t.album?.['#text'] || '').toLowerCase();
  return name.includes('bilibili') || name.includes('b站') || name.includes('哔哩哔哩') ||
         artist.includes('bilibili') || artist.includes('b站') || artist.includes('哔哩哔哩') ||
         album.includes('bilibili') || album.includes('b站') || album.includes('哔哩哔哩');
}

function renderSpecsBadges(vol, srMax, srActual, ch, enc, dt, losslessTrack, hiResTrack, atmosTrack) {
  const badges = [];
  
  const encUpper = (enc || '').toUpperCase();
  
  // 1. Determine lossless state: ONLY true if Apple Music catalog lookup confirmed lossless or hi-res lossless
  const isLossless = !!(losslessTrack || hiResTrack);
  const isHiRes = !!hiResTrack;
  
  // 2. Format name: ALAC if catalog lossless, otherwise AAC
  const formatName = isLossless ? 'ALAC' : 'AAC';
  
  // 3. Sample rate value: use actual or max, fallback to 48000 for standard, 96000 for Hi-Res
  const srVal = srActual || srMax || (isHiRes ? 96000 : 48000);
  const khz = (srVal / 1000).toFixed(1).replace(/\.0$/, '') + ' kHz';
  
  // 4. Bit depth (only determined for lossless catalog tracks)
  let bitDepth = '';
  if (isLossless) {
    if (encUpper.includes('16')) {
      bitDepth = '16-bit';
    } else if (encUpper.includes('24')) {
      bitDepth = '24-bit';
    } else if (isHiRes) {
      bitDepth = '24-bit';
    } else {
      // Infer from sample rate
      if (srVal > 48000) {
        bitDepth = '24-bit';
      } else if (srVal <= 44100) {
        bitDepth = '16-bit';
      } else {
        // For 48000 Hz, default to 24-bit
        bitDepth = '24-bit';
      }
    }
  }
  
  // 5. Render quality and format badges
  if (isLossless) {
    if (isHiRes || srVal > 48000) {
      badges.push('<span class="badge badge-hires">Hi-Res Lossless</span>');
    } else {
      badges.push('<span class="badge badge-lossless">Lossless</span>');
    }
    badges.push(`<span class="badge badge-format">${formatName}</span>`);
  } else {
    badges.push(`<span class="badge badge-format">${formatName}</span>`);
  }
  
  // 6. Render bit-depth and sample rate
  if (isLossless && bitDepth) {
    badges.push(`<span class="badge">${bitDepth}/${khz}</span>`);
  } else {
    badges.push(`<span class="badge">${khz}</span>`);
  }
  
  // 7. Channel mode
  if (ch) {
    badges.push(`<span class="badge">${ch.toUpperCase()}</span>`);
  }
  
  // 8. Volume
  if (vol > 0) {
    badges.push(`<span class="badge">Vol: ${vol}%</span>`);
  }
  
  return badges.join('');
}

function renderRecentTracksHtml(recentTracks, serverTime) {
  if (!recentTracks || recentTracks.length === 0) {
    return `<div style="text-align:center; color:rgba(255,255,255,0.25); font-size:13px; padding: 20px 0;">暂无播放记录</div>`;
  }
  return recentTracks.map(t => {
    const title = t.track || '未知歌曲';
    const artistName = t.artist || '未知歌手';
    const cov = t.cover || 'https://y.gtimg.cn/mediastyle/global/img/album_300.png';
    let relativeTime = '';
    if (t.now_playing) {
      relativeTime = '<span style="color:#ff2d55; font-weight:600;">正在播放</span>';
    } else if (t.uts) {
      const diff = serverTime - t.uts;
      if (diff < 60) relativeTime = '刚刚';
      else if (diff < 3600) relativeTime = Math.floor(diff / 60) + '分钟前';
      else if (diff < 86400) relativeTime = Math.floor(diff / 3600) + '小时前';
      else relativeTime = Math.floor(diff / 86400) + '天前';
    } else {
      relativeTime = '先前';
    }
    return `
      <div class="history-item">
        <img class="history-cover" src="${cov}" alt="${title}">
        <div class="history-info">
          <div class="history-title">${title}</div>
          <div class="history-artist">${artistName}</div>
        </div>
        <div class="history-time">${relativeTime}</div>
      </div>
    `;
  }).join('');
}

function getCacheKey(artist, track) {
  const clean = (artist + ":" + track)
    .trim()
    .toLowerCase()
    .replace(/[\s\r\n\t]/g, '');
  return "lyric_cache:" + encodeURIComponent(clean);
}

async function debugAppleMusicTraits(track, artist) {
  const steps = [];
  let lossless = false;
  let hiResLossless = false;
  let dolbyAtmos = false;
  
  try {
    const query = `${track} ${artist}`;
    steps.push(`Query: ${query}`);
    const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;
    steps.push(`Search URL: ${searchUrl}`);
    
    const sRes = await fetch(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    steps.push(`Search HTTP Status: ${sRes.status}`);
    const sText = await sRes.text();
    steps.push(`Search response length: ${sText.length}`);
    
    let sData;
    try {
      sData = JSON.parse(sText);
    } catch(e) {
      steps.push(`JSON parse search error: ${e.message}`);
    }
    
    if (sData?.results?.length > 0) {
      const trackUrl = sData.results[0].trackViewUrl;
      steps.push(`Track URL found: ${trackUrl}`);
      if (trackUrl) {
        const pageRes = await fetch(trackUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        steps.push(`Page HTTP Status: ${pageRes.status}`);
        const html = await pageRes.text();
        steps.push(`Page HTML length: ${html.length}`);
        
        const m = html.match(/id="serialized-server-data"[^>]*>([^<]+)<\/script>/);
        if (m) {
          steps.push(`Found serialized-server-data match of length: ${m[1].length}`);
          let serverData;
          try {
            serverData = JSON.parse(m[1]);
            steps.push(`Successfully parsed serialized-server-data JSON`);
          } catch(e) {
            steps.push(`JSON parse page error: ${e.message}`);
          }
          
          if (serverData) {
            let badges = null;
            let foundNames = [];
            function findBadges(obj) {
              if (badges !== null) return;
              if (obj && typeof obj === 'object') {
                if ('audioBadges' in obj) {
                  const name = obj.name || '';
                  foundNames.push(name);
                  const tName = track.toLowerCase();
                  if (!name || tName.includes(name.toLowerCase()) || name.toLowerCase().includes(tName)) {
                    badges = obj.audioBadges;
                    return;
                  }
                }
                for (const k in obj) {
                  if (Object.prototype.hasOwnProperty.call(obj, k)) {
                    findBadges(obj[k]);
                  }
                }
              }
            }
            findBadges(serverData);
            steps.push(`Found names with audioBadges: ${JSON.stringify(foundNames)}`);
            if (badges) {
              steps.push(`Badges found: ${JSON.stringify(badges)}`);
              lossless = !!badges.lossless;
              hiResLossless = !!badges.hiResLossless;
              dolbyAtmos = !!badges.dolbyAtmos;
            } else {
              steps.push(`No matching badges found (name match failed)`);
            }
          }
        } else {
          steps.push(`Regex match for serialized-server-data failed`);
          steps.push(`HTML prefix: ${html.substring(0, 1000)}`);
        }
      }
    } else {
      steps.push(`No results in search response`);
    }
  } catch(e) {
    steps.push(`Global error: ${e.message}`);
  }
  
  return { lossless, hiResLossless, dolbyAtmos, steps };
}

async function getAppleMusicTraits(track, artist) {
  let lossless = false;
  let hiResLossless = false;
  let dolbyAtmos = false;
  let success = false;
  
  try {
    const routerUrl = `https://router.tcrrry.com/cgi-bin/music_status?action=apple_music_traits&track=${encodeURIComponent(track)}&artist=${encodeURIComponent(artist)}`;
    const res = await fetch(routerUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      cf: { cacheTtl: 0 }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.found) {
        lossless = !!data.lossless;
        hiResLossless = !!data.hiResLossless;
        dolbyAtmos = !!data.dolbyAtmos;
        success = true;
      }
    }
  } catch(e) {}
  
  return { lossless, hiResLossless, dolbyAtmos, success };
}

async function getCachedSongData(artist, track) {
  if (!artist || !track) return null;
  const key = getCacheKey(artist, track);
  
  // 1. Memory Cache
  if (MEM_CACHE[key]) {
    return Object.assign({}, MEM_CACHE[key], { source: "memory" });
  }
  
  // 2. Cache API
  try {
    const cacheUrl = `https://tcrrry.com/cache/lyrics?key=${key}`;
    const cachedResponse = await caches.default.match(new Request(cacheUrl));
    if (cachedResponse) {
      const data = await cachedResponse.json();
      MEM_CACHE[key] = data;
      return Object.assign({}, data, { source: "cache_api" });
    }
  } catch(e) {}
  
  // 3. KV Cache
  if (typeof MUSIC_KV !== 'undefined') {
    try {
      const data = await MUSIC_KV.get(key);
      if (data) {
        const parsed = JSON.parse(data);
        MEM_CACHE[key] = parsed;
        return Object.assign({}, parsed, { source: "kv" });
      }
    } catch (e) {
      throw e;
    }
  }
  return null;
}

async function setCachedSongData(artist, track, data) {
  if (!artist) return "Artist empty";
  if (!track) return "Track empty";
  if (!data) return "Data empty";
  
  const key = getCacheKey(artist, track);
  
  // 1. Memory Cache
  MEM_CACHE[key] = data;
  
  // 2. Cache API
  let cacheErr = null;
  try {
    const cacheUrl = `https://tcrrry.com/cache/lyrics?key=${key}`;
    const response = new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json;charset=utf-8",
        "Cache-Control": "public, max-age=2592000"
      }
    });
    await caches.default.put(new Request(cacheUrl), response);
  } catch(e) {
    cacheErr = "CacheAPI: " + e.message;
  }
  
  // 3. KV Cache
  let kvErr = null;
  if (typeof MUSIC_KV !== 'undefined') {
    try {
      await MUSIC_KV.put(key, JSON.stringify(data), { expirationTtl: 2592000 });
    } catch (e) {
      kvErr = "KV: " + e.message;
    }
  } else {
    kvErr = "KV undefined";
  }
  
  if (cacheErr || kvErr) {
    return [cacheErr, kvErr].filter(Boolean).join('; ');
  }
  return null;
}

async function getQQMusicData(track, artist) {
  let cover = '', lyrics = '', duration = 0;
  try {
    const query = `${track} ${artist}`;
    const cleanQuery = cleanName(query);
    const searchUrl = `https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?format=json&w=${encodeURIComponent(cleanQuery)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://y.qq.com'
      }
    });
    const data = await res.json();
    const song = data?.data?.song?.list?.[0];
    if (song) {
      const albummid = song.albummid;
      const songmid = song.songmid;
      if (albummid) {
        if (/^\d+$/.test(albummid)) {
          const albumid = song.albumid || parseInt(albummid);
          cover = `https://y.gtimg.cn/music/photo/album_500/${albumid % 100}/500_albumpic_${albumid}_0.jpg`;
        } else {
          cover = `https://y.gtimg.cn/music/photo_new/T002R800x800M000${albummid}.jpg`;
        }
      }
      if (song.interval) {
        duration = song.interval * 1000;
      }
      if (songmid) {
        const lyricUrl = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${songmid}&format=json&nobase64=1`;
        const lRes = await fetch(lyricUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://y.qq.com'
          }
        });
        if (lRes.ok) {
          const buffer = await lRes.arrayBuffer();
          let parsed = false;
          
          // 1. Try UTF-8 first (most common and standard)
          try {
            const utf8Text = new TextDecoder('utf-8').decode(buffer);
            if (utf8Text.includes('\uFFFD')) {
              throw new Error('Lossy UTF-8 decoding');
            }
            const lData = JSON.parse(utf8Text);
            if (lData?.lyric) {
              lyrics = lData.lyric
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");
              parsed = true;
            }
          } catch (e) {
            // UTF-8 decoding or JSON parsing failed
          }
          
          // 2. Fall back to GBK if UTF-8 failed
          if (!parsed) {
            try {
              const gbkText = new TextDecoder('gbk').decode(buffer);
              const lData = JSON.parse(gbkText);
              if (lData?.lyric) {
                lyrics = lData.lyric
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&#39;/g, "'");
              }
            } catch (e) {}
          }
        }
      }
    }
  } catch (e) {}
  return { cover, lyrics, duration };
}

async function getNetEaseMusicData(track, artist) {
  let cover = '', lyrics = '', duration = 0;
  try {
    const query = `${track} ${artist}`;
    const cleanQuery = cleanName(query);
    const searchUrl = `https://music.163.com/api/search/get/web?s=${encodeURIComponent(cleanQuery)}&type=1&limit=3`;
    const sRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const sData = await sRes.json();
    const song = sData?.result?.songs?.[0];
    if (song && song.id) {
      const songId = song.id;
      duration = song.duration || 0;
      
      const detailUrl = `https://music.163.com/api/song/detail/?id=${songId}&ids=[${songId}]`;
      const lyricUrl = `https://music.163.com/api/song/lyric?os=pc&id=${songId}&lv=-1&kv=-1&tv=-1`;
      
      const [dRes, lRes] = await Promise.all([
        fetch(detailUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).catch(() => null),
        fetch(lyricUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).catch(() => null)
      ]);
      
      if (dRes && dRes.ok) {
        const dData = await dRes.json();
        const detailSong = dData?.songs?.[0];
        if (detailSong?.album?.picUrl) {
          cover = detailSong.album.picUrl;
        }
      }
      if (lRes && lRes.ok) {
        const lData = await lRes.json();
        if (lData?.lrc?.lyric) {
          lyrics = lData.lrc.lyric;
        }
      }
    }
  } catch (e) {}
  return { cover, lyrics, duration };
}

async function getKugouMusicData(track, artist) {
  let cover = '', lyrics = '', duration = 0;
  try {
    const query = `${track} ${artist}`;
    const cleanQuery = cleanName(query);
    const searchUrl = `http://mobilecdn.kugou.com/api/v3/search/song?keyword=${encodeURIComponent(cleanQuery)}&page=1&pagesize=3`;
    const sRes = await fetch(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const sData = await sRes.json();
    const song = sData?.data?.info?.[0];
    if (song) {
      const hash = song.hash;
      if (song.duration) {
        duration = song.duration * 1000;
      }
      if (hash) {
        const lyricUrl = `http://krcs.kugou.com/search?ver=1&man=yes&client=mobi&hash=${hash}`;
        const lRes = await fetch(lyricUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const lData = await lRes.json();
        const candidate = lData?.candidates?.[0];
        if (candidate) {
          const lyricId = candidate.id;
          const accesskey = candidate.accesskey;
          if (lyricId && accesskey) {
            const downloadUrl = `http://lyrics.kugou.com/download?ver=1&client=pc&id=${lyricId}&accesskey=${accesskey}&fmt=lrc&charset=utf8`;
            const dRes = await fetch(downloadUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const dData = await dRes.json();
            const contentBase64 = dData?.content;
            if (contentBase64) {
              const decoded = atob(contentBase64);
              const bytes = new Uint8Array(decoded.split('').map(c => c.charCodeAt(0)));
              lyrics = new TextDecoder('utf-8').decode(bytes);
            }
          }
        }
      }
    }
  } catch (e) {}
  return { cover, lyrics, duration };
}

async function getRecentTracksWithCovers(filteredTracks) {
  const seen = new Set();
  const recentTracksPromises = filteredTracks.map(async (t) => {
    const name = t.name || '';
    const artText = t.artist?.['#text'] || '';
    const key = `${name.toLowerCase().trim()}|${artText.toLowerCase().trim()}`;
    if (seen.has(key)) return null;
    seen.add(key);

    const cached = await getCachedSongData(artText, name);
    let cover = cached ? (cached.cover || '') : '';
    let lrc = cached ? (cached.lyrics || '') : '';
    let dur = cached ? (cached.duration || 0) : 0;
    
    if (!cover && name && artText) {
      try {
        const qqData = await getQQMusicData(name, artText);
        cover = qqData.cover;
        lrc = qqData.lyrics || '';
        dur = qqData.duration || 0;
        
        if (!cover) {
          const neData = await getNetEaseMusicData(name, artText);
          cover = neData.cover;
          if (neData.lyrics) lrc = neData.lyrics;
          if (neData.duration) dur = neData.duration;
        }
        
        if (!cover) {
          const imgs = t.image || [];
          cover = (imgs.find(i=>i.size==='large')||imgs.find(i=>i.size==='medium')||{})['#text'] || '';
          if (cover.includes('2a96cbd8')) cover = '';
        }
        
        if (cover) {
          await setCachedSongData(artText, name, {
            cover: cover,
            lyrics: lrc,
            duration: dur,
            lossless: false,
            hiResLossless: false,
            dolbyAtmos: false
          });
        }
      } catch (e) {}
    }
    
    const nowPlayingTrack = !!t['@attr']?.nowplaying;
    const uts = t.date?.uts ? parseInt(t.date.uts) : 0;
    
    return {
      track: name,
      artist: artText,
      cover: cover,
      now_playing: nowPlayingTrack,
      uts: uts
    };
  });
  
  const resolved = await Promise.all(recentTracksPromises);
  return resolved.filter(t => t !== null);
}

async function fetchTopTracksWithCovers() {
  const url = `https://ws.audioscrobbler.com/2.0/?method=user.gettoptracks&user=tcrrry&api_key=b25b959554ed76058ac220b7b2e0a026&format=json&limit=5`;
  const res = await fetch(url).catch(() => null);
  if (!res || !res.ok) return [];
  try {
    const data = await res.json();
    const tracks = data?.toptracks?.track || [];
    const resolved = await Promise.all(tracks.map(async (t) => {
      const name = t.name || '';
      const artist = t.artist?.name || '';
      const playcount = t.playcount || '0';
      
      const cached = await getCachedSongData(artist, name);
      let cover = cached ? (cached.cover || '') : '';
      if (!cover) {
        try {
          const qqData = await getQQMusicData(name, artist);
          cover = qqData.cover;
          if (!cover) {
            const neData = await getNetEaseMusicData(name, artist);
            cover = neData.cover;
          }
        } catch(e) {}
      }
      if (!cover) {
        const imgs = t.image || [];
        cover = (imgs.find(i=>i.size==='large')||imgs.find(i=>i.size==='medium')||{})['#text'] || '';
        if (cover.includes('2a96cbd8')) cover = '';
      }
      return {
        track: name,
        artist: artist,
        cover: cover || 'https://y.gtimg.cn/mediastyle/global/img/album_300.png',
        playcount: playcount
      };
    }));
    return resolved;
  } catch(e) {
    return [];
  }
}

async function fetchTopArtistsWithAvatars() {
  const url = `https://ws.audioscrobbler.com/2.0/?method=user.gettopartists&user=tcrrry&api_key=b25b959554ed76058ac220b7b2e0a026&format=json&limit=5`;
  const res = await fetch(url).catch(() => null);
  if (!res || !res.ok) return [];
  try {
    const data = await res.json();
    const artists = data?.topartists?.artist || [];
    const resolved = await Promise.all(artists.map(async (a) => {
      const name = a.name || '';
      const playcount = a.playcount || '0';
      
      const cacheKey = `artist_avatar:${name.toLowerCase().trim()}`;
      let avatar = '';
      if (typeof MUSIC_KV !== 'undefined') {
        avatar = await MUSIC_KV.get(cacheKey).catch(() => '');
      }
      
      if (!avatar) {
        try {
          const searchUrl = `https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?format=json&w=${encodeURIComponent(name)}`;
          const sRes = await fetch(searchUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://y.qq.com'
            }
          });
          if (sRes.ok) {
            const sData = await sRes.json();
            const songList = sData?.data?.song?.list || [];
            if (songList.length > 0) {
              const song = songList[0];
              const singers = song.singer || [];
              let singer = singers.find(s => s.name && s.name.toLowerCase().trim() === name.toLowerCase().trim());
              if (!singer && singers.length > 0) singer = singers[0];
              if (singer && singer.mid) {
                avatar = `https://y.gtimg.cn/music/photo_new/T001R150x150M000${singer.mid}.jpg`;
                if (typeof MUSIC_KV !== 'undefined') {
                  await MUSIC_KV.put(cacheKey, avatar, {expirationTtl: 30 * 86400}).catch(() => {});
                }
              }
            }
          }
        } catch(e) {}
      }
      
      return {
        artist: name,
        avatar: avatar || 'https://y.gtimg.cn/mediastyle/global/img/album_300.png',
        playcount: playcount
      };
    }));
    return resolved;
  } catch(e) {
    return [];
  }
}

async function getCachedTopData() {
  const now = Math.floor(Date.now() / 1000);
  if (MEM_CACHE.top_data && (now - MEM_CACHE.top_data.ts < 12 * 3600)) {
    return MEM_CACHE.top_data;
  }
  if (typeof MUSIC_KV !== 'undefined') {
    try {
      const kvVal = await MUSIC_KV.get("top_data_cache_v3");
      if (kvVal) {
        const parsed = JSON.parse(kvVal);
        if (parsed && parsed.ts && (now - parsed.ts < 12 * 3600)) {
          MEM_CACHE.top_data = parsed;
          return parsed;
        }
      }
    } catch(e) {}
  }
  try {
    const [tracks, artists] = await Promise.all([
      fetchTopTracksWithCovers(),
      fetchTopArtistsWithAvatars()
    ]);
    if (tracks.length > 0 && artists.length > 0) {
      const topData = {
        ts: now,
        top_tracks: tracks,
        top_artists: artists
      };
      MEM_CACHE.top_data = topData;
      if (typeof MUSIC_KV !== 'undefined') {
        await MUSIC_KV.put("top_data_cache_v3", JSON.stringify(topData)).catch(() => {});
      }
      return topData;
    }
  } catch(e) {}
  if (MEM_CACHE.top_data) return MEM_CACHE.top_data;
  if (typeof MUSIC_KV !== 'undefined') {
    try {
      const kvVal = await MUSIC_KV.get("top_data_cache_v3");
      if (kvVal) {
        const parsed = JSON.parse(kvVal);
        MEM_CACHE.top_data = parsed;
        return parsed;
      }
    } catch(e) {}
  }
  return { ts: 0, top_tracks: [], top_artists: [] };
}

async function getStatusFromCache() {
  try {
    const cacheUrl = "https://tcrrry.com/cache/status";
    const cachedResponse = await caches.default.match(new Request(cacheUrl));
    if (cachedResponse) {
      return await cachedResponse.json();
    }
  } catch (e) {}
}

async function testAppleToken(token) {
  try {
    const res = await fetch("https://amp-api.music.apple.com/v1/catalog/cn/playlists/pl.u-V9D7mgNfjbqKarP/tracks?limit=1", {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://music.apple.com',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    return res.status === 200;
  } catch (e) {
    return false;
  }
}

async function getAppleDeveloperToken() {
  let token = null;
  if (typeof MUSIC_KV !== 'undefined') {
    try {
      token = await MUSIC_KV.get("apple_developer_token");
      if (token && await testAppleToken(token)) {
        return token;
      }
    } catch (e) {}
  }
  
  try {
    const pageRes = await fetch("https://music.apple.com/cn/playlist/%E5%A5%BD%E6%83%B3%E5%90%83/pl.u-V9D7mgNfjbqKarP", {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    
    const scriptRegex = /<script[^>]+src=["']([^"']+)["']/g;
    let match;
    const scriptSrcs = [];
    while ((match = scriptRegex.exec(html)) !== null) {
      scriptSrcs.push(match[1]);
    }
    
    const jwtRegex = /ey[a-zA-Z0-9_-]{15,}\.ey[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{15,}/g;
    
    for (const src of scriptSrcs) {
      let fullSrc = src;
      if (src.startsWith('/')) {
        fullSrc = "https://music.apple.com" + src;
      } else if (!src.startsWith('http')) {
        fullSrc = "https://music.apple.com/assets/" + src;
      }
      
      if (fullSrc.includes("analytics") || fullSrc.includes("google")) continue;
      
      try {
        const jsRes = await fetch(fullSrc, {
          headers: {
            'User-Agent': 'Mozilla/5.0'
          }
        });
        if (!jsRes.ok) continue;
        const jsContent = await jsRes.text();
        
        const tokens = jsContent.match(jwtRegex);
        if (tokens) {
          const uniqueTokens = Array.from(new Set(tokens));
          for (const t of uniqueTokens) {
            if (await testAppleToken(t)) {
              if (typeof MUSIC_KV !== 'undefined') {
                try {
                  await MUSIC_KV.put("apple_developer_token", t);
                } catch (e) {}
              }
              return t;
            }
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
  
  return null;
}

function getDeviceDisplay(rawName) {
  const name = (rawName || '扬声器').trim();
  const lower = name.toLowerCase();
  
  // 1. Name Mapping: EPZ TP55 (DAC/AMP) + Sogno (IEM)
  let displayName = name;
  if (lower.includes('tp55')) {
    displayName = 'EPZ TP55 + I/O Audio Sogno';
  }
  
  // 2. Icon Mapping: speaker/phone -> 📱, others -> 🎧
  let icon = '🎧';
  const isSpeaker = lower.includes('扬声器') || lower.includes('speaker') || lower.includes('phone') || lower.includes('builtin') || lower === 'speaker' || lower === 'speakerphone';
  if (isSpeaker && !lower.includes('headphone') && !lower.includes('earphone') && !lower.includes('sogno') && !lower.includes('tp55')) {
    icon = '📱';
  }
  
  return { icon, displayName };
}

function upgradeCoverUrl(url) {
  if (!url || typeof url !== 'string') return url;
  let upgraded = url;
  
  // 1. QQ Music Cover Upgrade
  upgraded = upgraded.replace(/T002R\d+x\d+M000/, 'T002R800x800M000');
  upgraded = upgraded.replace('300x300', '800x800');
  
  // 2. NetEase Cloud Music Cover Upgrade (126.net) - Remove query param to get original high-res
  if (upgraded.includes('126.net')) {
    const qIdx = upgraded.indexOf('?');
    if (qIdx !== -1) {
      upgraded = upgraded.substring(0, qIdx);
    }
  }
  
  // 3. Last.fm Cover Upgrade - replace size specifiers with "_" to get original uploaded image
  if (upgraded.includes('lastfm') || upgraded.includes('freetls.fastly.net')) {
    upgraded = upgraded.replace(/\/i\/u\/(?:300x300|174s|64s|extralarge|large|medium)\//i, '/i/u/_/');
  }
  
  // 4. Apple Music Cover Upgrade
  if (upgraded.includes('mzstatic.com') || upgraded.includes('music.apple.com')) {
    upgraded = upgraded.replace('{w}x{h}', '800x800').replace('{w}', '800').replace('{h}', '800');
    upgraded = upgraded.replace(/\/\d+x\d+bb\./i, '/800x800bb.');
    upgraded = upgraded.replace(/\/\d+x\d+\.(?:jpg|png|jpeg)/i, match => {
      const ext = match.split('.').pop();
      return '/800x800.' + ext;
    });
  }
  
  return upgraded;
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event));
});

async function handleRequest(request, event) {
  const url = new URL(request.url);
  if (url.pathname === '/image-proxy') {
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) {
      return new Response('Missing url parameter', { status: 400 });
    }
    try {
      const imgRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      const responseHeaders = new Headers(imgRes.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Cache-Control', 'public, max-age=604800'); // Cache for 7 days
      return new Response(imgRes.body, {
        status: imgRes.status,
        statusText: imgRes.statusText,
        headers: responseHeaders
      });
    } catch (e) {
      return new Response('Error proxying image: ' + e.message, { status: 500 });
    }
  }
  if (url.pathname === '/api/playlist-v2') {
    const playlistIndex = parseInt(url.searchParams.get('index') || '0');
    const playlists = [
      "https://music.apple.com/cn/playlist/%E5%A5%BD%E6%83%B3%E5%90%83/pl.u-V9D7mgNfjbqKarP",
      "https://music.apple.com/cn/playlist/j-k-pop/pl.u-76oNlPbuq14APlZ",
      "https://music.apple.com/cn/playlist/foxfairy/pl.u-9N9LXD4IyA2M4vo",
      "https://music.apple.com/cn/playlist/%E5%8F%AA%E5%9B%A0/pl.u-11zBJ73cKox47ej"
    ];
    if (playlistIndex < 0 || playlistIndex >= playlists.length) {
      return new Response(JSON.stringify({ error: 'Invalid playlist index' }), {
        status: 400,
        headers: {
          'content-type': 'application/json;charset=utf-8',
          'access-control-allow-origin': '*'
        }
      });
    }
    const targetUrl = playlists[playlistIndex];
    const playlistId = targetUrl.split('/').pop();
    const cacheKey = playlistIndex === 0
      ? `playlist_tracks_fwd_${playlistId}`
      : `playlist_tracks_rev_${playlistId}`;
    
    // Try to get from KV first
    if (typeof MUSIC_KV !== 'undefined') {
      try {
        const cached = await MUSIC_KV.get(cacheKey);
        if (cached) {
          return new Response(cached, {
            headers: {
              'content-type': 'application/json;charset=utf-8',
              'access-control-allow-origin': '*',
              'cache-control': 'public, max-age=3600'
            }
          });
        }
      } catch (e) {}
    }
    
    // Fetch and scrape (First try Official Paginated API, fallback to HTML parsing)
    try {
      let tracks = [];
      let success = false;
      
      const token = await getAppleDeveloperToken();
      if (token) {
        try {
          let nextPath = `/v1/catalog/cn/playlists/${playlistId}/tracks?limit=100`;
          let loopCount = 0;
          while (nextPath && loopCount < 10) {
            const apiRes = await fetch("https://amp-api.music.apple.com" + nextPath, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Origin': 'https://music.apple.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            if (!apiRes.ok) break;
            const apiData = await apiRes.json();
            const items = apiData.data || [];
            for (const item of items) {
              const attrs = item.attributes || {};
              const title = attrs.name || '未知歌名';
              const artist = attrs.artistName || '未知歌手';
              let cover = '';
              if (attrs.artwork && attrs.artwork.url) {
                cover = attrs.artwork.url.replace('{w}', '120').replace('{h}', '120').replace('{f}', 'jpg');
              }
              tracks.push({ title, artist, cover });
            }
            nextPath = apiData.next;
            loopCount++;
          }
          success = tracks.length > 0;
        } catch (e) {}
      }
      
      if (!success) {
        // Reset and fallback to old static HTML parser scraper
        tracks = [];
        const pRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        if (pRes.ok) {
          const html = await pRes.text();
          const m = html.match(/id="serialized-server-data"[^>]*>([^<]+)<\/script>/);
          if (m) {
            const data = JSON.parse(m[1]);
            const sections = data.data?.[0]?.data?.sections || [];
            const trackSection = sections.find(s => s.items && s.items.length > 0 && s.items[0].contentDescriptor?.kind === 'song');
            const items = trackSection ? trackSection.items : [];
            for (const it of items) {
              const title = it.title || '未知歌名';
              const artist = it.artistName || (it.subtitleLinks && it.subtitleLinks[0] && it.subtitleLinks[0].title) || '未知歌手';
              let cover = '';
              if (it.artwork && it.artwork.dictionary && it.artwork.dictionary.url) {
                cover = it.artwork.dictionary.url.replace('{w}', '120').replace('{h}', '120').replace('{f}', 'jpg');
              }
              tracks.push({ title, artist, cover });
            }
          }
        }
      }
      
      // Reverse the order of tracks so they are shown in reverse chronological order (newest first) for playlists other than "好想吃" (index 0)
      if (playlistIndex !== 0) {
        tracks.reverse();
      }
      
      const resJson = { tracks };
      const jsonStr = JSON.stringify(resJson);
      
      // Save to KV cache for 24 hours
      if (typeof MUSIC_KV !== 'undefined') {
        try {
          await MUSIC_KV.put(cacheKey, jsonStr, { expirationTtl: 86400 });
        } catch (e) {}
      }
      
      return new Response(jsonStr, {
        headers: {
          'content-type': 'application/json;charset=utf-8',
          'access-control-allow-origin': '*',
          'cache-control': 'public, max-age=3600'
        }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: {
          'content-type': 'application/json;charset=utf-8',
          'access-control-allow-origin': '*'
        }
      });
    }
  }
  if (url.pathname === '/debug-apple') {
    const trackParam = url.searchParams.get('track') || '';
    const artistParam = url.searchParams.get('artist') || '';
    const debugResult = await debugAppleMusicTraits(trackParam, artistParam);
    return new Response(JSON.stringify(debugResult), {
      headers: {
        'content-type': 'application/json;charset=utf-8',
        'access-control-allow-origin': '*'
      }
    });
  }
  if (url.pathname === '/debug-router') {
    try {
      const routerResp = await fetch("https://router.tcrrry.com/cgi-bin/music_status", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      const text = await routerResp.text();
      return new Response(JSON.stringify({
        status: routerResp.status,
        headers: [...routerResp.headers.entries()],
        body: text
      }), {
        headers: {
          'content-type': 'application/json;charset=utf-8',
          'access-control-allow-origin': '*'
        }
      });
    } catch(e) {
      return new Response(JSON.stringify({ error: e.message, stack: e.stack }), {
        status: 500,
        headers: {
          'content-type': 'application/json;charset=utf-8',
          'access-control-allow-origin': '*'
        }
      });
    }
  }
  if (url.pathname === '/debug-qq') {
    const w = url.searchParams.get('w') || 'NewJeans';
    const searchUrl = `https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?format=json&w=${encodeURIComponent(w)}`;
    const sRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://y.qq.com'
      }
    }).catch(e => new Response(JSON.stringify({ error: e.message, stack: e.stack }), { status: 500 }));
    
    if (sRes instanceof Response) return sRes;
    
    const body = await sRes.text();
    return new Response(JSON.stringify({
      status: sRes.status,
      headers: [...sRes.headers.entries()],
      body: body
    }), {
      headers: {
        'content-type': 'application/json;charset=utf-8',
        'access-control-allow-origin': '*'
      }
    });
  }
  let track = '', artist = '', artUrl = '', nowPlaying = false, lyrics = '';
  let device = '扬声器';
  let positionMs = 0, durationMs = 0, positionTs = 0, speed = 1.0;
  let volumePct = 0, srMax = '', srActual = 0, chMode = '', encNames = '', devType = '';
  let debugError = '';
  let recentTracks = [];
  let lossless = false, hiResLossless = false, dolbyAtmos = false;

  const nowSec = Math.floor(Date.now() / 1000);
  
  // Read status from KV directly to ensure fresh status across data centers
  let statusFromKV = null;
  try {
    if (typeof MUSIC_KV !== 'undefined') {
      let currentStatusText = await MUSIC_KV.get("status");
      if (currentStatusText) {
        statusFromKV = JSON.parse(currentStatusText);
        if (statusFromKV) {
          const sanitized = sanitizeMetadata(statusFromKV.audio_track, statusFromKV.audio_artist);
          statusFromKV.audio_track = sanitized.track;
          statusFromKV.audio_artist = sanitized.artist;
        }
      }
    }
  } catch(e) {
    debugError = "KV status read error: " + e.message;
  }

  let isFresh = false;
  if (statusFromKV && statusFromKV.audio_position_ts) {
    // If KV status was updated less than 20 seconds ago, consider it fresh.
    // However, if the track name contains corrupted mojibake/trash, we force it to be stale
    // so that we fall back to fetching the pristine UTF-8 metadata from the router!
    const trackVal = statusFromKV.audio_track || '';
    const artistVal = statusFromKV.audio_artist || '';
    const isTrash = trackVal.includes('\uFFFD') || artistVal.includes('\uFFFD') ||
                    /[\u0250-\u03FF]/.test(trackVal) || /[\u0250-\u03FF]/.test(artistVal) ||
                    trackVal.includes('ʽ') || trackVal.includes('΢');
                    
    if (nowSec - statusFromKV.audio_position_ts < 20 && !isTrash) {
      isFresh = true;
    }
  }

  let lastfmTrack = '', lastfmArtist = '', lastfmArt = '', lastfmNowPlaying = false;
  let fetchedFromRouter = false;
  let statusFromRouter = null;

  // Always fetch Last.fm concurrently to support instant song switching ("秒切")
  const lastfmPromise = fetch('https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=tcrrry&api_key=b25b959554ed76058ac220b7b2e0a026&format=json&limit=15').catch(() => null);

  if (isFresh && statusFromKV) {
    // Use KV status directly
    const rawTrack = statusFromKV.audio_track || '';
    const rawArtist = statusFromKV.audio_artist || '';
    const rawPkg = statusFromKV.audio_pkg || '';
    const isBili = rawTrack.toLowerCase().includes('bilibili') || rawTrack.toLowerCase().includes('b站') || rawTrack.toLowerCase().includes('哔哩哔哩') ||
                   rawArtist.toLowerCase().includes('bilibili') || rawArtist.toLowerCase().includes('b站') || rawArtist.toLowerCase().includes('哔哩哔哩') ||
                   rawPkg.toLowerCase().includes('bili') || rawPkg.toLowerCase().includes('video');
                   
    if (!isBili) {
      track = rawTrack;
      artist = rawArtist;
      nowPlaying = (statusFromKV.audio_state === 'playing');
      device = statusFromKV.bt_device || '扬声器';
      positionMs = statusFromKV.audio_position_ms || 0;
      durationMs = statusFromKV.audio_duration_ms || 0;
      positionTs = statusFromKV.audio_position_ts || 0;
      speed = parseFloat(statusFromKV.audio_speed || '1.0');
      volumePct = statusFromKV.volume_pct || 0;
      srMax = statusFromKV.audio_sr_max || '';
      chMode = statusFromKV.audio_ch_mode || '';
      encNames = statusFromKV.audio_enc || '';
      devType = statusFromKV.audio_dev_type || '';
      let srSource = 0;
      if (statusFromKV.audio_sr && statusFromKV.audio_sr.includes('/')) {
        const parts = statusFromKV.audio_sr.split('/');
        srSource = parseInt(parts[0]) || 0;
      }
      srActual = srSource || statusFromKV.audio_sr_actual || 0;
    }

    // Interpolate position
    if (positionTs > 0 && positionMs > 0 && speed > 0) {
      const elapsedSec = Math.max(0, nowSec - positionTs);
      const interpolated = positionMs + elapsedSec * 1000 * speed;
      if (durationMs > 0) positionMs = Math.min(Math.round(interpolated), durationMs);
      else positionMs = Math.round(interpolated);
    }

    // Process Last.fm response for instant override
    const lastfmResp = await lastfmPromise;
    if (lastfmResp && lastfmResp.ok) {
      try {
        const ld = await lastfmResp.json();
        const tracks = ld?.recenttracks?.track || [];
        const filteredTracks = tracks.filter(t => !isBilibiliTrack(t));
        if (filteredTracks.length > 0) {
          const t = filteredTracks[0];
          const sanitized = sanitizeMetadata(t.name, t.artist?.['#text']);
          lastfmTrack = sanitized.track;
          lastfmArtist = sanitized.artist;
          lastfmNowPlaying = !!t['@attr']?.nowplaying;
          const imgs = t.image || [];
          const art = (imgs.find(i=>i.size==='extralarge')||imgs.find(i=>i.size==='large')||{})['#text'];
          if (art && !art.includes('2a96cbd8')) lastfmArt = art;
        }
        
        const sanitizedTracks = filteredTracks.map(t => {
          const sanitized = sanitizeMetadata(t.name, t.artist?.['#text']);
          return Object.assign({}, t, {
            name: sanitized.track,
            artist: Object.assign({}, t.artist, { '#text': sanitized.artist })
          });
        });
        recentTracks = await getRecentTracksWithCovers(sanitizedTracks);
        if (recentTracks.length > 0) {
          MEM_CACHE.recent_tracks = recentTracks;
        }
      } catch (e) {
        debugError = "Lastfm parsing error (fresh): " + e.message;
      }
    }
  } else {
    // KV status is stale or missing - fetch from router and await Last.fm concurrently
    const routerController = new AbortController();
    const routerTimeout = setTimeout(() => routerController.abort(), 6000); // 2000ms timeout to accommodate slow router response

    try {
      const [routerResp, lastfmResp] = await Promise.all([
        fetch("https://router.tcrrry.com/cgi-bin/music_status", {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          },
          signal: routerController.signal,
          cf: { cacheTtl: 0 }
        }).catch(() => null),
        lastfmPromise
      ]);

      clearTimeout(routerTimeout);

      if (routerResp && routerResp.ok) {
        const ct = routerResp.headers.get("content-type") || "";
        if (!ct.includes("html")) {
          const text = await routerResp.text();
          const dd = JSON.parse(text);
          statusFromRouter = dd;
          const rawTrack = dd.audio_track || '';
          const rawArtist = dd.audio_artist || '';
          const rawPkg = dd.audio_pkg || '';
          const isBili = rawTrack.toLowerCase().includes('bilibili') || rawTrack.toLowerCase().includes('b站') || rawTrack.toLowerCase().includes('哔哩哔哩') ||
                         rawArtist.toLowerCase().includes('bilibili') || rawArtist.toLowerCase().includes('b站') || rawArtist.toLowerCase().includes('哔哩哔哩') ||
                         rawPkg.toLowerCase().includes('bili') || rawPkg.toLowerCase().includes('video');
                         
          if (rawTrack && !isBili) {
            const sanitized = sanitizeMetadata(rawTrack, dd.audio_artist);
            track = sanitized.track;
            artist = sanitized.artist;
            if (dd.audio_state) nowPlaying = (dd.audio_state === 'playing');
            if (dd.bt_device) device = dd.bt_device;
            if (dd.audio_position_ms) positionMs = dd.audio_position_ms;
            if (dd.audio_duration_ms) durationMs = dd.audio_duration_ms;
            if (dd.audio_speed) speed = parseFloat(dd.audio_speed);
            if (dd.volume_pct) volumePct = dd.volume_pct;
            if (dd.audio_sr_max) srMax = dd.audio_sr_max;
            if (dd.audio_ch_mode) chMode = dd.audio_ch_mode;
            if (dd.audio_enc) encNames = dd.audio_enc;
            if (dd.audio_dev_type) devType = dd.audio_dev_type;
            let srSource = 0;
            if (dd.audio_sr && dd.audio_sr.includes('/')) {
              const parts = dd.audio_sr.split('/');
              srSource = parseInt(parts[0]) || 0;
            }
            srActual = srSource || dd.audio_sr_actual || 0;
            
            // Calculate timestamp using the modification time header
            const mtime = parseInt(routerResp.headers.get("X-Music-Status-Time") || "0");
            positionTs = mtime > 0 ? mtime - 2.0 : (nowSec - 2.0);
            
            fetchedFromRouter = true;
          }
          
          // Interpolate position
          if (positionTs > 0 && positionMs > 0 && speed > 0) {
            const elapsedSec = Math.max(0, nowSec - positionTs);
            const interpolated = positionMs + elapsedSec * 1000 * speed;
            if (durationMs > 0) positionMs = Math.min(Math.round(interpolated), durationMs);
            else positionMs = Math.round(interpolated);
          }
        }
      }

      if (lastfmResp && lastfmResp.ok) {
        try {
          const ld = await lastfmResp.json();
          const tracks = ld?.recenttracks?.track || [];
          const filteredTracks = tracks.filter(t => !isBilibiliTrack(t));
          if (filteredTracks.length > 0) {
            const t = filteredTracks[0];
            const sanitized = sanitizeMetadata(t.name, t.artist?.['#text']);
            lastfmTrack = sanitized.track;
            lastfmArtist = sanitized.artist;
            lastfmNowPlaying = !!t['@attr']?.nowplaying;
            const imgs = t.image || [];
            const art = (imgs.find(i=>i.size==='extralarge')||imgs.find(i=>i.size==='large')||{})['#text'];
            if (art && !art.includes('2a96cbd8')) lastfmArt = art;
          }
          
          const sanitizedTracks = filteredTracks.map(t => {
            const sanitized = sanitizeMetadata(t.name, t.artist?.['#text']);
            return Object.assign({}, t, {
              name: sanitized.track,
              artist: Object.assign({}, t.artist, { '#text': sanitized.artist })
            });
          });
          recentTracks = await getRecentTracksWithCovers(sanitizedTracks);
          
          if (recentTracks.length > 0) {
            MEM_CACHE.recent_tracks = recentTracks;
          }
        } catch (e) {
          debugError = "Lastfm parsing error: " + e.message;
        }
      }
    } catch(e) {
      // Ignore
    }

    if (!fetchedFromRouter && statusFromKV) {
      // Fallback to the stale statusFromKV we already read
      track = statusFromKV.audio_track || '';
      artist = statusFromKV.audio_artist || '';
      nowPlaying = (statusFromKV.audio_state === 'playing');
      device = statusFromKV.bt_device || '扬声器';
      positionMs = statusFromKV.audio_position_ms || 0;
      durationMs = statusFromKV.audio_duration_ms || 0;
      positionTs = statusFromKV.audio_position_ts || 0;
      speed = parseFloat(statusFromKV.audio_speed || '1.0');
      volumePct = statusFromKV.volume_pct || 0;
      srMax = statusFromKV.audio_sr_max || '';
      chMode = statusFromKV.audio_ch_mode || '';
      encNames = statusFromKV.audio_enc || '';
      devType = statusFromKV.audio_dev_type || '';
      let srSource = 0;
      if (statusFromKV.audio_sr && statusFromKV.audio_sr.includes('/')) {
        const parts = statusFromKV.audio_sr.split('/');
        srSource = parseInt(parts[0]) || 0;
      }
      srActual = srSource || statusFromKV.audio_sr_actual || 0;

      // Interpolate position
      if (positionTs > 0 && positionMs > 0 && speed > 0) {
        const elapsedSec = Math.max(0, nowSec - positionTs);
        const interpolated = positionMs + elapsedSec * 1000 * speed;
        if (durationMs > 0) positionMs = Math.min(Math.round(interpolated), durationMs);
        else positionMs = Math.round(interpolated);
      }
    }
  }

  // If the phone's status is too old, clear the active track to show idle state.
  // We calculate timeout after the song finishes playing:
  // - If playing: timeout is based on the remaining duration of the song + 180 seconds buffer.
  // - If paused or duration is unknown: timeout is 70 seconds.
  let activeTimeout = 70;
  if (nowPlaying && durationMs > 0 && positionMs > 0) {
    const remainingMs = durationMs - positionMs;
    activeTimeout = Math.max(70, Math.ceil(remainingMs / 1000) + 180);
  }

  const stateChangeTs = statusFromKV ? (statusFromKV.state_change_ts || positionTs) : positionTs;
  const isPausedTimeout = (!nowPlaying && stateChangeTs > 0 && (nowSec - stateChangeTs > 70));
  const isPlayingTimeout = (nowPlaying && positionTs > 0 && (nowSec - positionTs > activeTimeout));

  if (isPlayingTimeout || isPausedTimeout) {
    track = '';
    artist = '';
    nowPlaying = false;
  }


  // If Last.fm is currently playing, override track/artist with Last.fm's clean names
  if (lastfmNowPlaying && lastfmTrack) {
    const lastTrack = (statusFromRouter && statusFromRouter.audio_track) || (statusFromKV ? (statusFromKV.audio_track || '') : '');
    const isSameSong = (lastTrack && cleanName(lastfmTrack).toLowerCase() === cleanName(lastTrack).toLowerCase());
    
    const phoneIsFresh = (positionTs > 0 && (nowSec - positionTs <= 70));
    const phoneWasPaused = (statusFromRouter && statusFromRouter.audio_state === 'paused') || (statusFromKV && statusFromKV.audio_state === 'paused');
    const routerIsFresh = !!(statusFromRouter && statusFromRouter.t && (nowSec - statusFromRouter.t <= 25));
    const localIsFresh = fetchedFromRouter ? routerIsFresh : phoneIsFresh;
    
    // Check if the current local metadata (from router/KV) is trash/mojibake
    const localIsTrash = track.includes('\uFFFD') || (artist && artist.includes('\uFFFD')) ||
                         /[\u0250-\u03FF]/.test(track) || (artist && /[\u0250-\u03FF]/.test(artist)) ||
                         track.includes('ʽ') || track.includes('΢');
                         
    const preserveLocal = !!(localIsFresh && track && !localIsTrash && isSameSong);
    
    // Only override to playing if it is a different song, or if the phone was not explicitly paused
    const shouldOverridePlayState = !isSameSong || (!phoneWasPaused && !phoneIsFresh) || (phoneIsFresh && nowPlaying);

    if (shouldOverridePlayState) {
      const currentIsSame = (track && cleanName(lastfmTrack).toLowerCase() === cleanName(track).toLowerCase());
      if (!currentIsSame) {
        // Different song - reset progress to 3000ms (estimated scrobble latency), but preserve original positionTs from KV
        // to keep it static and prevent the client from entering a reset loop.
        positionMs = 3000;
        durationMs = 0;
      }
      
      // Check if Last.fm metadata is corrupted (contains replacement char or specific mojibake ranges)
      const lastfmIsTrash = lastfmTrack.includes('\uFFFD') || lastfmArtist.includes('\uFFFD') || /[\u0250-\u03FF]/.test(lastfmTrack) || /[\u0250-\u03FF]/.test(lastfmArtist);
      
      if (!preserveLocal && !lastfmIsTrash) {
        const useLocal = track && (cleanName(lastfmTrack).toLowerCase() === cleanName(track).toLowerCase() || isSameSong);
        if (!useLocal) {
          track = lastfmTrack;
          artist = lastfmArtist;
        }
      }
      
      nowPlaying = true;
      speed = 1.0;
      if (lastfmArt && !artUrl) artUrl = lastfmArt;
    } else {
      // Keep paused/idle state. If not timed out, we can still clean up metadata for the paused song.
      if (isSameSong && !isPausedTimeout && (positionTs > 0 && (nowSec - positionTs <= 70))) {
        const lastfmIsTrash = lastfmTrack.includes('\uFFFD') || lastfmArtist.includes('\uFFFD') || /[\u0250-\u03FF]/.test(lastfmTrack) || /[\u0250-\u03FF]/.test(lastfmArtist);
        if (!preserveLocal && !lastfmIsTrash) {
          const useLocal = track && (cleanName(lastfmTrack).toLowerCase() === cleanName(track).toLowerCase());
          if (!useLocal) {
            track = lastfmTrack;
            artist = lastfmArtist;
          }
        }
        if (lastfmArt && !artUrl) artUrl = lastfmArt;
      }
    }
  }

  // Fast path for API status queries
  if (url.pathname === '/status') {
    let losslessVal = false, hiResVal = false, dolbyVal = false;
    let sourceVal = "router_fetch";
    const bypassCache = url.searchParams.get('bypass_cache') === '1';
    if (track) {
      const cached = bypassCache ? null : await getCachedSongData(artist, track);
      if (cached && 'lossless' in cached) {
        losslessVal = cached.lossless || false;
        hiResVal = cached.hiResLossless || false;
        dolbyVal = cached.dolbyAtmos || false;
        sourceVal = cached.source || "cache";
      } else {
        const traits = await getAppleMusicTraits(track, artist);
        losslessVal = traits.lossless;
        hiResVal = traits.hiResLossless;
        dolbyVal = traits.dolbyAtmos;
        if (traits.success) {
          const existingCover = cached ? (cached.cover || "") : "";
          const existingLyrics = cached ? (cached.lyrics || "") : "";
          const existingDuration = cached ? (cached.duration || 0) : 0;
          const err = await setCachedSongData(artist, track, {
            cover: existingCover,
            lyrics: existingLyrics,
            duration: existingDuration,
            lossless: losslessVal,
            hiResLossless: hiResVal,
            dolbyAtmos: dolbyVal
          });
          if (err) {
            sourceVal = "router_fetch_error: " + err;
          }
        } else {
          sourceVal = "router_fetch_failed";
        }
      }
    }

    const topData = await getCachedTopData();
    const statusData = {
      audio_track: track,
      audio_artist: artist,
      audio_state: nowPlaying ? 'playing' : (track ? 'paused' : 'paused'),
      audio_position_ms: positionMs,
      audio_duration_ms: durationMs,
      audio_position_ts: positionTs,
      audio_speed: speed,
      volume_pct: volumePct,
      audio_sr_actual: srActual || srMax,
      audio_ch_mode: chMode,
      audio_enc: encNames,
      bt_device: device,
      audio_pkg: (statusFromKV && statusFromKV.audio_pkg) || "",
      server_time: Math.floor(Date.now() / 1000),
      audio_cover: lastfmArt || "",
      recent_tracks: recentTracks.length > 0 ? recentTracks : (MEM_CACHE.recent_tracks || []),
      top_tracks: topData.top_tracks,
      top_artists: topData.top_artists,
      lossless: losslessVal,
      hi_res_lossless: hiResVal,
      dolby_atmos: dolbyVal,
      music_kv_defined: typeof MUSIC_KV !== 'undefined',
      cache_source: sourceVal
    };

    // Self-healing: If the status we are about to return is clean, but the KV status is currently dirty or stale, write the clean status back to KV.
    if (typeof MUSIC_KV !== 'undefined' && track) {
      const isTrackTrash = track.includes('\uFFFD') || (artist && artist.includes('\uFFFD')) ||
                           /[\u0250-\u03FF]/.test(track) || (artist && /[\u0250-\u03FF]/.test(artist)) ||
                           track.includes('ʽ') || track.includes('΢');
                           
      if (!isTrackTrash) {
        const healingPromise = (async () => {
          try {
            const currentKVText = await MUSIC_KV.get("status");
            let currentKV = currentKVText ? JSON.parse(currentKVText) : null;
            
            let performWrite = false;
            if (!currentKV) {
              performWrite = true;
            } else {
              const kvTrack = currentKV.audio_track || '';
              const kvArtist = currentKV.audio_artist || '';
              const kvIsTrash = kvTrack.includes('\uFFFD') || kvArtist.includes('\uFFFD') ||
                                /[\u0250-\u03FF]/.test(kvTrack) || /[\u0250-\u03FF]/.test(kvArtist) ||
                                kvTrack.includes('ʽ') || kvTrack.includes('΢');
                                
              if (kvIsTrash) {
                performWrite = true;
              } else {
                const isSameSong = (kvTrack.toLowerCase() === track.toLowerCase() && kvArtist.toLowerCase() === artist.toLowerCase());
                const isKVStale = (nowSec - (currentKV.audio_position_ts || 0) >= 20);
                if (isSameSong && isKVStale) {
                  performWrite = true;
                }
              }
            }
            
            if (performWrite) {
              const cleansedStatus = {
                volume_pct: volumePct,
                audio_sr_actual: srActual,
                audio_ch_mode: chMode,
                audio_enc: encNames,
                bt_device: device,
                audio_track: track,
                audio_artist: artist,
                audio_state: nowPlaying ? 'playing' : 'paused',
                audio_position_ms: positionMs,
                audio_duration_ms: durationMs,
                audio_position_ts: positionTs,
                audio_speed: speed,
                audio_sr_max: srMax,
                audio_dev_type: devType,
                audio_pkg: (statusFromKV && statusFromKV.audio_pkg) || "",
                state_change_ts: (currentKV && currentKV.state_change_ts) || positionTs
              };
              await MUSIC_KV.put("status", JSON.stringify(cleansedStatus));
            }
          } catch(e) {}
        })();
        
        if (typeof event !== 'undefined' && event.waitUntil) {
          event.waitUntil(healingPromise);
        } else {
          await healingPromise;
        }
      }
    }

    return new Response(JSON.stringify(statusData), {
      headers: {
        'content-type': 'application/json;charset=utf-8',
        'cache-control': 'no-cache, no-store, must-revalidate',
        'access-control-allow-origin': '*'
      }
    });
  }

  // Fast path for lyrics and cover art (SPA async updates)
  if (url.pathname === '/lyrics') {
    const trackParam = url.searchParams.get('track') || '';
    const artistParam = url.searchParams.get('artist') || '';
    let cover = '';
    let lyricsText = '';
    let duration = 0;
    
    if (trackParam) {
      const bypassCache = url.searchParams.get('bypass_cache') === '1';
      const cached = bypassCache ? null : await getCachedSongData(artistParam, trackParam);
      if (cached && cached.lyrics && cached.cover && 'lossless' in cached) {
        cover = cached.cover;
        lyricsText = cached.lyrics;
        duration = cached.duration;
        lossless = cached.lossless || false;
        hiResLossless = cached.hiResLossless || false;
        dolbyAtmos = cached.dolbyAtmos || false;
      } else {
        const qqData = await getQQMusicData(trackParam, artistParam);
        cover = qqData.cover;
        lyricsText = qqData.lyrics;
        duration = qqData.duration;
        
        if (!cover || !lyricsText) {
          const neData = await getNetEaseMusicData(trackParam, artistParam);
          if (!cover && neData.cover) cover = neData.cover;
          if (!lyricsText && neData.lyrics) lyricsText = neData.lyrics;
          if (!duration && neData.duration) duration = neData.duration;
        }
        
        if (!lyricsText) {
          const kgData = await getKugouMusicData(trackParam, artistParam);
          if (!cover && kgData.cover) cover = kgData.cover;
          if (!lyricsText && kgData.lyrics) lyricsText = kgData.lyrics;
          if (!duration && kgData.duration) duration = kgData.duration;
        }
        
        const traits = await getAppleMusicTraits(trackParam, artistParam);
        lossless = traits.lossless;
        hiResLossless = traits.hiResLossless;
        dolbyAtmos = traits.dolbyAtmos;
        
        if (!cover) {
          try {
            const lastfmUrl = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&track=${encodeURIComponent(trackParam)}&artist=${encodeURIComponent(artistParam)}&api_key=b25b959554ed76058ac220b7b2e0a026&format=json`;
            const lr = await fetch(lastfmUrl);
            const ld = await lr.json();
            const imgs = ld?.track?.album?.image || [];
            const lastfmArt = (imgs.find(i=>i.size==='extralarge')||imgs.find(i=>i.size==='large')||{})['#text'];
            if (lastfmArt && !lastfmArt.includes('2a96cbd8')) {
              cover = lastfmArt;
            }
          } catch(e) {}
        }
        
        if (!lyricsText) {
          try {
            const lrclibUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(trackParam)}&artist_name=${encodeURIComponent(artistParam)}`;
            const lr = await fetch(lrclibUrl, { headers: { 'User-Agent': 'tcrrry-music-monitor/1.0' } });
            const ld = await lr.json();
            if (ld && ld.length > 0) {
              const match = ld.find(item => item.syncedLyrics);
              if (match) {
                lyricsText = match.syncedLyrics;
              } else if (ld[0].plainLyrics) {
                lyricsText = ld[0].plainLyrics;
              }
            }
          } catch(e) {}
        }
        
        if (cover || lyricsText || traits.success) {
          const cacheData = { cover, lyrics: lyricsText, duration };
          if (traits.success) {
            cacheData.lossless = lossless;
            cacheData.hiResLossless = hiResLossless;
            cacheData.dolbyAtmos = dolbyAtmos;
          }
          await setCachedSongData(artistParam, trackParam, cacheData);
        }
      }
    }
    
    const isSuccess = !!(cover && lyricsText);
    const cacheHeader = isSuccess ? 'public, max-age=86400' : 'no-cache, no-store, must-revalidate';
    
    return new Response(JSON.stringify({ cover, lyrics: lyricsText, duration, lossless, hiResLossless, dolbyAtmos }), {
      headers: {
        'content-type': 'application/json;charset=utf-8',
        'cache-control': cacheHeader,
        'access-control-allow-origin': '*'
      }
    });
  }

  const isIdle = !track;
  const fallbackTracks = recentTracks.length > 0 ? recentTracks : (MEM_CACHE.recent_tracks || []);
  if (isIdle && fallbackTracks.length > 0) {
    track = fallbackTracks[0].track;
    artist = fallbackTracks[0].artist;
    artUrl = fallbackTracks[0].cover;
  }

  // 2) Fetch cover art and lyrics (Primary: direct cloud QQ Music fetch, Fallbacks: Last.fm and LRCLIB)
  if (track) {
    let cached = null;
    try {
      cached = await getCachedSongData(artist, track);
    } catch (e) {
      debugError = "Cache read error: " + e.message;
    }
    
    if (cached && cached.lyrics && cached.cover && 'lossless' in cached) {
      artUrl = cached.cover;
      lyrics = cached.lyrics;
      if (cached.duration) durationMs = cached.duration;
      lossless = cached.lossless || false;
      hiResLossless = cached.hiResLossless || false;
      dolbyAtmos = cached.dolbyAtmos || false;
    } else {
      const qqData = await getQQMusicData(track, artist);
      if (qqData.cover) artUrl = qqData.cover;
      if (qqData.lyrics) lyrics = qqData.lyrics;
      if (!durationMs && qqData.duration) durationMs = qqData.duration;
      
      if (!artUrl || !lyrics) {
        const neData = await getNetEaseMusicData(track, artist);
        if (!artUrl && neData.cover) artUrl = neData.cover;
        if (!lyrics && neData.lyrics) lyrics = neData.lyrics;
        if (!durationMs && neData.duration) durationMs = neData.duration;
      }
      
      if (!lyrics) {
        const kgData = await getKugouMusicData(track, artist);
        if (!artUrl && kgData.cover) artUrl = kgData.cover;
        if (!lyrics && kgData.lyrics) lyrics = kgData.lyrics;
        if (!durationMs && kgData.duration) durationMs = kgData.duration;
      }
      
      const traits = await getAppleMusicTraits(track, artist);
      lossless = traits.lossless;
      hiResLossless = traits.hiResLossless;
      dolbyAtmos = traits.dolbyAtmos;

      // Fallback cover art (Last.fm)
      if (!artUrl) {
        try {
          const lastfmUrl = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&track=${encodeURIComponent(track)}&artist=${encodeURIComponent(artist)}&api_key=b25b959554ed76058ac220b7b2e0a026&format=json`;
          const lr = await fetch(lastfmUrl);
          const ld = await lr.json();
          const imgs = ld?.track?.album?.image || [];
          const lastfmArt = (imgs.find(i=>i.size==='extralarge')||imgs.find(i=>i.size==='large')||{})['#text'];
          if (lastfmArt && !lastfmArt.includes('2a96cbd8')) {
            artUrl = lastfmArt;
          }
        } catch(e) {}
      }

      // Fallback lyrics (LRCLIB)
      if (!lyrics) {
        try {
          const lrclibUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(track)}&artist_name=${encodeURIComponent(artist)}`;
          const lr = await fetch(lrclibUrl, { headers: { 'User-Agent': 'tcrrry-music-monitor/1.0' } });
          const ld = await lr.json();
          if (ld && ld.length > 0) {
            const match = ld.find(item => item.syncedLyrics);
            if (match) {
              lyrics = match.syncedLyrics;
            } else if (ld[0].plainLyrics) {
              lyrics = ld[0].plainLyrics;
            }
          }
        } catch(e) {}
      }

      if (artUrl || lyrics || traits.success) {
        const cacheData = { cover: artUrl, lyrics: lyrics, duration: durationMs };
        if (traits.success) {
          cacheData.lossless = lossless;
          cacheData.hiResLossless = hiResLossless;
          cacheData.dolbyAtmos = dolbyAtmos;
        }
        const err = await setCachedSongData(artist, track, cacheData);
        if (err) {
          debugError = (debugError ? debugError + "; " : "") + "Cache write error: " + err;
        }
      }
    }
  }

  // 4) Last.fm fallback (only if KV status had no track data and Last.fm is actively playing)
  if (!track) {
    if (lastfmTrack && lastfmNowPlaying) {
      track = lastfmTrack;
      artist = lastfmArtist;
      nowPlaying = lastfmNowPlaying;
      if (lastfmArt) artUrl = lastfmArt;
    }
  }

  // 采用全新的万能超清封面升级算法，自动将 QQ 音乐、网易云音乐、Last.fm 及 Apple Music 封面自动重构为原生无损超清规格，为历史缓存及实时播放实现超清自愈
  if (artUrl) {
    artUrl = upgradeCoverUrl(artUrl);
  }

  // 4) Parse LRC lyrics and pick current/next line based on position
  let lyricLine = '', nextLyricLine = '', debugLrc = '';
  if (lyrics) {
    const lines = lyrics.split('\n');
    const parsed = [];
    for (const l of lines) {
      const m = l.match(/^\[(\d+):(\d+)\.(\d+)\](.+)$/);
      if (m) {
        const mins = parseInt(m[1]);
        const secs = parseInt(m[2]);
        const millis = parseInt(m[3].padEnd(3,'0'));
        const timeMs = (mins * 60 + secs) * 1000 + millis;
        const text = m[4].trim();
        if (text) parsed.push({t: timeMs, text});
      }
    }
    parsed.sort((a,b) => a.t - b.t); debugLrc = parsed.length + ' lines parsed';
    // Filter out credit/info lines (lines containing full-width colon are almost always credits)
    const realLines = parsed.filter(p => 
      p.text && !p.text.includes('：') && p.text.length > 2
    );
    if (realLines.length === 0 && parsed.length > 0) {
      // Fallback: use first non-empty line
      realLines.push(parsed[0]);
    }
    if (positionMs > 0 && realLines.length > 0) {
      let current = '', next = '', bestTime = 0;
      for (let i = 0; i < realLines.length; i++) {
        if (realLines[i].t <= positionMs && realLines[i].t >= bestTime) {
          bestTime = realLines[i].t;
          current = realLines[i].text;
          next = (i + 1 < realLines.length) ? realLines[i+1].text : '';
        }
      }
      lyricLine = current;
      nextLyricLine = next;
    }
    // Final fallback: if still empty, use first line
    if (!lyricLine && realLines.length > 0) {
      lyricLine = realLines[0].text;
      nextLyricLine = realLines.length > 1 ? realLines[1].text : '';
    }
  }

  function specsLine(vol, sr, srAct, ch, enc, dt) {
    const parts = [];
    if (vol > 0) { parts.push(vol + '%'); }
    if (srAct) { parts.push(srAct + 'Hz'); } else if (sr) { parts.push(sr + 'Hz'); }
    if (ch) { parts.push(ch); }
    if (enc) { parts.push(enc); }
    return parts.join(' · ');
  }

  function formatTime(ms) {
    if (!ms || ms <= 0) return '';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m + ':' + String(s).padStart(2,'0');
  }

  const statusText = nowPlaying ? '正在播放' : (isIdle ? '未在播放' : '最近播放');
  const indicatorStyle = nowPlaying ? 'display:inline-block' : 'display:none';
  const artStyle = artUrl ? '' : 'display:none';

  // Parse LRC lyrics and pre-render lyric lines
  let lyricsHtml = '';
  if (lyrics) {
    const lines = lyrics.split('\n');
    const tempParsed = [];
    for (const l of lines) {
      const m = l.match(/^\[(\d+):(\d+)(?:[\.:](\d+))?\](.*)$/);
      if (m) {
        const mins = parseInt(m[1]);
        const secs = parseInt(m[2]);
        const msStr = m[3] ? m[3].padEnd(3,'0').slice(0,3) : '000';
        const timeMs = (mins * 60 + secs) * 1000 + parseInt(msStr);
        const text = m[4].trim();
        if (text && !text.match(/^\[.*\]$/) && !text.includes('：') && text.length > 1) {
          tempParsed.push({t: timeMs, text});
        }
      }
    }
    tempParsed.sort((a,b) => a.t - b.t);
    
    let activeIdx = -1;
    for (let i = 0; i < tempParsed.length; i++) {
      if (tempParsed[i].t <= positionMs) {
        activeIdx = i;
      } else {
        break;
      }
    }
    
    if (tempParsed.length > 0) {
      lyricsHtml = tempParsed.map((item, idx) => {
        const cls = idx === activeIdx ? 'lyric-line active' : 'lyric-line';
        return `<div class="${cls}" data-time="${item.t}">${item.text}</div>`;
      }).join('');
    } else {
      lyricsHtml = `<div class="lyric-line no-lyrics">暂无歌词</div>`;
    }
  } else {
    lyricsHtml = `<div class="lyric-line no-lyrics">暂无歌词</div>`;
  }

  // Pre-render specs badges and top stats data
  const specsHtml = renderSpecsBadges(volumePct, srMax, srActual, chMode, encNames, devType, lossless, hiResLossless, dolbyAtmos);
  const serverRecentTracks = recentTracks.length > 0 ? recentTracks : (MEM_CACHE.recent_tracks || []);
  const topData = await getCachedTopData();

  // Get dynamic slideshow images from KV with fallback
  let dynamicImages = [
    'https://i3.wp.com/wx1.sinaimg.cn/large/005viHfEly1idyi60nc9rj30u01hc76g.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEgy1idgkge45ifj32c0340e82.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEgy1idgkgez119j30jz0xjwhz.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEgy1idhq5s27cej310o1sqdu7.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEgy1ie06do7xbhj32c0340u0x.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEgy1ie5uz0fm64j31at1qfe23.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEgy1ie5uz33mlxj32c03401ky.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEgy1iebtzhj0r4j30k00zk10y.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEgy1iebtzi84dpj30k00zkdo6.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1id9mudx0f8j31nh27b4qp.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1idb5ph5e78j322p3401kz.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1iddb1dqwdjj30u01hcan1.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1idfexao4jej30u0140gth.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1idpoc2vk79j33uk5rr4qv.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1idr5kekauuj33344monph.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1ie2g4vbc00j33up5tb7wq.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1ie50zn4zoej33454o5nph.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1ief94tcna4j30k00wz7b3.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1iegi824vofj32801o0qv5.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1iegi83vnvhj31ix219hdt.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1iegi85pmxdj32801o0kjl.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1iegi8org30j33b04eo4qs.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1iehipf6qn2j30u0140n6l.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1iehipfwpywj30u0140n6z.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1iehipgwvq3j30u0140gu8.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1ieiflbxnb0j342f63jx6w.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1ieifm0a06pj34106bkx6v.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNiggy1hmrrp93oq7j32dc35s7wj.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNiggy1hms3fzx06rj32dc35s1kz.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNiggy1hms3g2ef6nj32dc35s1l1.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNiggy1hms3gkpnusj335s2dckjo.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNiggy1hxw0ynh4x6j33w15id1l3.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNiggy1hxznqdzlfqj30u01hcwp1.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNiggy1hxznroxyfsj32bc334b2b.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNiggy1hzgomd01lhj30xc0x744f.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNiggy1hzgomobgeqj30wi0wiafq.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNiggy1hzit1xxx0bg30b40b4hdu.gif',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNiggy1hzit32np4kj316z16zqe9.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNiggy1i1ng6gvfcmj31bf0zk4cp.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNiggy1i1rdrhdtj3j32m83xcu12.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNiggy1i2vvfevhjbg30hs0hs7wk.gif',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNiggy1i3pdk48o5mj30er0fcmy2.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNigly1hsvr7a72fqj30u014043j.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNigly1ht2tjmnln0j30u01qstc6.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNigly1htfl1zdj7bj318z0u0n1o.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNigly1hv96a81ekfj33vc2kw1l0.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNigly1hv96ag3m62j350g3cbqv9.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNigly1hv96ap61vhj356o3gge87.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNigly1hv96aq0tncj31400u0dpw.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNigly1hv96aqfa54j31400u0gv0.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNigly1hva9lnwai2j33wa2ljnpi.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNigly1hva9mhejpaj31e01y0txf.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNigly1hva9n8vis3j32lm3wf4qt.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNigly1hvhas92863j32p43lckjm.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNigly1hxjkl2lehjj31l61d3dvi.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNigly1hz8rlw0zxlj31sc2dswqq.jpg',
    'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNigly1i1jlq2m4ujj30u0140776.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEgy1idgkg7nj3fj32bm33mqv5.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEgy1idgkg8jhmij32bm33mqv5.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEgy1idgkgfpk05j30k00xkwiy.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEgy1idgsgadqicj31sh2ope81.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEgy1idgsgx3611j33kw5hzqvb.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEgy1idk3ikd5ncj30u01e5n35.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEgy1idla52u3huj30k00xm42r.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEgy1idla53fcunj30jz0xj79q.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEgy1ie3s6nl6m6j33qu2hw7wi.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEgy1ie5uz5eretj32c0340x6p.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEgy1iebtzbptqwj32m83xcb2b.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEgy1iebtzgnwg6j32bc334qv6.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEgy1iebtzj5t0kj322i2rcqv5.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEgy1iebtzo54vsj30qo140ada.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1id9muegcwwj31nk27f4qp.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1idb5pg2148j322p3407wi.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1iddb1cc6x5j30u01hch03.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1iddb1crq8nj30u01hcqfp.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1iddb1d1kgij30u01hc7fg.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1idfexachfbj30u0140wme.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1idpobcjg3lj33vu5tnx6u.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1idpoblr1chj344t6741l4.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1idpobup2bwj344t674e87.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1idpocbxxi6j344t674npj.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1idpod3lfv2j344t674x6v.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1idr5kczwktj33344mou11.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1idr5kg4vxkj33344moe85.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1idr5l5cqqrj33344mob2d.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1idr5ld9b1zj33344mou10.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1idr5ll99c7j33344mo4qt.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1idr5lnurrvj33342bce82.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1idxv102umuj30u0140gsn.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1idyi5kjaxvj33uw6gyhe1.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1ie1h6uxe7yj30s01600wv.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1ie2g420fxcj33dg5244qw.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1ie2g46y7fkj33g055ye89.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1ie2g4ptjovj342d63g7wn.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1ie50zj3a9ej33ks5jtu13.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1ie50zy2qeuj345867q4qx.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1iee1sdzipkj337k4tc7wl.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1iee1seg3k9j30u01hch0q.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1ief94u4zouj30jo0wygsp.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1iegi8322hbj31o02807wi.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1iegi84qvtyj32801o0kjl.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1iegi8lcbkij31hc1z4kc7.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1iehipere66j30u01407ej.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1iehipg8wf0j30u014012g.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1iehipi2px2j30u0140dof.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1ieifl6neepj342n695he0.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1ieifl99tsyj33p95js1l2.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1ieiflfsjurj342n63ve89.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1ieiflmi5cnj342162yqvc.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1ieiflwp7s4j343l68le89.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNiggy1htwkpvky25j30qo0kqgnh.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNiggy1htwvlg5mq6j30u0140td7.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNiggy1hwu82qgt9oj32c0340u0x.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNiggy1hx5nvem11kj30u0140k3r.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNiggy1hx5nvg2y2fj30u0140qgo.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNiggy1hx5nvj567kj30u01hcang.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNiggy1hx5nvk1eocj30u0140dlz.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNiggy1hxznprzji0j32dc35shdv.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNiggy1hxznqkwyhyj32dc35su0x.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNiggy1hxznqu6hoqj32dc35shdv.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNiggy1hxznqzg0wcj32bc3347wj.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNiggy1hzgom5ckz2g30f00f0npe.gif',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNiggy1hzgomntgceg30u00u07wv.gif',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNiggy1i41poq8v10j31qo334b2a.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNiggy1i41pp56esrj31qo334b2a.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1htpq9vdr4zj30u016u49e.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1htpqaohj5kj30qo0slq5a.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1htt31xygijj33r42tcqv9.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1htt32a8rbcj32jn3ig1l0.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1hu0muofq2ij30k00k041i.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1hv96a8jaeqj30gf0zkn0o.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1hva9j19v3zj33xc2m81l1.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1hva9kmqgexj33lm5irx6x.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1hva9mdtjraj33wa2ljx6q.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1hva9nzd2psj35o33s41l5.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1hvocr45cujg30b40b4axq.gif',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1hxg6qgfi6tj32p43lc7wi.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1hyfe7qsw29j30qk0gnwfh.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1hyfe7xrj5gj30qo0hodh4.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1hz8rlvf03kj31sc2ds4co.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1i09kp1k1bmj32c0340u0x.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1i12y6h3gumj36bk47snpo.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1i12y6pqn37j35ix3opu18.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1i1tfccci33j32m83xc4qs.jpg',
    'https://i3.wp.com/wx2.sinaimg.cn/mw2000/0069zNigly1i3a6a78fdkj30k00li3z7.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEgy1idgsfvkwmkj31jk2bc4nj.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEgy1idgsg738ldj33lf5d9e8a.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEgy1idla53seqmj30k00xg446.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEgy1idoniiko90j344u676kjs.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEgy1idonizorswj344u6767wr.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEgy1ie5uyyguy0j30k00zkn2q.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEgy1ie5uz8vfqhj32072txu0x.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEgy1iebtzaa2g7j32m83zlx6q.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1id9mubjbmzj31ng2791kx.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1id9muc0a1ej31nj27d4qp.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1id9mucvyhrj31nm27i4qp.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1idanbts4u2j31jk2bc7ts.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1idb5pi36gcj322p3401kz.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1iddb1dcgy3j30u01hcakq.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1iddb1e9ok2j30u01hcnc1.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1idpocuf8dwj344t674x6v.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1idpodcvgxej344t674u13.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1idrzjgyomdj32c0340qv6.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1ie1h6vb4joj30s0160q8i.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1ie50zeangyj33nm5nru16.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1ief94stb2nj30jv0wx7ah.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1ief94t58hqj30k00wwdm2.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1ief94tskeyj30k00wywlj.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1iegi8my70vj33b04eo4qs.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1iehipefmywj30u0140ti7.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1iehipgk0tqj30u0140486.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNiggy1hms3fu0aaaj30zk1beago.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNiggy1hms3fy9jguj32dc35se84.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNiggy1hms3gvkl7gj30qw0sbjw6.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNiggy1htwvlgjug3j30u0140tdc.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNiggy1hxznpde936j30u01hcq9q.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNiggy1hxznqd4hioj32dc35sqv7.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNiggy1hxznqhps3aj32dc35shdt.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNiggy1hzgomchd0og30k00k0hdy.gif',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNiggy1i0mmugj2yhj35bk3nfe83.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNigly1htfl205l9qj30u019044u.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNigly1htt3257hlgj32tc3y0kjo.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNigly1htuddzfyj5j31400u0k12.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNigly1hv96a8rg6oj31400qowlw.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNigly1hv96a8yudgj30zk0qon4x.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNigly1hva9iqtcb0j33co510nph.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNigly1hvjm9vay1qj30q31iutbv.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNigly1hyfe7u3x8uj30qo0h0jsh.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNigly1i09kp0cu2lj32xs4eo4qs.jpg',
    'https://i3.wp.com/wx3.sinaimg.cn/mw2000/0069zNigly1i12y688nz8j33k02deu10.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEgy1idgkgbahm1j327a3401ky.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEgy1idgkgelg2kj30k00xmaeo.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEgy1idgkgfbrl2j30k00xdgpg.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEgy1idgsgm9fn9j33ls5eohe2.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEgy1idhq5szgnlj30t91fth1k.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEgy1ie3s6lkgeqj32mh1qzb29.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEgy1ie56nb266wj34mo3344qt.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEgy1ie5uz7c2zgj30u01j7tlf.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEgy1iebtz57ruzj36bk47skjr.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEgy1iebtz8gu87j347s6bk7wo.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEgy1iec6k4o2isj3334334hdx.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1id9mub3f5qj31nn27j4qp.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1id9mucervzj31nk27f1kx.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1id9mudhak4j31nh27b4qp.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1idb5pivgwdj322p340u0y.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1iddo06tj75j32bc2bc4qr.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1idfex9s8aoj30u0140wmc.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1idfexa1ri2j30u014010n.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1idpocl3g6oj344t674u13.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1idr5konk92j33344mo1l1.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1idr5kx8trkj34mo334e85.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1idrzjcqcugj30u0140k69.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1idxv0ztmfwj30u0140wn4.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1ie2g4ldh5rj33qv5m7b2i.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1ie50yq5f1yj344u6761l5.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1ie50z1jaouj345867qkjt.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1ie50zfn59xj335s2564qr.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1iee1scwvmwj30u01budt7.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1ief94ug52yj30k00w8n3x.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1iegi8lprkaj31hc1z44m3.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1iehiphkhvzj30u0140tiv.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1ieifliz37zj342f63jx6v.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1ieiflsmtwuj342162yu14.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/0069zNiggy1hms3ftnb6zj335s2dchdv.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/0069zNiggy1hms3gmd4m4j32dc35s1l0.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/0069zNiggy1htx0bhno90j30lr0waq92.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/0069zNiggy1hxfmnwju38j30u013zq9u.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/0069zNiggy1hzgom9ae4hg30f00f0qv6.gif',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/0069zNiggy1i41pmzvccij32402tcu0x.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/0069zNiggy1i41pumxvpjj31w42tcu0x.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/0069zNigly1htt31rny8tj336o4s0qv8.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/0069zNigly1htude2pivoj318g0xcnjt.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/0069zNigly1htude36sidj318g0xck77.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/0069zNigly1hv96a8bw1gj30nh14ntb2.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/0069zNigly1hva9p3ere2j35o33s44qz.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/0069zNigly1hx4hyf9e68j32dc35sx6r.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/0069zNigly1i09ko7pysgj32c0340hdu.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/0069zNigly1i2hg14fx11j32dc35se81.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/0069zNigly1i2hg14tajsj30qo11t76s.jpg',
    'https://i3.wp.com/wx4.sinaimg.cn/mw2000/0069zNigly1i3a6a6w327j32dc35s4qr.jpg'
  ];
  if (typeof MUSIC_KV !== 'undefined') {
    try {
      const cached = await MUSIC_KV.get("slideshow_images");
      if (cached) {
        dynamicImages = JSON.parse(cached);
      }
    } catch (e) {}
  }

  const { icon: deviceIcon, displayName: deviceName } = getDeviceDisplay(device);

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover">
<title>tcrrry · ♪</title>
<style>
@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes bounce1 { 0%, 100% { height: 3px; } 50% { height: 12px; } }
@keyframes bounce2 { 0%, 100% { height: 4px; } 50% { height: 10px; } }
@keyframes bounce3 { 0%, 100% { height: 2px; } 50% { height: 13px; } }
@keyframes bounce4 { 0%, 100% { height: 5px; } 50% { height: 8px; } }

*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;font-family:-apple-system,"SF Pro Display","SF Pro Text","Helvetica Neue","PingFang SC",system-ui,sans-serif;color:#f5f5f7;display:flex;flex-direction:column;align-items:center;padding:25px 20px 25px;-webkit-font-smoothing:antialiased;background:#1a0a0e;overflow-x:hidden}

/* Fluid background: blurred album art */
#bg-layer{position:fixed;top:-50%;left:-50%;width:200%;height:200%;z-index:-2;background-size:cover;background-position:center;filter:blur(80px) brightness(.45);animation:bgSpin 90s linear infinite;opacity:0;transition:opacity 1.2s ease}
#bg-layer.show{opacity:1}
/* Default gradient fallback when no album art */
#bg-fallback{position:fixed;top:0;left:0;width:100%;height:100%;z-index:-3;background:linear-gradient(135deg,#8a142a,#5c0e1f 40%,#2d0710);opacity:1;transition:opacity 1.2s ease}
#bg-fallback.hide{opacity:0}
@keyframes bgSpin{0%{transform:scale(1.3) rotate(0deg)}100%{transform:scale(1.3) rotate(360deg)}}

/* Rotated Dynamic Background Grid */
#idle-bg-grid {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: -1;
  overflow: hidden;
  opacity: 0;
  transition: opacity 1.2s ease;
  pointer-events: none;
}
#idle-bg-grid.show {
  opacity: 0.28; /* increased opacity for more visible album scrolling background */
}
.bg-grid-wrapper {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  transform: rotate(-45deg);
  justify-content: center;
}
.bg-grid-row {
  display: flex;
  gap: 16px;
  width: max-content;
  white-space: nowrap;
}
.row-left {
  animation: scrollLeft 45s linear infinite;
}
.row-right {
  animation: scrollRight 45s linear infinite;
}
.bg-grid-img {
  width: 180px;
  height: 180px;
  border-radius: 24px;
  object-fit: cover;
  flex-shrink: 0;
  opacity: 0.95;
  filter: brightness(0.8) contrast(1.05); /* more colorful and visible grid images */
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}
@keyframes scrollLeft {
  0% { transform: translate3d(0, 0, 0); }
  100% { transform: translate3d(-50%, 0, 0); }
}
@keyframes scrollRight {
  0% { transform: translate3d(-50%, 0, 0); }
  100% { transform: translate3d(0, 0, 0); }
}
/* Noise overlay */
#noise-overlay{position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;opacity:.025;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");background-repeat:repeat;background-size:256px 256px}

.container{width:100%;max-width:680px;position:relative;z-index:1;animation:fadeIn .8s ease-out}
.header{text-align:center;margin-bottom:15px}
.avatar{width:50px;height:50px;margin:0 auto 8px;border-radius:50%;box-shadow:0 0 0 3px rgba(255,255,255,.15),0 8px 32px rgba(0,0,0,.3);transition:transform .3s ease}
.avatar:hover{transform:scale(1.05)}
.avatar img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}
.name{font-size:20px;font-weight:700;letter-spacing:-.01em;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.2)}

/* Glass Card */
.glass-card{background:rgba(20, 10, 15, 0.45);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);border-radius:24px;padding:24px;border:1px solid rgba(255, 255, 255, 0.08);box-shadow:0 8px 32px rgba(0, 0, 0, 0.35);transition: all 0.3s ease;width:100%;overflow:hidden;}

/* Active Player Layout */
#active-player {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 20px;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}
.album-art-wrapper {
  flex-shrink: 0;
}
.album-art{width:160px;height:160px;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.4);background:rgba(255,255,255,.05);position:relative;transition: width 0.5s cubic-bezier(0.25, 0.8, 0.25, 1), height 0.5s cubic-bezier(0.25, 0.8, 0.25, 1), border-radius 0.5s cubic-bezier(0.25, 0.8, 0.25, 1), transform 0.3s ease;}
.album-art.portrait{height:240px;}
.album-art:hover{transform: scale(1.03);}
.album-art img{width:100%;height:100%;object-fit:cover;display:block;transition:opacity 0.4s ease-in-out;opacity:1;}
.album-art img.fade-out{opacity:0;}

.now-info{flex:1;min-width:0;width:100%;overflow:hidden;}
.now-label{font-size:12px;color:rgba(255,255,255,.45);letter-spacing:.08em;text-transform:uppercase;font-weight:700;margin-bottom:4px;display:flex;align-items:center;justify-content:center;}
.now-track{font-size:22px;font-weight:700;color:#fff;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.now-artist{font-size:15px;color:rgba(255,255,255,.6);margin-top:2px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.now-indicator{display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff2d55;margin-right:6px;vertical-align:middle;animation:pulse 1.5s ease-in-out infinite}

/* Visualizer Wave */
.visualizer {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  width: 16px;
  height: 12px;
  margin-left: 6px;
}
.visualizer span {
  width: 2.5px;
  height: 2px;
  background: linear-gradient(to top, #ff2d55, #ff9500);
  border-radius: 1px;
}
.visualizer.playing span:nth-child(1) { animation: bounce1 0.8s ease-in-out infinite; }
.visualizer.playing span:nth-child(2) { animation: bounce2 0.7s ease-in-out infinite 0.15s; }
.visualizer.playing span:nth-child(3) { animation: bounce3 0.9s ease-in-out infinite 0.05s; }
.visualizer.playing span:nth-child(4) { animation: bounce4 0.6s ease-in-out infinite 0.2s; }

/* Scrolling Lyrics */
.lyrics-container {
  height: 160px;
  overflow: hidden;
  position: relative;
  margin: 15px 0 10px;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,1) 80%, transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,1) 80%, transparent 100%);
}
.lyrics-wrapper {
  transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1);
  will-change: transform;
}
.lyric-line {
  font-size: 15px;
  line-height: 1.6;
  padding: 6px 0;
  color: rgba(255, 255, 255, 0.35);
  text-align: center;
  font-weight: 500;
  transition: transform 0.35s cubic-bezier(0.25, 1, 0.5, 1), color 0.35s ease, text-shadow 0.35s ease;
  transform-origin: center center;
}
.lyric-line.active {
  color: #fff;
  font-size: 15px;
  font-weight: 500;
  text-shadow: 0 2px 15px rgba(255, 255, 255, 0.5);
  transform: scale(1.13);
}
.lyric-line.no-lyrics {
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  padding-top: 40px;
  font-style: italic;
}

/* Neon Progress Bar */
.progress-bar-container {
  width: 100%;
  height: 5px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
  margin-top: 15px;
  position: relative;
}
.progress-bar-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #ff2d55, #ff9500);
  border-radius: 3px;
  box-shadow: 0 0 8px rgba(255, 45, 85, 0.6);
  transition: width 0.1s linear;
}
.progress-time-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 6px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.device-row {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

/* Specs Badges */
.specs-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 10px;
}
.badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  margin-right: 6px;
  margin-bottom: 6px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 0.04em;
}
.badge-lossless {
  background: linear-gradient(135deg, rgba(230, 230, 235, 0.15), rgba(150, 150, 155, 0.1));
  border-color: rgba(230, 230, 235, 0.35);
  color: #f5f5f7;
}
.badge-hires {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.18), rgba(218, 165, 32, 0.1));
  border-color: rgba(255, 215, 0, 0.35);
  color: #ffd700;
}
.badge-format {
  background: linear-gradient(135deg, rgba(52, 199, 89, 0.15), rgba(46, 176, 80, 0.08));
  border-color: rgba(52, 199, 89, 0.35);
  color: #30d158;
}

/* Idle Player Rotator Card */
#idle-player {
  position: relative;
  display: block;
  background: transparent;
}
.rotator-card {
  width: 100%;
  display: flex;
  flex-direction: column;
}
.rotator-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 0 4px;
}
#rotator-title {
  font-size: 14px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.45);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.rotator-dots {
  display: flex;
  gap: 8px;
}
.rotator-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  transition: all 0.3s ease;
  cursor: pointer;
}
.rotator-dot.active {
  background: #ff2d55;
  transform: scale(1.2);
}
.rotator-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 290px;
  transition: opacity 0.35s ease, transform 0.35s ease;
  opacity: 1;
  transform: translateY(0);
}
.rotator-content.fade {
  opacity: 0;
  transform: translateY(8px);
}
.rotator-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.03);
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.02);
  transition: background 0.3s ease, border-color 0.3s ease, transform 0.3s ease;
}
.rotator-item:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.08);
  transform: translateX(4px);
}
.rotator-item-img {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 4px 10px rgba(0,0,0,0.2);
  border: 1px solid rgba(255,255,255,0.05);
}
.rotator-item-img.artist-avatar {
  border-radius: 50%; /* circular avatar for artists */
}
.rotator-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-grow: 1;
  min-width: 0;
}
.rotator-item-title {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rotator-item-artist {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rotator-item-info.artist-info {
  justify-content: center;
}
.rotator-item-title.artist-name {
  font-weight: 600;
}
.rotator-item-meta {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  font-weight: 500;
  flex-shrink: 0;
  text-align: right;
}
.rotator-empty {
  text-align: center;
  color: rgba(255,255,255,0.25);
  font-size: 13px;
  padding: 40px 0;
}

/* Playlist Switcher */
.playlist-selector {
  display: flex;
  justify-content: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 5px;
  border-radius: 30px;
  margin: 35px auto 15px;
  max-width: fit-content;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}
.playlist-tab {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  outline: none;
}
.playlist-tab:hover {
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.02);
}
.playlist-tab.active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255,255,255,0.1);
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.playlist-container {
  width: 100%;
  box-sizing: border-box;
  border-radius: 24px;
  overflow: hidden;
  background: rgba(20, 10, 15, 0.45);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  transition: all 0.35s ease;
}
.playlist-tracklist {
  max-height: 360px;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
}
.playlist-tracklist::-webkit-scrollbar {
  width: 6px;
}
.playlist-tracklist::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 3px;
}
.playlist-tracklist::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}
.playlist-tracklist::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.playlist-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.03);
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.02);
  transition: background 0.3s ease, border-color 0.3s ease, transform 0.3s ease;
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
}
.playlist-item:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.08);
  transform: translateX(4px);
}
.playlist-item-img {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 4px 10px rgba(0,0,0,0.2);
  border: 1px solid rgba(255,255,255,0.05);
}
.playlist-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-grow: 1;
  min-width: 0;
}
.playlist-item-title {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media(max-width: 550px) {
  /* 1. 统一卡片内边距与圆角，提升手机端屏幕利用率 */
  .glass-card {
    padding: 18px !important;
    border-radius: 20px !important;
  }
  .playlist-container {
    border-radius: 20px !important;
  }
  
  /* 2. 正在播放布局：变成水平行，专辑图在左，歌名在右 */
  #active-player {
    display: flex !important;
    flex-direction: row !important;
    text-align: left !important;
    gap: 16px !important;
    align-items: center !important;
    width: 100% !important;
  }
  .album-art-wrapper {
    margin: 0 !important;
    flex-shrink: 0 !important;
  }
  
  /* 3. 紧凑高质封面，配合水平排版并最大化歌词空间 */
  #active-player-card .album-art {
    width: 80px !important;
    height: 80px !important;
    min-width: 80px !important;
    min-height: 80px !important;
    border-radius: 12px !important;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 10px rgba(255, 255, 255, 0.05) !important;
  }
  #active-player-card .album-art.portrait {
    width: 80px !important;
    height: 120px !important;
    min-width: 80px !important;
    min-height: 120px !important;
    border-radius: 12px !important;
  }
  
  /* 歌名歌手与状态排版 */
  .mobile-song-details {
    display: flex !important;
    flex-direction: column !important;
    gap: 2px !important;
    flex-grow: 1 !important;
    min-width: 0 !important;
  }
  .now-info {
    display: none !important; /* 隐藏原 desktop container，改用新排版 */
  }
  #active-player-card .now-track {
    font-size: 18px !important;
    font-weight: 700 !important;
    color: #ffffff !important;
    margin: 0 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    line-height: 1.3 !important;
  }
  #active-player-card .now-artist {
    font-size: 14px !important;
    color: rgba(255, 255, 255, 0.6) !important;
    margin: 0 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }
  #active-player-card .now-label {
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important; /* 手机端靠左对齐 */
    gap: 6px !important;
    margin-bottom: 2px !important;
    font-size: 11px !important;
    color: rgba(255, 255, 255, 0.4) !important;
    text-transform: uppercase !important;
    letter-spacing: 0.05em !important;
  }
  #active-player-card .device-row {
    font-size: 11px !important;
    color: rgba(255, 255, 255, 0.35) !important;
    margin-top: 2px !important;
    justify-content: flex-start !important; /* 手机端靠左对齐 */
  }
  #active-player-card .specs-badges {
    display: flex !important;
    flex-wrap: wrap !important;
    gap: 4px !important;
    margin-top: 4px !important;
    justify-content: flex-start !important;
  }
  #active-player-card .specs-badges .badge {
    padding: 2px 6px !important;
    font-size: 9px !important;
  }
  
  /* 4. 进度条与时间单独占一行，且自适应宽度 */
  #active-player-card .progress-bar-container {
    width: 100% !important;
    margin-top: 16px !important;
  }
  #active-player-card .progress-time-row {
    width: 100% !important;
    margin-top: 6px !important;
    display: flex !important;
    justify-content: space-between !important;
    font-size: 11px !important;
    color: rgba(255, 255, 255, 0.5) !important;
  }
  
  /* 5. 歌词高度大幅拓宽，展现更多行大字歌词 */
  .lyrics-container {
    height: 290px !important; /* 深度拓宽高度，最大化利用空间呈现歌词 */
    width: 100% !important;
    margin: 16px 0 4px !important;
    display: block !important;
  }
  .lyric-line {
    font-size: 20px !important; /* 统一手机端字号，保证排版高度一致不跳动 */
    font-weight: 600 !important; /* 统一字重，避免粗细变化触发排版重绘 */
    padding: 8px 24px !important; /* 增加左右内边距，防止最长歌词在 scale 放大或外发光时被两侧边缘截断 */
    text-align: center !important;
    transform-origin: center !important;
    color: rgba(255, 255, 255, 0.4) !important;
    box-sizing: border-box !important; /* 确保内边距包含在宽度内，防止溢出 */
    transition: transform 0.35s cubic-bezier(0.25, 1, 0.5, 1), color 0.35s ease, text-shadow 0.35s ease !important; /* GPU 硬件加速的平滑过渡效果 */
  }
  .lyric-line.active {
    font-size: 20px !important; /* 与普通行字号完全相同，消除排版抖动 */
    font-weight: 600 !important; /* 与普通行字重完全相同，消除排版重绘 */
    color: #ffffff !important;
    text-shadow: 0 2px 20px rgba(255, 255, 255, 0.6) !important; /* 霓虹发光特效，穿透浴室水雾与屏幕反光 */
    transform: scale(1.15) !important; /* 使用 GPU 缩放放大至约 23px，实现无缝平滑放大且不改变布局高度 */
  }
  .lyric-line.no-lyrics {
    text-align: center !important;
    padding-top: 50px !important;
  }
  
  .visualizer {
    margin-left: 4px !important;
  }
  .specs-badges {
    justify-content: flex-start !important;
  }
}

.right-column {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  min-width: 0;
}

@media (min-width: 992px) {
  .container {
    max-width: 1440px !important;
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.7fr); /* 显著拓宽左侧主卡片，压缩右侧辅助卡片，给歌词留出更宽阔的横向空间 */
    gap: 40px;
    align-items: stretch;
    margin-top: auto !important;
    margin-bottom: auto !important;
  }
  .header {
    grid-column: 1 / -1;
    text-align: left !important;
    margin-bottom: 28px !important;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .avatar {
    margin: 0 !important;
    width: 44px !important;
    height: 44px !important;
  }
  .name {
    font-size: 20px !important;
  }
  
  /* Left Column: Active Player Card stretches to equal height */
  #active-player-card {
    grid-column: 1;
    margin-top: 0 !important;
    height: 100% !important;
    display: flex !important; /* 核心修复：强行覆盖行内样式与 JS 写入 of display: block */
    flex-direction: column !important;
    justify-content: center !important; /* 强制子元素在垂直高度上绝对居中 */
    padding: 36px 28px 36px 40px !important; /* 优化右边距为 28px，增加歌词横向空间并减弱边缘厚重感 */
  }
  #active-player {
    flex-direction: row !important;
    align-items: center !important;
    text-align: left !important;
    gap: 48px !important;
    width: 100% !important;
    margin-top: auto !important;
    margin-bottom: auto !important;
    transform: translateY(10px) !important; /* 整体版面高度饱和，微移 10px 即可达到完美视觉中轴线 */
  }
  #active-player-card .album-art {
    width: clamp(240px, 32vw, 460px) !important;
    height: auto !important;
    aspect-ratio: 1 / 1 !important;
    border-radius: 36px !important;
  }
  #active-player-card .album-art.portrait {
    width: clamp(240px, 32vw, 460px) !important;
    height: auto !important;
    aspect-ratio: 2 / 3 !important;
    border-radius: 36px !important;
  }
  #active-player-card .now-info {
    max-width: none !important;
    margin: 0 !important;
    flex: 1 !important;
    min-width: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-start !important;
    justify-content: center !important; /* 确保右侧文本和歌词在高度上居中，不挤在顶部 */
  }
  #active-player-card .now-label {
    justify-content: flex-start !important;
  }
  #active-player-card .device-row {
    text-align: left !important;
    margin-left: 0 !important;
  }
  #active-player-card .specs-badges {
    justify-content: flex-start !important;
  }
  #active-player-card .progress-time-row {
    width: 100% !important;
  }
  #active-player-card .progress-bar-container {
    width: 100% !important;
  }
  
  /* Right Column Wrapper */
  .right-column {
    grid-column: 2;
    gap: 20px;
  }
  
  /* Right Column Top: Idle Rotator Card */
  #idle-player-card {
    margin-top: 0 !important;
  }
  
  .playlist-selector {
    margin-top: 0 !important;
    margin-bottom: 0 !important;
  }
  .playlist-container {
    margin-top: 0 !important;
  }
  

  
  /* Enlarge lyrics container in widescreen mode for better readability and symmetry */
  .lyrics-container {
    height: 400px !important;
    width: 100% !important;
  }
  .lyrics-wrapper {
    position: relative !important; /* 确保所有浏览器下 offsetParent 始终为 wrapper，保证滚动计算绝对精确 */
  }
  .lyric-line {
    font-size: 17px !important;
    font-weight: 500 !important;
    padding: 10px 85px 10px 30px !important; /* 显著拓宽右边距至 85px，防止 1.23 倍 scale 放大和发光阴影在右侧边缘被截断 */
    margin: 8px 0 !important; /* 增加 8px 外边距，为 1.23 倍缩放提供充足 of 物理避让空间，防止视觉重叠 */
    text-align: left !important;
    transform-origin: left center !important;
    color: rgba(255, 255, 255, 0.35) !important;
    box-sizing: border-box !important;
    transition: transform 0.38s cubic-bezier(0.25, 1, 0.5, 1), color 0.38s ease, text-shadow 0.38s ease !important;
  }
  .lyric-line.active {
    font-size: 17px !important;
    font-weight: 500 !important;
    color: #ffffff !important;
    /* 恢复经典高强度文字发光（光柱效果），在 30px 边距护航下实现两侧极致平滑的羽化渐变，无任何矩形边界 */
    text-shadow: 0 0 20px rgba(255, 255, 255, 0.6), 0 0 10px rgba(255, 255, 255, 0.3) !important;
    transform: scale(1.23) !important; /* 恢复原版 1.23 倍大气的硬件加速无缝缩放 */
  }
  .lyric-line.no-lyrics {
    text-align: left !important;
  }
}
</style>
</head>
<body>

<div id="bg-fallback"></div>
<div id="bg-layer" class="${artUrl ? 'show' : ''}" style="${artUrl ? 'background-image: url(\'' + artUrl + '\');' : ''}"></div>
<div id="noise-overlay"></div>
<div id="idle-bg-grid" class="${isIdle ? 'show' : ''}"></div>
<div class="container">
  <div class="header">
    <div class="avatar"><img src="data:image/jpeg;base64,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" /></div>
    <div class="name">tcrrry</div>
  </div>

  <!-- Left Column: Active Player Card -->
  <div id="active-player-card" class="glass-card" style="margin-top:8px; animation:fadeIn 1s ease-out; display:block;">
    <!-- Active state -->
    <div id="active-player" style="display:flex;">
      <div class="album-art-wrapper">
        <div class="album-art ${nowPlaying ? '' : 'portrait'}"><img id="albumArt" src="${artUrl}" style="${artStyle}" referrerpolicy="no-referrer"></div>
      </div>
      <div class="now-info">
        <div class="now-label">
          <span class="now-indicator" style="${indicatorStyle}"></span>
          <span id="status-text">${statusText}</span>
          <div class="visualizer ${nowPlaying ? 'playing' : ''}" id="visualizer">
            <span></span><span></span><span></span><span></span>
          </div>
        </div>
        <div class="now-track">${track}</div>
        <div class="now-artist">${artist}</div>
        
        <div id="d" style="display:none">${JSON.stringify(lyrics)}</div>
        <div id="p" style="display:none" data-ms="${positionMs}" data-dur="${durationMs}" data-ts="${positionTs}" data-speed="${speed}" data-state="${nowPlaying ? 'playing' : 'paused'}"></div>
        
        <!-- Scrolling Lyrics -->
        <div class="lyrics-container">
          <div class="lyrics-wrapper" id="lyrics-wrapper">
            ${lyricsHtml}
          </div>
        </div>
        
        <!-- Neon Progress Bar -->
        <div class="progress-bar-container">
          <div class="progress-bar-fill" id="progress-bar-fill"></div>
        </div>
        <div class="progress-time-row">
          <span id="time-current">0:00</span>
          <span id="time-total">0:00</span>
        </div>
        
        <div class="device-row">
          <span id="bt-device-icon" style="font-size: 14px; margin-right: 4px;">${deviceIcon}</span>
          <span id="bt-device">${deviceName}</span>
        </div>
        <div class="specs-badges" id="specs-badges">
          ${specsHtml}
        </div>
      </div>
    </div>
  </div>

  <!-- Right Column -->
  <div class="right-column">
    <!-- Right Column Top: Idle Rotator Card (only shows when paused or idle) -->
    <div id="idle-player-card" class="glass-card" style="margin-top:0; animation:fadeIn 1s ease-out; ${(isIdle || !nowPlaying) ? 'display:block' : 'display:none'};">
      <div id="idle-player" style="display:block;">
        <div class="rotator-card">
          <div class="rotator-header">
            <span id="rotator-title">最近播放</span>
            <span class="rotator-dots">
              <span class="rotator-dot active" data-index="0"></span>
              <span class="rotator-dot" data-index="1"></span>
              <span class="rotator-dot" data-index="2"></span>
            </span>
          </div>
          <div class="rotator-content" id="rotator-content">
            <!-- Populated dynamically via JS -->
          </div>
        </div>
      </div>
    </div>

    <!-- Right Column Bottom: Playlist tabs and container -->
    <div class="playlist-selector" style="margin-top:0;">
      <button class="playlist-tab active" data-index="0">好想吃</button>
      <button class="playlist-tab" data-index="1">J-K-Pop</button>
      <button class="playlist-tab" data-index="2">Foxfairy</button>
      <button class="playlist-tab" data-index="3">只因</button>
    </div>
    <div class="playlist-container">
      <div id="playlist-tracklist" class="playlist-tracklist"></div>
    </div>
  </div>

  <!-- debugError: ${debugError} -->
</div>

<script>
// Server injected initial data
const isPlayingInitial = ${nowPlaying ? 'true' : 'false'};
const initialRecentTracks = ${JSON.stringify(serverRecentTracks)};
const initialTopTracks = ${JSON.stringify(topData.top_tracks)};
const initialTopArtists = ${JSON.stringify(topData.top_artists)};

let hxySlideshowInterval = null;
let hxyCurrentIndex = -1;

let currentLayoutMode = null;

// Mobile Apple Music Horizontal Header Layout Logic
function adjustResponsiveLayout() {
  try {
    const isMobile = window.innerWidth <= 550;
    const activePlayer = document.getElementById('active-player');
    const activePlayerCard = document.getElementById('active-player-card');
    const nowInfo = document.querySelector('.now-info');
    const albumArtWrapper = document.querySelector('.album-art-wrapper');
    const rightColumn = document.querySelector('.right-column');
    const header = document.querySelector('.header');
    const container = document.querySelector('.container');
    
    if (!activePlayer || !activePlayerCard || !nowInfo || !rightColumn) return;
    
    // 核心优化：采用状态机控制布局切换。如果当前布局模式已等于目标模式，则直接返回。
    // 这彻底避免了每 3 秒状态轮询以及窗口缩放时频繁触发无意义的 DOM 节点重挂载（DOM Thrashing / 抖动），
    // 完美解决了手机端处于暂停状态时歌词容器偶尔闪烁的视觉问题，并大幅提升了缩放流畅度。
    const targetMode = isMobile ? 'mobile' : 'desktop';
    if (currentLayoutMode === targetMode) return;
    currentLayoutMode = targetMode;
    
    // Ensure our mobile elements exist
    let mobileSongDetails = document.querySelector('.mobile-song-details');
    if (!mobileSongDetails) {
      mobileSongDetails = document.createElement('div');
      mobileSongDetails.className = 'mobile-song-details';
    }
    
    if (isMobile) {
      // MOBILE MODE
      // 0. Move header back to the top of container
      if (header && container && container.firstElementChild !== header) {
        container.insertBefore(header, container.firstElementChild);
      }
      
      // 1. Move song details (label, track, artist, device, specs) into .mobile-song-details
      const label = document.querySelector('.now-label');
      const track = document.querySelector('.now-track');
      const artist = document.querySelector('.now-artist');
      const deviceRow = document.querySelector('.device-row');
      const specsBadges = document.getElementById('specs-badges');
      
      if (label) mobileSongDetails.appendChild(label);
      if (track) mobileSongDetails.appendChild(track);
      if (artist) mobileSongDetails.appendChild(artist);
      if (deviceRow) mobileSongDetails.appendChild(deviceRow);
      if (specsBadges) mobileSongDetails.appendChild(specsBadges);
      
      // 2. Clear activePlayer and set it up as a row
      if (albumArtWrapper) activePlayer.appendChild(albumArtWrapper);
      activePlayer.appendChild(mobileSongDetails);
      
      // 3. Append progress bar, times, and lyrics container to activePlayerCard
      const progressBar = document.querySelector('.progress-bar-container');
      const progressTime = document.querySelector('.progress-time-row');
      const lyricsContainer = document.querySelector('.lyrics-container');
      
      if (progressBar) activePlayerCard.appendChild(progressBar);
      if (progressTime) activePlayerCard.appendChild(progressTime);
      if (lyricsContainer) activePlayerCard.appendChild(lyricsContainer);
      
    } else {
      // DESKTOP MODE
      // 0. Move header into the top of activePlayerCard
      if (header && activePlayerCard && activePlayerCard.firstElementChild !== header) {
        activePlayerCard.insertBefore(header, activePlayerCard.firstElementChild);
      }
      
      // 1. Restore now-info contents: label, track, artist, lyrics, progress, time, device, specs
      const label = mobileSongDetails.querySelector('.now-label') || document.querySelector('.now-label');
      const track = mobileSongDetails.querySelector('.now-track') || document.querySelector('.now-track');
      const artist = mobileSongDetails.querySelector('.now-artist') || document.querySelector('.now-artist');
      const lyricsContainer = document.querySelector('.lyrics-container');
      const progressBar = activePlayerCard.querySelector('.progress-bar-container') || document.querySelector('.progress-bar-container');
      const progressTime = activePlayerCard.querySelector('.progress-time-row') || document.querySelector('.progress-time-row');
      const deviceRow = mobileSongDetails.querySelector('.device-row') || document.querySelector('.device-row');
      const specsBadges = mobileSongDetails.querySelector('#specs-badges') || document.getElementById('specs-badges');
      
      if (label) nowInfo.appendChild(label);
      if (track) nowInfo.appendChild(track);
      if (artist) nowInfo.appendChild(artist);
      if (lyricsContainer) nowInfo.appendChild(lyricsContainer);
      if (progressBar) nowInfo.appendChild(progressBar);
      if (progressTime) nowInfo.appendChild(progressTime);
      if (deviceRow) nowInfo.appendChild(deviceRow);
      if (specsBadges) nowInfo.appendChild(specsBadges);
      
      // 2. Put albumArtWrapper and nowInfo back into activePlayer
      if (albumArtWrapper) activePlayer.appendChild(albumArtWrapper);
      activePlayer.appendChild(nowInfo);
    }
  } catch (e) {
    console.error("Error in adjustResponsiveLayout:", e);
  }
}

// Attach listeners
window.addEventListener('resize', adjustResponsiveLayout);
window.addEventListener('load', adjustResponsiveLayout);
// Execute immediately as DOM is parsed
adjustResponsiveLayout();

// Fluid background: blurred album art
const bgLayer = document.getElementById('bg-layer');
const bgFallback = document.getElementById('bg-fallback');
const albumImg = document.getElementById('albumArt');
let activeAlbumCover = albumImg ? albumImg.src : '';

function setAlbumBg(src, force = false) {
  if (!force && typeof hxySlideshowInterval !== 'undefined' && hxySlideshowInterval) {
    return;
  }
  if (!src || src.includes('2a96cbd8') || src === window.location.href || src.includes('album_300.png')) {
    // No real album art - show default gradient
    bgLayer.classList.remove('show');
    bgLayer.style.backgroundImage = '';
    bgFallback.classList.remove('hide');
    return;
  }
  bgLayer.style.backgroundImage = 'url(' + src + ')';
  bgLayer.classList.add('show');
  bgFallback.classList.add('hide');
}

// Initial setup
const activePlCard = document.getElementById('active-player-card');
const isInitiallyActive = activePlCard && activePlCard.style.display !== 'none';

function getFallbackBg() {
  const historyCovers = document.querySelectorAll('.history-cover');
  if (historyCovers && historyCovers.length > 0) {
    return historyCovers[0].src;
  }
  return '';
}

if (isInitiallyActive) {
  if (albumImg && albumImg.src) {
    setAlbumBg(albumImg.src);
  }
} else {
  setAlbumBg(getFallbackBg());
}

if (albumImg) {
  albumImg.addEventListener('load', function() {
    const isSlideshow = !!(typeof hxySlideshowInterval !== 'undefined' && hxySlideshowInterval);
    if (isSlideshow || (activePlCard && activePlCard.style.display !== 'none')) {
      setAlbumBg(this.src, true);
    } else {
      setAlbumBg(getFallbackBg());
    }
  });
}
// Fade on src change (new song)
new MutationObserver(function() {
  if (albumImg.src) {
    const isSlideshow = !!(typeof hxySlideshowInterval !== 'undefined' && hxySlideshowInterval);
    if (isSlideshow || (activePlCard && activePlCard.style.display !== 'none')) {
      setAlbumBg(albumImg.src, true);
    } else {
      setAlbumBg(getFallbackBg());
    }
  }
}).observe(albumImg, {attributes: true, attributeFilter: ['src']});

// Huang Xiaoyun album covers slideshow for idle CD
const hxyCovers = [
  "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/76/46/53/76465345-343f-faa8-0900-04020c6282ca/cover.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/4c/42/25/4c4225bf-a5a8-9ba3-da4e-c04a0c2fd75f/5021732440709.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/72/1b/54/721b54e7-a215-d701-99f0-44ed89d61b1e/5021732545275.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/ad/d9/16/add916b6-67c0-3e12-3135-52c42d08131d/25UM2IM02329.rgb.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/74/b3/48/74b3485e-80e1-c9be-4ec9-65dc0052a3cb/cover.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/94/3f/43/943f43ec-1ad6-6d5c-8f68-a1f254d7c3cb/cover.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ed/94/ba/ed94bad3-93ec-9a83-fbdc-700448808059/6942248344307.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/9b/82/0c/9b820c74-8208-1087-6511-4ce663f88a61/6941945179939.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/88/d3/31/88d331ea-ff0e-3728-7ceb-d71a08ff7a06/25UM1IM51903.rgb.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/8d/a6/bc/8da6bc6a-7c51-2c5a-c454-6f7d3e0f6bb4/5021732467270.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/00/74/21/00742170-7bbb-0bb4-14f0-8d090eece9bf/4711499322998.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/a6/1f/dd/a61fdda8-8917-bdfb-3b9f-1ff05e3ca3d5/4894965107814.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/f1/e2/7a/f1e27ac4-711c-e0c8-a685-eb3d844dc920/4894894539779.png/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/1a/55/b2/1a55b25d-7a7c-acce-eeaf-c8f4caa7f813/6941808091132.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/bc/de/47/bcde472d-47c2-bf54-6400-a8f6e62ecc96/196292081879.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/90/6c/cc/906cccc8-3ccd-f40a-fc54-aab340e91951/6942360844037.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/48/c8/66/48c866d5-1e62-e6bf-8bc4-77ca7201a3d3/4894859747911.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/61/92/06/619206db-36f7-8357-f172-2ff251d0c121/4894859314014.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/69/9a/e1/699ae1b1-c35f-3bf4-8c63-501762a7b9cd/196873268484.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/d2/5d/31/d25d3127-2912-082a-3a78-625bd6ca56c3/4896004059108.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/27/18/5e/27185ed7-6b67-b4e2-0976-388f1a8058f3/26UMGIM07713.rgb.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/57/bd/52/57bd52fd-e844-242b-0475-47d912ec0a46/196873268682.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/f1/bd/20/f1bd2024-66ec-8d2c-f2c6-74bd08a37f4c/4896004175242.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/ef/fb/7a/effb7a78-7bb8-a55f-26ac-b7bfad5d8637/4894859314380.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/9c/5a/47/9c5a4794-ed1e-a598-f244-f474ca6883cc/4894859672640.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/b9/c6/ec/b9c6ec51-539e-a011-2ddc-1fffcc3be5c7/4711508067155.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music113/v4/5e/21/9b/5e219bcc-4138-25ff-c68c-dda768712095/6941945164577.png/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/66/4a/fa/664afa08-3bb7-0a67-d0b9-782bd8fc1aca/6942870347011.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/e9/b0/20/e9b02047-03fe-58f2-52b9-7f60eedb77ab/4896004252806.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/90/cc/9290cc5d-6981-66a6-c8c8-8fa306af0324/4711475945906.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/ec/a1/88/eca1883c-c41f-5c68-8cdb-4f99e305c168/cover.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/95/04/56/950456f7-6e91-849f-deef-55cbb0e84a81/4896004482791.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/3f/74/8d/3f748d3f-aaee-ce62-9ff6-8c34f071c8e6/6923356187260.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/8b/63/24/8b6324ba-2568-2c01-c1a9-fc76bf58640f/4896016033691.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/8f/81/4c/8f814c33-95e1-74c5-253c-650ef68c0e76/4711508069456.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/9c/33/6d/9c336d63-45f3-06e4-9d15-d9c37046d98a/4894859671995.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/64/55/3b/64553bf1-69ba-2f68-36aa-e4421b1e5b69/cover.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/a0/b6/ea/a0b6eac7-0d85-ee3d-b9fb-3b47dec61a20/4896004765917.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/52/6a/56/526a5651-d6b6-5fec-aa0d-684a77b15c77/192406094995.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/b7/36/d4/b736d419-7533-8096-3736-9819a10c26b2/196589478542.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/3f/3b/0e/3f3b0e12-c5fa-f432-091b-9c8e154e9db3/4711099731756.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/e1/bb/0b/e1bb0b7a-7316-74da-a6ff-ab6d943c800f/4711099680931.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/fc/2d/34/fc2d343f-7641-e9ad-1080-378a45854739/6941808081027.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/cd/ea/32/cdea32d8-dea8-9e7a-f2c4-81f5bf5a5aed/4894894616432.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/bf/c7/6e/bfc76eca-7e19-383d-98b5-0c6fa43c7d97/26UMGIM12583.rgb.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/87/8d/04/878d04d0-3a29-4839-1cba-88d2a5639272/cover.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/b1/68/d2/b168d265-839c-d8a1-19aa-3fb9994d56a7/196871364539.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/11/fe/a9/11fea9dd-8357-ffd9-09f5-d39c83b667d7/196874158142.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/ed/01/ef/ed01efa7-54bb-c504-1ebe-7dd5a883b6ed/26UMGIM09548.rgb.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/b3/c4/89/b3c48911-ad30-db04-9a9d-eba00dc46d29/4894972483048.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/7b/78/33/7b7833b6-dc5f-4f7c-cd33-74443d5242fc/26UMGIM34705.rgb.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/fd/e3/dd/fde3dd38-a934-e625-ae15-c8d7a950c99b/26UMGIM12069.rgb.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/f8/15/7e/f8157e53-e4db-bdc8-a34b-de378f2b9159/cover.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/35/95/27/359527c7-22fd-c755-7ae2-5685fc58352b/196871806473.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/c3/47/b2/c347b25c-c524-9734-b48c-b36d341109ad/26UMGIM10004.rgb.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/7f/0f/fa/7f0ffaea-3f5b-086d-481b-3b72a9dd2d99/26UMGIM09542.rgb.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/b7/b7/f3/b7b7f3b2-f2a2-7834-a325-8b5445309ce6/cover.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/59/f7/5d/59f75d26-a182-8688-6739-1ce7e2dba312/26UMGIM10005.rgb.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/61/88/f5/6188f512-facb-585c-97d6-3340d52c3948/26UMGIM09545.rgb.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/c1/43/80/c14380eb-d22d-1111-7375-4603352b1bc5/6942360845492.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/c1/37/76/c137761d-739d-67e1-5aa0-bb3ed23d1c20/26UMGIM09546.rgb.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/40/47/85/40478516-4171-a0cc-a685-0fcefc887fd2/26UMGIM09551.rgb.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/3b/12/30/3b123097-6b3d-b14e-495f-2d9289a7a698/26UMGIM15971.rgb.jpg/600x600bb.jpg",
  "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/3c/f3/ad/3cf3adb7-3c07-3b41-209c-883350c2d73f/4711711791953.jpg/600x600bb.jpg"
];

// Rotator lists state
let currentRecentTracks = [];
let currentTopTracks = [];
let currentTopArtists = [];

// Initialize list data from server-injected variables
if (typeof initialRecentTracks !== 'undefined') currentRecentTracks = initialRecentTracks;
if (typeof initialTopTracks !== 'undefined') currentTopTracks = initialTopTracks;
if (typeof initialTopArtists !== 'undefined') currentTopArtists = initialTopArtists;

const rotatorTitles = ['最近播放', '最爱歌曲', '最爱艺人'];
let rotatorIndex = 0;
let rotatorIntervalId = null;

function renderRotatorList(index) {
  let html = '';
  if (index === 0) {
    if (!currentRecentTracks || currentRecentTracks.length === 0) {
      return '<div class="rotator-empty">暂无播放记录</div>';
    }
    const limitTracks = currentRecentTracks.slice(0, 5);
    html = limitTracks.map(t => {
      const title = t.track || '未知歌曲';
      const artistName = t.artist || '未知歌手';
      const cov = t.cover || 'https://y.gtimg.cn/mediastyle/global/img/album_300.png';
      let relativeTime = '';
      if (t.now_playing) {
        relativeTime = '<span style="color:#ff2d55; font-weight:600;">正在播放</span>';
      } else if (t.uts) {
        const diff = Math.floor(Date.now() / 1000) - t.uts;
        if (diff < 60) relativeTime = '刚刚';
        else if (diff < 3600) relativeTime = Math.floor(diff / 60) + '分钟前';
        else if (diff < 86400) relativeTime = Math.floor(diff / 3600) + '小时前';
        else relativeTime = Math.floor(diff / 86400) + '天前';
      } else {
        relativeTime = '先前';
      }
      return '<div class="rotator-item">' +
               '<img class="rotator-item-img" src="' + cov + '" alt="' + title + '" referrerpolicy="no-referrer" />' +
               '<div class="rotator-item-info">' +
                 '<div class="rotator-item-title">' + title + '</div>' +
                 '<div class="rotator-item-artist">' + artistName + '</div>' +
               '</div>' +
               '<div class="rotator-item-meta">' + relativeTime + '</div>' +
             '</div>';
    }).join('');
  } else if (index === 1) {
    if (!currentTopTracks || currentTopTracks.length === 0) {
      return '<div class="rotator-empty">暂无最爱歌曲</div>';
    }
    html = currentTopTracks.map(t => {
      const title = t.track || '未知歌曲';
      const artistName = t.artist || '未知歌手';
      const cov = t.cover || 'https://y.gtimg.cn/mediastyle/global/img/album_300.png';
      return '<div class="rotator-item">' +
               '<img class="rotator-item-img" src="' + cov + '" alt="' + title + '" referrerpolicy="no-referrer" />' +
               '<div class="rotator-item-info">' +
                 '<div class="rotator-item-title">' + title + '</div>' +
                 '<div class="rotator-item-artist">' + artistName + '</div>' +
               '</div>' +
               '<div class="rotator-item-meta">' + t.playcount + '次</div>' +
             '</div>';
    }).join('');
  } else if (index === 2) {
    if (!currentTopArtists || currentTopArtists.length === 0) {
      return '<div class="rotator-empty">暂无最爱艺人</div>';
    }
    html = currentTopArtists.map(a => {
      const name = a.artist || '未知歌手';
      const avt = a.avatar || 'https://y.gtimg.cn/mediastyle/global/img/album_300.png';
      return '<div class="rotator-item">' +
               '<img class="rotator-item-img artist-avatar" src="' + avt + '" alt="' + name + '" referrerpolicy="no-referrer" />' +
               '<div class="rotator-item-info artist-info">' +
                 '<div class="rotator-item-title artist-name">' + name + '</div>' +
               '</div>' +
               '<div class="rotator-item-meta">' + a.playcount + '次</div>' +
             '</div>';
    }).join('');
  }
  return html;
}

function updateRotatorUI() {
  const titleEl = document.getElementById('rotator-title');
  if (titleEl) titleEl.textContent = rotatorTitles[rotatorIndex];
  
  const contentEl = document.getElementById('rotator-content');
  if (contentEl) contentEl.innerHTML = renderRotatorList(rotatorIndex);
  
  document.querySelectorAll('.rotator-dot').forEach((dot, idx) => {
    if (idx === rotatorIndex) dot.classList.add('active');
    else dot.classList.remove('active');
  });
}

function switchRotator(idx) {
  const contentEl = document.getElementById('rotator-content');
  if (!contentEl) return;
  contentEl.classList.add('fade');
  setTimeout(() => {
    rotatorIndex = idx;
    updateRotatorUI();
    contentEl.classList.remove('fade');
  }, 300);
}

function startRotatorInterval() {
  if (rotatorIntervalId) clearInterval(rotatorIntervalId);
  rotatorIntervalId = setInterval(() => {
    switchRotator((rotatorIndex + 1) % 3);
  }, 10000); // Rotate every 10 seconds
}

// Initial populate and interval start
updateRotatorUI();
startRotatorInterval();

// Attach click listeners to dots
document.querySelectorAll('.rotator-dot').forEach(dot => {
  dot.addEventListener('click', function() {
    const idx = parseInt(this.dataset.index);
    switchRotator(idx);
    startRotatorInterval(); // reset interval on manual switch
    
    // Reset left-side slideshow interval as well to keep them in sync
    if (typeof hxySlideshowInterval !== 'undefined' && hxySlideshowInterval) {
      clearInterval(hxySlideshowInterval);
      hxySlideshowInterval = null;
      startHxySlideshow();
    }
  });
});

// Build dynamic background grid
const bgGrid = document.getElementById('idle-bg-grid');
if (bgGrid && typeof hxyCovers !== 'undefined') {
  // Helper to shuffle array
  function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
    return arr;
  }

  // Keep scrolling speed constant regardless of the number of covers (approx 3.42s per cover width when image size is 180px)
  const animDuration = Math.round(hxyCovers.length * 3.42);
  let gridHtml = '<div class="bg-grid-wrapper">';
  for (let r = 0; r < 14; r++) {
    const isLeft = r % 2 === 0;
    // Shuffle the covers for each row so that matching album covers do not align or repeat vertically/diagonally
    const rowCovers = shuffleArray(hxyCovers);
    const doubleCovers = [...rowCovers, ...rowCovers];
    
    gridHtml += '<div class="bg-grid-row ' + (isLeft ? 'row-left' : 'row-right') + '" style="animation-duration: ' + animDuration + 's;">';
    gridHtml += doubleCovers.map(function(src) {
      return '<img class="bg-grid-img" src="' + src + '" alt="Bg Cover" loading="lazy" referrerpolicy="no-referrer" />';
    }).join('');
    gridHtml += '</div>';
  }
  gridHtml += '</div>';
  bgGrid.innerHTML = gridHtml;
}

const hxyImages = ${JSON.stringify(dynamicImages)};

function startHxySlideshow() {
  if (hxySlideshowInterval) return;
  const albumArtContainer = document.querySelector('.album-art');
  if (albumArtContainer) {
    albumArtContainer.classList.add('portrait');
  }
  const bgGrid = document.getElementById('idle-bg-grid');
  if (bgGrid) bgGrid.classList.add('show');
  const bgLayer = document.getElementById('bg-layer');
  if (bgLayer) bgLayer.classList.remove('show');
  
  hxyCurrentIndex = Math.floor(Math.random() * hxyImages.length);
  updateHxyImage();
  hxySlideshowInterval = setInterval(() => {
    let nextIdx = hxyCurrentIndex;
    while (nextIdx === hxyCurrentIndex) {
      nextIdx = Math.floor(Math.random() * hxyImages.length);
    }
    hxyCurrentIndex = nextIdx;
    updateHxyImage();
  }, 10000); // Rotate randomly every 10 seconds
  
  // Synchronize the right-side rotator
  startRotatorInterval();
}

function updateHxyImage() {
  const albumImg = document.getElementById('albumArt');
  if (hxyCurrentIndex < 0 || hxyCurrentIndex >= hxyImages.length) return;
  const imgUrl = hxyImages[hxyCurrentIndex];
  if (albumImg) {
    albumImg.classList.add('fade-out');
    setTimeout(() => {
      albumImg.src = imgUrl;
      albumImg.style.display = 'block';
      const onLoad = () => {
        albumImg.classList.remove('fade-out');
        albumImg.removeEventListener('load', onLoad);
      };
      albumImg.addEventListener('load', onLoad);
    }, 400);
  }
}

function stopHxySlideshow() {
  if (hxySlideshowInterval) {
    clearInterval(hxySlideshowInterval);
    hxySlideshowInterval = null;
  }
  const albumArtContainer = document.querySelector('.album-art');
  if (albumArtContainer) {
    albumArtContainer.classList.remove('portrait');
  }
  const albumImg = document.getElementById('albumArt');
  if (albumImg) {
    albumImg.classList.remove('fade-out');
  }
  const bgGrid = document.getElementById('idle-bg-grid');
  if (bgGrid) bgGrid.classList.remove('show');
  const bgLayer = document.getElementById('bg-layer');
  if (bgLayer) bgLayer.classList.add('show');
}

const lrc = document.getElementById('d');
const pd = document.getElementById('p');
const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');
const progressFill = document.getElementById('progress-bar-fill');
const lyricsWrapper = document.getElementById('lyrics-wrapper');

let ms = 0, ts = 0, sp = 1.0, lt = Date.now();
const pl = [];
let currentActiveIndex = -1;

function parseClientLrc(rawLrc) {
  const lines = rawLrc.split(/\\r?\\n/);
  const parsed = [];
  for (const l of lines) {
    const m = l.match(/^\\[(\\d+):(\\d+)(?:[\\.:](\\d+))?\\](.*)$/);
    if (m) {
      const mins = parseInt(m[1]);
      const secs = parseInt(m[2]);
      const msStr = m[3] ? m[3].padEnd(3,'0') : '000';
      const t = (mins * 60 + secs) * 1000 + parseInt(msStr);
      const txt = m[4].trim();
      if (txt && !txt.match(/^\\[.*\\]$/) && !txt.includes('：') && txt.length > 1) {
        pl.push({t, txt});
      }
    }
  }
  return parsed.sort((a,b) => a.t - b.t);
}

if (lrc && pd) {
  try {
    const rawLrc = JSON.parse(lrc.textContent);
    const parsed = parseClientLrc(rawLrc);
    pl.push(...parsed);
  } catch(e) {}
  
  ms = +pd.dataset.ms || 0;
  ts = +pd.dataset.ts || 0;
  sp = pd.dataset.speed !== undefined && !isNaN(pd.dataset.speed) ? parseFloat(pd.dataset.speed) : 1.0;
  pd.dataset.state = pd.dataset.state || (sp > 0 ? 'playing' : 'paused');
  lt = Date.now();
}

function formatTime(ms) {
  if (!ms || ms <= 0 || isNaN(ms)) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m + ':' + String(s).padStart(2,'0');
}

function u() {
  // Update lyrics scrolling
  let activeIndex = -1;
  for (let i = 0; i < pl.length; i++) {
    if (pl[i].t <= ms) {
      activeIndex = i;
    } else {
      break;
    }
  }
  
  if (lyricsWrapper && lyricsWrapper.children.length > 0) {
    if (activeIndex !== currentActiveIndex) {
      currentActiveIndex = activeIndex;
      
      for (let i = 0; i < lyricsWrapper.children.length; i++) {
        const child = lyricsWrapper.children[i];
        if (i === activeIndex) {
          child.classList.add('active');
        } else {
          child.classList.remove('active');
        }
      }
      
      if (activeIndex >= 0) {
        const activeEl = lyricsWrapper.children[activeIndex];
        if (activeEl) {
          const containerHeight = lyricsWrapper.parentElement ? lyricsWrapper.parentElement.clientHeight : 160;
          const offset = (containerHeight / 2) - activeEl.offsetTop - (activeEl.offsetHeight / 2);
          lyricsWrapper.style.transform = \`translateY(\${offset}px)\`;
        }
      } else {
        lyricsWrapper.style.transform = \`translateY(40px)\`;
      }
    }
  }
  
  // Update progress
  const durVal = pd ? +pd.dataset.dur : 0;
  if (progressFill) {
    const pct = durVal > 0 ? Math.min((ms / durVal) * 100, 100) : 0;
    progressFill.style.width = pct + '%';
  }
  if (timeCurrent) {
    timeCurrent.textContent = formatTime(ms);
  }
  if (timeTotal) {
    timeTotal.textContent = (durVal && durVal > 0) ? formatTime(durVal) : '--:--';
  }
}

u();

// Playlist Switcher tabs logic
const playlistCache = {};

async function loadPlaylistTracks(idx) {
  const container = document.getElementById('playlist-tracklist');
  if (!container) return;
  
  if (playlistCache[idx]) {
    renderPlaylistTracks(playlistCache[idx], container);
    return;
  }
  
  container.innerHTML = '<div style="text-align:center; color:rgba(255,255,255,0.4); font-size:13px; padding: 120px 0;"><div style="display:inline-block; width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.2); border-top-color: #ff2d55; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 8px; vertical-align: middle;"></div><div style="margin-top: 4px;">歌单加载中...</div></div>';
  
  try {
    const res = await fetch('/api/playlist-v2?index=' + idx);
    if (!res.ok) throw new Error('Fetch failed');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (!data.tracks || data.tracks.length === 0) throw new Error('No tracks found');
    
    playlistCache[idx] = data.tracks;
    renderPlaylistTracks(data.tracks, container);
  } catch (e) {
    container.innerHTML = '<div style="text-align:center; color:rgba(255,255,255,0.35); font-size:13px; padding: 100px 0;"><span style="font-size: 24px; display:block; margin-bottom:8px;">⚠️</span><div>歌单加载失败</div><div style="margin-top: 6px;"><a href="javascript:void(0)" onclick="loadPlaylistTracks(\' + idx + \')" style="color:#ff2d55;text-decoration:none;font-weight:600;">点击重新加载</a></div></div>';
  }
}

function renderPlaylistTracks(tracks, container) {
  container.innerHTML = tracks.map(t => {
    const coverUrl = t.cover || \'https://y.gtimg.cn/mediastyle/global/img/album_300.png\';
    const titleVal = t.title || \'未知歌名\';
    const artistVal = t.artist || \'未知歌手\';
    return \'<div class="playlist-item"><img class="playlist-item-img" src="\' + coverUrl + \'" referrerpolicy="no-referrer" loading="lazy"><div class="playlist-item-info"><div class="playlist-item-title">\' + titleVal + \'</div><div class="playlist-item-artist">\' + artistVal + \'</div></div></div>\';
  }).join(\'\');
  
  container.scrollTop = 0;
}

document.querySelectorAll('.playlist-tab').forEach(tab => {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.playlist-tab').forEach(t => t.classList.remove('active'));
    this.classList.add('active');
    const idx = parseInt(this.dataset.index);
    loadPlaylistTracks(idx);
  });
});

// Load the first playlist by default on page load
loadPlaylistTracks(0);

// Shared functions defined in client-side script for dynamic formatting
function getDeviceDisplay(rawName) {
  const name = (rawName || '扬声器').trim();
  const lower = name.toLowerCase();
  
  // 1. Name Mapping: EPZ TP55 (DAC/AMP) + Sogno (IEM)
  let displayName = name;
  if (lower.includes('tp55')) {
    displayName = 'EPZ TP55 + I/O Audio Sogno';
  }
  
  // 2. Icon Mapping: speaker/phone -> 📱, others -> 🎧
  let icon = '🎧';
  const isSpeaker = lower.includes('扬声器') || lower.includes('speaker') || lower.includes('phone') || lower.includes('builtin') || lower === 'speaker' || lower === 'speakerphone';
  if (isSpeaker && !lower.includes('headphone') && !lower.includes('earphone') && !lower.includes('sogno') && !lower.includes('tp55')) {
    icon = '📱';
  }
  
  return { icon, displayName };
}

function upgradeCoverUrl(url) {
  if (!url || typeof url !== 'string') return url;
  let upgraded = url;
  
  // 1. QQ Music Cover Upgrade
  upgraded = upgraded.replace(/T002R\\d+x\\d+M000/, 'T002R800x800M000');
  upgraded = upgraded.replace('300x300', '800x800');
  
  // 2. NetEase Cloud Music Cover Upgrade (126.net) - Remove query param to get original high-res
  if (upgraded.includes('126.net')) {
    const qIdx = upgraded.indexOf('?');
    if (qIdx !== -1) {
      upgraded = upgraded.substring(0, qIdx);
    }
  }
  
  // 3. Last.fm Cover Upgrade - replace size specifiers with "_" to get original uploaded image
  if (upgraded.includes('lastfm') || upgraded.includes('freetls.fastly.net')) {
    upgraded = upgraded.replace(/i\\/u\\/(?:300x300|174s|64s|extralarge|large|medium)/i, '/i/u/_/');
  }
  
  // 4. Apple Music Cover Upgrade
  if (upgraded.includes('mzstatic.com') || upgraded.includes('music.apple.com')) {
    upgraded = upgraded.replace('{w}x{h}', '800x800').replace('{w}', '800').replace('{h}', '800');
    upgraded = upgraded.replace(/\\/\\d+x\\d+bb\\./i, '/800x800bb.');
    upgraded = upgraded.replace(/\\/\\d+x\\d+\\.(?:jpg|png|jpeg)/i, match => {
      const ext = match.split('.').pop();
      return '/800x800.' + ext;
    });
  }
  
  return upgraded;
}

function renderSpecsBadges(vol, srMax, srActual, ch, enc, dt, losslessTrack, hiResTrack, atmosTrack) {
  const badges = [];
  
  const encUpper = (enc || '').toUpperCase();
  
  // 1. Determine lossless state: ONLY true if Apple Music catalog lookup confirmed lossless or hi-res lossless
  const isLossless = !!(losslessTrack || hiResTrack);
  const isHiRes = !!hiResTrack;
  
  // 2. Format name: ALAC if catalog lossless, otherwise AAC
  const formatName = isLossless ? 'ALAC' : 'AAC';
  
  // 3. Sample rate value: use actual or max, fallback to 48000 for standard, 96000 for Hi-Res
  const srVal = srActual || srMax || (isHiRes ? 96000 : 48000);
  const khz = (srVal / 1000).toFixed(1).replace(/\\.0$/, '') + ' kHz';
  
  // 4. Bit depth (only determined for lossless catalog tracks)
  let bitDepth = '';
  if (isLossless) {
    if (encUpper.includes('16')) {
      bitDepth = '16-bit';
    } else if (encUpper.includes('24')) {
      bitDepth = '24-bit';
    } else if (isHiRes) {
      bitDepth = '24-bit';
    } else {
      // Infer from sample rate
      if (srVal > 48000) {
        bitDepth = '24-bit';
      } else if (srVal <= 44100) {
        bitDepth = '16-bit';
      } else {
        // For 48000 Hz, default to 24-bit
        bitDepth = '24-bit';
      }
    }
  }
  
  // 5. Render quality and format badges
  if (isLossless) {
    if (isHiRes || srVal > 48000) {
      badges.push('<span class="badge badge-hires">Hi-Res Lossless</span>');
    } else {
      badges.push('<span class="badge badge-lossless">Lossless</span>');
    }
    badges.push(\`<span class="badge badge-format">\${formatName}</span>\`);
  } else {
    badges.push(\`<span class="badge badge-format">\${formatName}</span>\`);
  }
  
  // 6. Render bit-depth and sample rate
  if (isLossless && bitDepth) {
    badges.push(\`<span class="badge">\${bitDepth}/\${khz}</span>\`);
  } else {
    badges.push(\`<span class="badge">\${khz}</span>\`);
  }
  
  // 7. Channel mode
  if (ch) {
    badges.push(\`<span class="badge">\${ch.toUpperCase()}</span>\`);
  }
  
  // 8. Volume
  if (vol > 0) {
    badges.push(\`<span class="badge">Vol: \${vol}%</span>\`);
  }
  
  return badges.join('');
}

function renderRecentTracksHtml(recentTracks, serverTime) {
  if (!recentTracks || recentTracks.length === 0) {
    return \`<div style="text-align:center; color:rgba(255,255,255,0.25); font-size:13px; padding: 20px 0;">暂无播放记录</div>\`;
  }
  return recentTracks.map(t => {
    const title = t.track || '未知歌曲';
    const artistName = t.artist || '未知歌手';
    const cov = t.cover || 'https://y.gtimg.cn/mediastyle/global/img/album_300.png';
    let relativeTime = '';
    if (t.now_playing) {
      relativeTime = '<span style="color:#ff2d55; font-weight:600;">正在播放</span>';
    } else if (t.uts) {
      const diff = serverTime - t.uts;
      if (diff < 60) relativeTime = '刚刚';
      else if (diff < 3600) relativeTime = Math.floor(diff / 60) + '分钟前';
      else if (diff < 86400) relativeTime = Math.floor(diff / 3600) + '小时前';
      else relativeTime = Math.floor(diff / 86400) + '天前';
    } else {
      relativeTime = '先前';
    }
    return \`
      <div class="history-item">
        <img class="history-cover" src="\${cov}" alt="\${title}">
        <div class="history-info">
          <div class="history-title">\${title}</div>
          <div class="history-artist">\${artistName}</div>
        </div>
        <div class="history-time">\${relativeTime}</div>
      </div>
    \`;
  }).join('');
}

async function checkStatus() {
  try {
    const r = await fetch('/status');
    const d = await r.json();
    
    // Ignore stale status updates from eventually consistent KV replicas
    if (d.audio_position_ts && ts && d.audio_position_ts < ts - 1) {
      return;
    }
    
    // Toggle active vs idle UI views
    const activePlayerCard = document.getElementById('active-player-card');
    const idlePlayerCard = document.getElementById('idle-player-card');
    
    if (d.audio_track) {
      if (d.audio_state === 'playing') {
        stopHxySlideshow();
        const albumImg = document.getElementById('albumArt');
        if (albumImg && activeAlbumCover) {
          if (hxyImages.includes(albumImg.src) || albumImg.src.includes('image-proxy?url=') || albumImg.src.includes('wsrv.nl/?url=') || albumImg.src.includes('wp.com/')) {
            albumImg.src = activeAlbumCover;
          }
        }
      } else {
        startHxySlideshow();
      }
      if (activePlayerCard) activePlayerCard.style.display = 'block';
      if (idlePlayerCard) {
        idlePlayerCard.style.display = 'block';
      }
      
      // Update visualizer state class
      const viz = document.getElementById('visualizer');
      if (viz) {
        if (d.audio_state === 'playing') viz.classList.add('playing');
        else viz.classList.remove('playing');
      }
      
      // Update specs badges
      const badgesContainer = document.getElementById('specs-badges');
      if (badgesContainer) {
        badgesContainer.innerHTML = renderSpecsBadges(d.volume_pct, d.audio_sr_max, d.audio_sr_actual, d.audio_ch_mode, d.audio_enc, d.bt_device, d.lossless, d.hi_res_lossless, d.dolby_atmos);
      }
      
      const deviceEl = document.getElementById('bt-device');
      const deviceIconEl = document.getElementById('bt-device-icon');
      if (d.bt_device) {
        const { icon, displayName } = getDeviceDisplay(d.bt_device);
        if (deviceEl) deviceEl.textContent = displayName;
        if (deviceIconEl) deviceIconEl.textContent = icon;
      }
      
      const statusTextEl = document.getElementById('status-text');
      const computedStatusText = d.audio_state === 'playing' ? '正在播放' : '最近播放';
      if (statusTextEl && statusTextEl.textContent !== computedStatusText) {
        statusTextEl.textContent = computedStatusText;
      }
      
      const indicatorEl = document.querySelector('.now-indicator');
      if (indicatorEl) {
        indicatorEl.style.display = d.audio_state === 'playing' ? 'inline-block' : 'none';
      }
      
      // Check for song change
      const trackEl = document.querySelector('.now-track');
      if (trackEl && trackEl.textContent !== d.audio_track) {
        trackEl.textContent = d.audio_track;
        const artistEl = document.querySelector('.now-artist');
        if (artistEl) artistEl.textContent = d.audio_artist;
        
        const albumImg = document.getElementById('albumArt');
        if (albumImg) {
          if (d.audio_cover) {
            const highResCover = upgradeCoverUrl(d.audio_cover);
            albumImg.src = highResCover;
            activeAlbumCover = highResCover;
            albumImg.style.display = 'block';
          } else {
            albumImg.src = 'https://y.gtimg.cn/mediastyle/global/img/album_300.png';
            activeAlbumCover = 'https://y.gtimg.cn/mediastyle/global/img/album_300.png';
            albumImg.style.display = 'block';
          }
        }
        
        if (lyricsWrapper) {
          lyricsWrapper.innerHTML = '<div class="lyric-line" style="text-align:center;padding-top:40px;">加载歌词中...</div>';
          lyricsWrapper.style.transform = 'translateY(40px)';
        }
        pl.length = 0;
        currentActiveIndex = -1;
        
        ms = d.audio_position_ms || 3000;
        ts = d.audio_position_ts || 0;
        sp = d.audio_speed !== undefined ? parseFloat(d.audio_speed) : 1.0;
        lt = Date.now();
        
        if (pd) {
          pd.dataset.ms = ms;
          pd.dataset.ts = ts;
          pd.dataset.speed = sp;
          pd.dataset.state = d.audio_state;
          pd.dataset.dur = d.audio_duration_ms || 0;
        }
        
        u();
        
        // Fetch new lyrics
        try {
          const lyrResp = await fetch('/lyrics?track=' + encodeURIComponent(d.audio_track) + '&artist=' + encodeURIComponent(d.audio_artist));
          const lyrData = await lyrResp.json();
          
          if (albumImg && lyrData.cover) {
            const highResCover = upgradeCoverUrl(lyrData.cover);
            albumImg.src = highResCover;
            activeAlbumCover = highResCover;
          }
          
          if (lyrData.lyrics) {
            pl.length = 0;
            const parsed = parseClientLrc(lyrData.lyrics);
            pl.push(...parsed);
            
            if (lyricsWrapper) {
              if (pl.length > 0) {
                lyricsWrapper.innerHTML = pl.map(item => \`<div class="lyric-line" data-time="\${item.t}">\${item.txt}</div>\`).join('');
              } else {
                lyricsWrapper.innerHTML = '<div class="lyric-line no-lyrics">暂无歌词</div>';
              }
            }
          } else {
            if (lyricsWrapper) lyricsWrapper.innerHTML = '<div class="lyric-line no-lyrics">暂无歌词</div>';
          }
          
          if (lyrData.duration && pd) {
            pd.dataset.dur = lyrData.duration;
          }
          
          currentActiveIndex = -1;
          u();
          const viz = document.getElementById('visualizer');
          if (viz) {
            if (d.audio_state === 'playing') viz.classList.add('playing');
            else viz.classList.remove('playing');
          }
        } catch (err) {
          if (lyricsWrapper) lyricsWrapper.innerHTML = '<div class="lyric-line no-lyrics">暂无歌词</div>';
        }
      } else if (pd) {
        // Update progress baseline
        if (d.audio_position_ms !== undefined) {
          const newMs = d.audio_position_ms;
          const newTs = d.audio_position_ts || 0;
          const newSpeed = d.audio_speed !== undefined ? parseFloat(d.audio_speed) : 1.0;
          const newState = d.audio_state;
          
          const oldTs = +pd.dataset.ts || 0;
          const oldSpeed = pd.dataset.speed !== undefined ? parseFloat(pd.dataset.speed) : 1.0;
          const oldState = pd.dataset.state || '';
          
          if (newTs !== oldTs || newSpeed !== oldSpeed || newState !== oldState) {
            pd.dataset.ms = newMs;
            pd.dataset.ts = newTs;
            pd.dataset.speed = newSpeed;
            pd.dataset.state = newState;
            pd.dataset.dur = d.audio_duration_ms || 0;
            
            sp = newSpeed;
            lt = Date.now();
            
            if (newTs !== oldTs) {
              ts = newTs;
              ms = newMs;
            } else {
              if (newState === 'playing' && oldState !== 'playing') {
                ts = d.server_time || Math.floor(Date.now() / 1000);
                ms = Math.max(ms, newMs);
              } else if (newState === 'paused') {
                ts = newTs;
                ms = newMs;
              }
            }
            u();
            const viz = document.getElementById('visualizer');
            if (viz) {
              if (newState === 'playing') viz.classList.add('playing');
              else viz.classList.remove('playing');
            }
          }
        }
      }
    } else {
      // Idle state
      startHxySlideshow();
      if (activePlayerCard) activePlayerCard.style.display = 'block';
      if (idlePlayerCard) idlePlayerCard.style.display = 'block';
      
      // Freeze progress bar in idle state
      if (pd) {
        pd.dataset.state = 'paused';
        pd.dataset.speed = 0;
        sp = 0;
      }
      u();
      
      // Stop visualizer animation in idle state
      const viz = document.getElementById('visualizer');
      if (viz) {
        viz.classList.remove('playing');
      }
      
      // Update active card with last played track metadata
      if (d.recent_tracks && d.recent_tracks.length > 0) {
        const lastTrack = d.recent_tracks[0];
        const trackEl = document.querySelector('.now-track');
        if (trackEl && trackEl.textContent !== lastTrack.track) {
          trackEl.textContent = lastTrack.track;
        }
        const artistEl = document.querySelector('.now-artist');
        if (artistEl && artistEl.textContent !== lastTrack.artist) {
          artistEl.textContent = lastTrack.artist;
        }
        const statusTextEl = document.getElementById('status-text');
        if (statusTextEl && statusTextEl.textContent !== '未在播放') {
          statusTextEl.textContent = '未在播放';
        }
        const indicatorEl = document.querySelector('.now-indicator');
        if (indicatorEl) {
          indicatorEl.style.display = 'none';
        }
      }
      
      // Update rotator lists
      if (d.recent_tracks) currentRecentTracks = d.recent_tracks;
      if (d.top_tracks) currentTopTracks = d.top_tracks;
      if (d.top_artists) currentTopArtists = d.top_artists;
      
      // Update rotator UI
      updateRotatorUI();
      
      // Update background: set blurred cover to last played song cover art
      const lastCover = (d.recent_tracks && d.recent_tracks[0]) ? d.recent_tracks[0].cover : '';
      setAlbumBg(lastCover);
    }
  } catch(e) {}
  if (typeof adjustResponsiveLayout === 'function') {
    adjustResponsiveLayout();
  }
}
checkStatus();
setInterval(checkStatus, 3000);

// High frequency progress interpolation (every 100ms)
setInterval(() => {
  const isPlaying = (pd && pd.dataset.state === 'playing');
  if (isPlaying && sp > 0) {
    const nw = Date.now();
    const elapsed = Math.floor((nw - lt) * sp);
    lt = nw;
    const maxMs = (pd && +pd.dataset.dur && +pd.dataset.dur > 0) ? +pd.dataset.dur : Infinity;
    ms = Math.min(ms + elapsed, maxMs);
    u();
  } else {
    lt = Date.now();
  }
}, 100);

// Start slideshow on load if initially idle or paused
if (typeof isPlayingInitial !== 'undefined' && !isPlayingInitial) {
  startHxySlideshow();
} else {
  const idlePlCard = document.getElementById('idle-player-card');
  if (idlePlCard && idlePlCard.style.display !== 'none') {
    startHxySlideshow();
  }
}

// Background prefetch for slideshow images to ensure 0ms transition latency
window.addEventListener('load', () => {
  setTimeout(() => {
    if (typeof hxyImages !== 'undefined' && hxyImages.length > 0) {
      hxyImages.forEach(src => {
        const img = new Image();
        img.src = src;
      });
    }
  }, 2000); // Start 2 seconds after page load when browser is idle
});

</script>
</body>
</html>`;

  return new Response(html, { headers: {'content-type':'text/html;charset=utf-8','cache-control':'no-cache, no-store, must-revalidate','pragma':'no-cache','expires':'0'}, cf: {cacheTtl: -1} });
}