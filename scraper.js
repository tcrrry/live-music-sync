const WEIBO_UID = "5043186742";
const BILI_UID = "501005668";
const WXPUSHER_APP_TOKEN = "YOUR_WXPUSHER_APP_TOKEN";
const WXPUSHER_UID = "YOUR_WXPUSHER_UID";


addEventListener('scheduled', event => {
  event.waitUntil(runScraper());
});

addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname === "/run") {
    event.respondWith(handleManualRun());
  } else {
    event.respondWith(new Response("hxy-news-tracker is active. Visit /run to trigger manually."));
  }
});

async function handleManualRun() {
  const logs = await runScraper();
  return new Response(JSON.stringify({ success: true, logs }), {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

async function runScraper() {
  const logs = [];
  try {
    logs.push("Starting Weibo scraper...");
    await scrapeWeibo(logs);
  } catch (e) {
    logs.push(`Weibo scraper error: ${e.message}`);
  }

  try {
    logs.push("Starting Bilibili scraper...");
    await scrapeBilibili(logs);
  } catch (e) {
    logs.push(`Bilibili scraper error: ${e.message}`);
  }

  try {
    await updateSlideshowImages(logs);
  } catch (e) {
    logs.push(`Slideshow update error: ${e.message}`);
  }

  return logs;
}

function cleanHtml(text) {
  if (!text) return "";
  return text.replace(/<br\s*\/?>/gi, "\n")
             .replace(/<\/p>/gi, "\n")
             .replace(/<[^>]+>/g, "")
             .replace(/&nbsp;/g, " ")
             .trim();
}

async function sendWxPusher(title, content, url) {
  const pushUrl = "https://wxpusher.zjiecode.com/api/send/message";
  const htmlContent = `
    <h3>${title}</h3>
    <p style="white-space: pre-wrap; color: #333; font-size: 15px;">${content}</p>
    ${url ? `<br/><a href="${url}" style="color: #1aad19; text-decoration: none; font-weight: bold;">👉 点击查看原文</a>` : ""}
  `;

  const payload = {
    appToken: WXPUSHER_APP_TOKEN,
    content: htmlContent.trim(),
    contentType: 2, // 2 is HTML format
    uids: [WXPUSHER_UID]
  };

  const res = await fetch(pushUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

async function scrapeWeibo(logs) {
  const url = `https://m.weibo.cn/api/container/getIndex?type=uid&value=${WEIBO_UID}&containerid=107603${WEIBO_UID}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"
    }
  });

  if (!response.ok) {
    logs.push(`Weibo fetch failed: ${response.status}`);
    return;
  }

  const data = await response.json();
  if (!data.ok || !data.data || !data.data.cards) {
    logs.push("Weibo response structure invalid or empty.");
    return;
  }

  const cards = data.data.cards.filter(c => c.card_type === 9 && c.mblog);
  if (cards.length === 0) {
    logs.push("No Weibo status cards found.");
    return;
  }

  const latestCard = cards[0];
  const mblog = latestCard.mblog;
  const latestId = mblog.id.toString();

  const lastId = await MUSIC_KV.get("weibo_last_id");
  logs.push(`Weibo: Latest ID = ${latestId}, Cached Last ID = ${lastId}`);

  if (!lastId) {
    logs.push("Initializing Weibo last ID in KV...");
    await MUSIC_KV.put("weibo_last_id", latestId);
    return;
  }

  if (latestId !== lastId) {
    logs.push("New Weibo post found! Sending notification...");
    const cleanText = cleanHtml(mblog.text);
    const postUrl = `https://weibo.com/${WEIBO_UID}/${mblog.bid}`;
    
    const pushRes = await sendWxPusher("Bread(黄霄雲) 微博更新了！", cleanText, postUrl);
    logs.push(`Weibo WxPusher result: ${JSON.stringify(pushRes)}`);
    
    await MUSIC_KV.put("weibo_last_id", latestId);
  }
}

async function scrapeBilibili(logs) {
  const url = `https://api.bilibili.com/x/polymer/web-dynamic/v1/portal/feed/space?host_mid=${BILI_UID}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": `https://space.bilibili.com/${BILI_UID}`
    }
  });

  if (!response.ok) {
    logs.push(`Bilibili fetch failed: ${response.status}`);
    return;
  }

  const data = await response.json();
  if (data.code !== 0 || !data.data || !data.data.items) {
    logs.push(`Bilibili API returned error code ${data.code} or empty dynamic list.`);
    return;
  }

  const items = data.data.items;
  if (items.length === 0) {
    logs.push("No Bilibili dynamic items found.");
    return;
  }

  const latestItem = items[0];
  const latestId = latestItem.id_str;

  const lastId = await MUSIC_KV.get("bilibili_last_id");
  logs.push(`Bilibili: Latest ID = ${latestId}, Cached Last ID = ${lastId}`);

  if (!lastId) {
    logs.push("Initializing Bilibili last ID in KV...");
    await MUSIC_KV.put("bilibili_last_id", latestId);
    return;
  }

  if (latestId !== lastId) {
    logs.push("New Bilibili dynamic found! Sending notification...");
    
    let title = "Bread(黄霄雲) B站发新动态了！";
    let content = "";
    let postUrl = `https://t.bilibili.com/${latestId}`;

    const type = latestItem.type;
    const moduleDynamic = latestItem.modules.module_dynamic;
    
    if (moduleDynamic && moduleDynamic.desc) {
      content = moduleDynamic.desc.text;
    }

    if (type === "DYNAMIC_TYPE_AV" && moduleDynamic.major && moduleDynamic.major.archive) {
      const archive = moduleDynamic.major.archive;
      title = "Bread(黄霄雲) B站投稿视频了！";
      content = `《${archive.title}》\n\n简介: ${archive.desc || "无"}`;
      postUrl = `https://www.bilibili.com/video/${archive.bvid}`;
    }

    const pushRes = await sendWxPusher(title, content.trim(), postUrl);
    logs.push(`Bilibili WxPusher result: ${JSON.stringify(pushRes)}`);
    
    await MUSIC_KV.put("bilibili_last_id", latestId);
  }
}

const FALLBACK_IMAGES = [
  'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1iehipere66j30u01407ej.jpg',
  'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1iehipf6qn2j30u0140n6l.jpg',
  'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1iehipefmywj30u0140ti7.jpg',
  'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1iehipfwpywj30u0140n6z.jpg',
  'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1iehipg8wf0j30u014012g.jpg',
  'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1iehipgk0tqj30u0140486.jpg',
  'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1iehipgwvq3j30u0140gu8.jpg',
  'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1iehiphkhvzj30u0140tiv.jpg',
  'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1iehipi2px2j30u0140dof.jpg',
  'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1iegi8322hbj31o02807wi.jpg',
  'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1iegi83vnvhj31ix219hdt.jpg',
  'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1iegi8lcbkij31hc1z4kc7.jpg',
  'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1ief94t58hqj30k00wwdm2.jpg',
  'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEly1ief94tcna4j30k00wz7b3.jpg',
  'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1ief94tskeyj30k00wywlj.jpg',
  'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEly1ief94u4zouj30jo0wygsp.jpg',
  'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEly1ief94ug52yj30k00w8n3x.jpg',
  'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEly1ief94stb2nj30jv0wx7ah.jpg',
  'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEgy1iebtzbptqwj32m83xcb2b.jpg',
  'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEgy1iebtzaa2g7j32m83zlx6q.jpg',
  'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEgy1iebtzhj0r4j30k00zk10y.jpg',
  'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEgy1iebtzo54vsj30qo140ada.jpg',
  'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEgy1iebtzi84dpj30k00zkdo6.jpg',
  'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEgy1ie5uz0fm64j31at1qfe23.jpg',
  'https://i3.wp.com/wx1.sinaimg.cn/mw2000/005viHfEgy1ie5uz33mlxj32c03401ky.jpg',
  'https://i3.wp.com/wx2.sinaimg.cn/mw2000/005viHfEgy1ie5uz5eretj32c0340x6p.jpg',
  'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEgy1ie5uyyguy0j30k00zkn2q.jpg',
  'https://i3.wp.com/wx4.sinaimg.cn/mw2000/005viHfEgy1ie5uz7c2zgj30u01j7tlf.jpg',
  'https://i3.wp.com/wx3.sinaimg.cn/mw2000/005viHfEgy1ie5uz8vfqhj32072txu0x.jpg',
  'https://i3.wp.com/wx1.sinaimg.cn/mw2000/0069zNiggy1i1rdrhdtj3j32m83xcu12.jpg'
];

async function updateSlideshowImages(logs) {
  logs.push("Starting slideshow images auto-update check...");
  
  const targetUids = [
    { uid: "5043186742", name: "黄霄雲" },
    { uid: "5638314984", name: "好想吃面包蛋糕芝士" }
  ];
  
  const extractedImages = [];
  
  for (const { uid, name } of targetUids) {
    try {
      logs.push(`Fetching Weibo posts for ${name} (${uid})...`);
      const url = `https://m.weibo.cn/api/container/getIndex?type=uid&value=${uid}&containerid=107603${uid}`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
          "Referer": `https://m.weibo.cn/u/${uid}`,
          "Accept": "application/json, text/plain, */*"
        }
      });
      
      if (!response.ok) {
        logs.push(`Fetch failed for ${name}: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      if (!data.ok || !data.data || !data.data.cards) {
        logs.push(`No cards or invalid structure for ${name}.`);
        continue;
      }
      
      const cards = data.data.cards.filter(c => c.card_type === 9 && c.mblog);
      let accountPicCount = 0;
      
      for (const card of cards) {
        const mblog = card.mblog;
        
        // Check both own pics and retweeted pics
        const pics = mblog.pics || (mblog.retweeted_status ? mblog.retweeted_status.pics : null);
        if (!pics) continue;
        
        for (const pic of pics) {
          const w = parseInt(pic.large?.geo?.width || pic.geo?.width || 0);
          const h = parseInt(pic.large?.geo?.height || pic.geo?.height || 0);
          
          // Heuristic for portrait image (height / width >= 1.25)
          if (w > 0 && h / w >= 1.25) {
            let imgUrl = pic.large?.url || pic.url;
            if (imgUrl) {
              // Ensure highest resolution
              imgUrl = imgUrl.replace("/orj360/", "/large/").replace("/orj480/", "/large/").replace("/bmiddle/", "/large/").replace("/thumb150/", "/large/");
              const originalUrl = imgUrl.replace("/large/", "/original/");
              
              // Rewrite to WordPress Photon CDN
              const cleanUrl = originalUrl.replace(/^https?:\/\//, '');
              const photonUrl = 'https://i3.wp.com/' + cleanUrl;
              
              extractedImages.push(photonUrl);
              accountPicCount++;
            }
          }
        }
      }
      logs.push(`Extracted ${accountPicCount} vertical images from ${name}.`);
    } catch (e) {
      logs.push(`Error updating images for ${name}: ${e.message}`);
    }
  }
  
  if (extractedImages.length === 0) {
    logs.push("No new vertical images extracted from either account.");
  }
  
  // Read current images from KV
  let currentImages = [];
  try {
    const cached = await MUSIC_KV.get("slideshow_images");
    if (cached) {
      currentImages = JSON.parse(cached);
    }
  } catch (e) {
    logs.push(`Error reading slideshow_images from KV: ${e.message}`);
  }
  
  if (!currentImages || currentImages.length === 0) {
    logs.push("KV slideshow_images empty, initializing with fallback images.");
    currentImages = [...FALLBACK_IMAGES];
  }
  
  // Merge and deduplicate: new images first
  const mergedPool = Array.from(new Set([...extractedImages, ...currentImages]));
  const finalPool = mergedPool.slice(0, 30);
  
  // Check if there is any difference between old and new pool
  const currentImagesJson = await MUSIC_KV.get("slideshow_images");
  let currentPool = [];
  if (currentImagesJson) {
    try { currentPool = JSON.parse(currentImagesJson); } catch (e) {}
  }
  if (currentPool.length === 0) {
    currentPool = [...FALLBACK_IMAGES];
  }
  
  const isDifferent = JSON.stringify(finalPool) !== JSON.stringify(currentPool);
  
  if (isDifferent) {
    logs.push("Slideshow pool updated. Saving to KV...");
    await MUSIC_KV.put("slideshow_images", JSON.stringify(finalPool));
    logs.push("Successfully saved 30 slideshow images to KV.");
  } else {
    logs.push("Slideshow pool is already identical to KV. Skipping KV write.");
  }
}