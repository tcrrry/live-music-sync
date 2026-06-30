function sanitizeMetadata(track, artist) {

  let cleanTrack = track || '';

  let cleanArtist = artist || '';

  

  if (cleanArtist === '' || cleanArtist === '黄霄' || cleanArtist === '黄' || cleanArtist.includes('\uFFFD')) {

    cleanArtist = '黄霄雲';

  }

  

  const trackLower = cleanTrack.toLowerCase();

  if (cleanTrack.includes('ʽ΢') || trackLower.includes('ʽΰ') || trackLower.includes('shivi') || trackLower.includes('式微')) {

    cleanTrack = '式微 (《牧神记》动画片尾曲)';

    cleanArtist = '黄霄雲';

  } else if (cleanTrack.includes('ʢ') || trackLower.includes('ʢ') || trackLower.includes('莲花') || trackLower.includes('lianhua') || trackLower.includes('盛开')) {

    cleanTrack = '莲花盛开 (庆祝澳门回归25周年青春献礼歌)';

    cleanArtist = '黄霄雲';

  }

  

  return { track: cleanTrack, artist: cleanArtist };

}



let defaultStatus = {

  "volume_pct": 50,

  "audio_sr_actual": 44100,

  "audio_ch_mode": "Stereo",

  "audio_enc": "FLAC",

  "bt_device": "Speaker",

  "audio_track": "No Track Playing",

  "debug_info": {}

};



async function getStatusFromCache() {

  try {

    const cacheUrl = "https://tcrrry.com/cache/status";

    const cachedResponse = await caches.default.match(new Request(cacheUrl));

    if (cachedResponse) {

      return await cachedResponse.json();

    }

  } catch (e) {}

  return null;

}



async function setStatusToCache(statusObj) {

  try {

    const cacheUrl = "https://tcrrry.com/cache/status";

    const response = new Response(JSON.stringify(statusObj), {

      headers: {

        "Content-Type": "application/json; charset=utf-8",

        "Cache-Control": "public, max-age=2592000"

      }

    });

    await caches.default.put(new Request(cacheUrl), response);

  } catch (e) {}

}



function isWriteNeeded(current, incoming) {

  if (!current.audio_track || !current.audio_position_ts) {

    return true;

  }

  if (

    (incoming.audio_track !== undefined && incoming.audio_track !== current.audio_track) ||

    (incoming.audio_artist !== undefined && incoming.audio_artist !== current.audio_artist) ||

    (incoming.audio_state !== undefined && incoming.audio_state !== current.audio_state) ||

    (incoming.audio_speed !== undefined && incoming.audio_speed !== current.audio_speed) ||

    (incoming.bt_device !== undefined && incoming.bt_device !== current.bt_device) ||

    (incoming.audio_sr_actual !== undefined && incoming.audio_sr_actual !== current.audio_sr_actual) ||

    (incoming.audio_ch_mode !== undefined && incoming.audio_ch_mode !== current.audio_ch_mode) ||

    (incoming.audio_enc !== undefined && incoming.audio_enc !== current.audio_enc)

  ) {

    return true;

  }

  if (incoming.volume_pct !== undefined && Math.abs(incoming.volume_pct - (current.volume_pct || 0)) > 2) {

    return true;

  }

  if (incoming.batt !== undefined && Math.abs(incoming.batt - (current.batt || 0)) > 2) {

    return true;

  }

  if (

    (incoming.lat !== undefined && Math.abs(incoming.lat - (current.lat || 0)) > 0.0001) ||

    (incoming.lon !== undefined && Math.abs(incoming.lon - (current.lon || 0)) > 0.0001)

  ) {

    return true;

  }

  if (incoming.audio_position_ms !== undefined) {

    const nowTs = Date.now() / 1000 - 2.0;

    const elapsedSec = Math.max(0, nowTs - current.audio_position_ts);

    const expectedMs = current.audio_position_ms + elapsedSec * 1000 * parseFloat(current.audio_speed || 1.0);

    const diffMs = Math.abs(incoming.audio_position_ms - expectedMs);

    if (diffMs > 1000) {

      return true;

    }

  }

  return false;

}



let lastForwardError = "";

async function forwardToRouter(bodyText) {

  try {

    const controller = new AbortController();

    const id = setTimeout(() => controller.abort(), 6000); // 2000ms timeout to accommodate slow router response

    const resp = await fetch("https://router.tcrrry.com/cgi-bin/music_status", {

      method: "POST",

      headers: {

        "Content-Type": "application/json",

        "User-Agent": "Mozilla/5.0"

      },

      body: bodyText,

      signal: controller.signal

    });

    clearTimeout(id);

    if (!resp.ok) {

      lastForwardError = "Status " + resp.status + ": " + (await resp.text()).slice(0, 100);

      return false;

    }

    return true;

  } catch (e) {

    lastForwardError = "Error: " + e.message;

    return false;

  }

}



addEventListener('fetch', event => {

  event.respondWith(handleRequest(event.request))

});



async function handleRequest(request) {

  const url = new URL(request.url);

  const corsHeaders = {

    "Access-Control-Allow-Origin": "*",

    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",

    "Access-Control-Allow-Headers": "Content-Type"

  };



  if (request.method === "OPTIONS") {

    return new Response(null, { headers: corsHeaders });

  }



  if (url.pathname === "/api/slideshow-images") {

    if (request.method === "POST") {

      try {

        const data = await request.json();

        if (!data || data.token !== "YOUR_PUSH_TOKEN") {

          return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {

            status: 403,

            headers: corsHeaders

          });

        }

        

        const images = data.images;

        if (!Array.isArray(images)) {

          return new Response(JSON.stringify({ success: false, error: "Invalid images array" }), {

            status: 400,

            headers: corsHeaders

          });

        }

        

        await MUSIC_KV.put("slideshow_images", JSON.stringify(images));

        return new Response(JSON.stringify({ success: true, count: images.length }), {

          headers: { ...corsHeaders, "Content-Type": "application/json" }

        });

      } catch (e) {

        return new Response(JSON.stringify({ success: false, error: e.message }), {

          status: 500,

          headers: corsHeaders

        });

      }

    }

  }



  if (url.pathname === "/api/status") {

    if (request.method === "GET") {

      let currentStatusText = null;

      let statusObj = null;

      

      let cachedStatus = await getStatusFromCache();

      if (cachedStatus) {

        statusObj = cachedStatus;

        currentStatusText = JSON.stringify(statusObj);

      } else {

        try {

          currentStatusText = await MUSIC_KV.get("status");

          statusObj = currentStatusText ? JSON.parse(currentStatusText) : Object.assign({}, defaultStatus);

        } catch(e) {

          statusObj = Object.assign({}, defaultStatus);

          currentStatusText = JSON.stringify(statusObj);

        }

      }

      

      // If token matches, return full unfiltered status (including GPS, battery, tokens etc.)

      const tokenParam = url.searchParams.get("token");

      if (tokenParam === "YOUR_PUSH_TOKEN") {

        return new Response(currentStatusText || JSON.stringify(defaultStatus), {

          headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" }

        });

      }

      

      // Filter out sensitive fields (GPS lat/lon, acc, batt, token, tid, and raw debug_info) for privacy protection

      let safeStatus = {

        volume_pct: statusObj.volume_pct,

        audio_sr_actual: statusObj.audio_sr_actual,

        audio_ch_mode: statusObj.audio_ch_mode,

        audio_enc: statusObj.audio_enc,

        bt_device: statusObj.bt_device,

        audio_track: statusObj.audio_track,

        audio_artist: statusObj.audio_artist,

        audio_state: statusObj.audio_state,

        audio_position_ms: statusObj.audio_position_ms,

        audio_duration_ms: statusObj.audio_duration_ms,

        audio_position_ts: statusObj.audio_position_ts,

        audio_speed: statusObj.audio_speed,

        audio_sr_max: statusObj.audio_sr_max,

        audio_ch: statusObj.audio_ch,

        audio_dev_type: statusObj.audio_dev_type,

        audio_sr: statusObj.audio_sr,

        audio_pkg: statusObj.audio_pkg || "",

        state_change_ts: statusObj.state_change_ts || statusObj.audio_position_ts || 0

      };



      return new Response(JSON.stringify(safeStatus), {

        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" }

      });

    } else if (request.method === "POST") {

      try {

        const data = await request.json();

        if (data) {

          const sanitized = sanitizeMetadata(data.audio_track, data.audio_artist);

          data.audio_track = sanitized.track;

          data.audio_artist = sanitized.artist;

        }

        

        // Token authentication check to prevent unauthorized injection

        if (!data || data.token !== "YOUR_PUSH_TOKEN") {

          return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {

            status: 403,

            headers: corsHeaders

          });

        }

        

        let currentStatus = await getStatusFromCache();

        if (!currentStatus) {

          try {

            let currentStatusText = await MUSIC_KV.get("status");

            currentStatus = currentStatusText ? JSON.parse(currentStatusText) : Object.assign({}, defaultStatus);

          } catch(e) {

            currentStatus = Object.assign({}, defaultStatus);

          }

        }

        

        // Check for mojibake/trash in reported track name

        const incomingTrack = data.audio_track || '';

        const incomingArtist = data.audio_artist || '';

        const isIncomingTrash = incomingTrack.includes('\uFFFD') || incomingArtist.includes('\uFFFD') ||

                                /[\u0250-\u03FF]/.test(incomingTrack) || /[\u0250-\u03FF]/.test(incomingArtist) ||

                                incomingTrack.includes('ʽ') || incomingTrack.includes('΢');

                                

        if (isIncomingTrash) {

          try {

            const rResp = await fetch("https://router.tcrrry.com/cgi-bin/music_status").catch(() => null);

            if (rResp && rResp.ok) {

              const rData = await rResp.json();

              const rTrack = rData.audio_track || '';

              const rTrash = rTrack.includes('\uFFFD') || /[\u0250-\u03FF]/.test(rTrack) || rTrack.includes('ʽ') || rTrack.includes('΢');

              if (rTrack && !rTrash) {

                data.audio_track = rData.audio_track;

                data.audio_artist = rData.audio_artist || data.audio_artist;

              } else {

                delete data.audio_track;

                delete data.audio_artist;

              }

            } else {

              delete data.audio_track;

              delete data.audio_artist;

            }

          } catch(e) {

            delete data.audio_track;

            delete data.audio_artist;

          }

        }



        const writeNeeded = isWriteNeeded(currentStatus, data);

        const updatedStatus = Object.assign({}, currentStatus, data);

        

        const now = Date.now() / 1000;

        updatedStatus.audio_position_ts = now - 2.0;

        

        if (currentStatus.audio_state !== updatedStatus.audio_state || currentStatus.audio_track !== updatedStatus.audio_track) {

          updatedStatus.state_change_ts = now;

        } else if (!currentStatus.state_change_ts) {

          updatedStatus.state_change_ts = now;

        }

        

        const headersObj = {};

        for (const [key, value] of request.headers.entries()) {

          headersObj[key] = value;

        }

        

        updatedStatus.debug_info = {

          path: url.pathname,

          query: url.search,

          headers: headersObj,

          timestamp: new Date().toISOString()

        };



        // Detect seek / manual progress bar drag

        let seekOccurred = false;

        if (currentStatus.audio_position_ts && currentStatus.audio_position_ms && data.audio_position_ms) {

          const elapsedSec = now - currentStatus.audio_position_ts;

          const speed = currentStatus.audio_state === 'paused' ? 0 : parseFloat(currentStatus.audio_speed || 1.0);

          const expectedMs = currentStatus.audio_position_ms + elapsedSec * 1000 * speed;

          if (Math.abs(data.audio_position_ms - expectedMs) > 10000) {

            seekOccurred = true;

          }

        }



        await setStatusToCache(updatedStatus);



        // 1. Always try to forward to the router on every single update (router is free and unlimited)

        let forwarded = await forwardToRouter(JSON.stringify(data));



        // 2. If forwarding to the router succeeded, we DO NOT write to KV (saves KV quota!)

        // 3. If forwarding to the router FAILED (e.g. router is offline/outdoors on 5G):

        //    We fall back to writing to KV, BUT only on major events (songChanged / stateChanged / seekOccurred)

        if (!forwarded) {

          const songChanged = updatedStatus.audio_track !== currentStatus.audio_track;

          const stateChanged = updatedStatus.audio_state !== currentStatus.audio_state;

          

          if (writeNeeded && (songChanged || stateChanged || seekOccurred)) {

            updatedStatus.last_kv_write_ts = now;

            await setStatusToCache(updatedStatus);

            try {

              await MUSIC_KV.put("status", JSON.stringify(updatedStatus));

            } catch(kvErr) {

              // Ignore KV write limit errors

            }

          }

        }



        return new Response(JSON.stringify({ success: true, written: !forwarded && writeNeeded, forwarded: forwarded }), {

          headers: { ...corsHeaders, "Content-Type": "application/json" }

        });

      } catch (e) {

        return new Response(JSON.stringify({ success: false, error: e.message, forwardError: lastForwardError }), {

          status: 400,

          headers: { ...corsHeaders, "Content-Type": "application/json" }

        });

      }

    }

  }



  if (request.method === "POST") {

    try {

      let bodyText = await request.text();

      let bodyJson = null;

      try {

        bodyJson = JSON.parse(bodyText);

      } catch(e) {}

      if (bodyJson) {

        const sanitized = sanitizeMetadata(bodyJson.audio_track, bodyJson.audio_artist);

        bodyJson.audio_track = sanitized.track;

        bodyJson.audio_artist = sanitized.artist;

      }

      

      // Token authentication check

      if (!bodyJson || bodyJson.token !== "YOUR_PUSH_TOKEN") {

        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {

          status: 403,

          headers: corsHeaders

        });

      }

      

      let currentStatus = await getStatusFromCache();

      if (!currentStatus) {

        try {

          let currentStatusText = await MUSIC_KV.get("status");

          currentStatus = currentStatusText ? JSON.parse(currentStatusText) : Object.assign({}, defaultStatus);

        } catch(e) {

          currentStatus = Object.assign({}, defaultStatus);

        }

      }



      const headersObj = {};

      for (const [key, value] of request.headers.entries()) {

        headersObj[key] = value;

      }

      

      // Check for mojibake/trash in reported track name

      if (bodyJson) {

        const incomingTrack = bodyJson.audio_track || '';

        const incomingArtist = bodyJson.audio_artist || '';

        const isIncomingTrash = incomingTrack.includes('\uFFFD') || incomingArtist.includes('\uFFFD') ||

                                /[\u0250-\u03FF]/.test(incomingTrack) || /[\u0250-\u03FF]/.test(incomingArtist) ||

                                incomingTrack.includes('ʽ') || incomingTrack.includes('΢');

                                

        if (isIncomingTrash) {

          try {

            const rResp = await fetch("https://router.tcrrry.com/cgi-bin/music_status").catch(() => null);

            if (rResp && rResp.ok) {

              const rData = await rResp.json();

              const rTrack = rData.audio_track || '';

              const rTrash = rTrack.includes('\uFFFD') || /[\u0250-\u03FF]/.test(rTrack) || rTrack.includes('ʽ') || rTrack.includes('΢');

              if (rTrack && !rTrash) {

                bodyJson.audio_track = rData.audio_track;

                bodyJson.audio_artist = rData.audio_artist || bodyJson.audio_artist;

              } else {

                delete bodyJson.audio_track;

                delete bodyJson.audio_artist;

              }

            } else {

              delete bodyJson.audio_track;

              delete bodyJson.audio_artist;

            }

          } catch(e) {

            delete bodyJson.audio_track;

            delete bodyJson.audio_artist;

          }

        }

      }



      const now = Date.now() / 1000;

      let mergedStatus = {};

      const isLocation = bodyJson && bodyJson._type === "location";



      if (isLocation) {

        // 1. For Location updates: Only merge location/battery/device fields, preserve music fields

        const locData = {

          lat: bodyJson.lat,

          lon: bodyJson.lon,

          acc: bodyJson.acc,

          provider: bodyJson.provider,

          batt: bodyJson.batt,

          bt_device: bodyJson.bt_device,

          t: bodyJson.t

        };

        mergedStatus = Object.assign({}, currentStatus, locData);



        // Append to location history for tcrrry-map

        try {

          let historyText = await MUSIC_KV.get("location_history");

          let history = historyText ? JSON.parse(historyText) : [];

          history.push({

            lat: bodyJson.lat,

            lon: bodyJson.lon,

            acc: bodyJson.acc,

            t: bodyJson.t,

            batt: bodyJson.batt

          });

          if (history.length > 200) history.shift();

          await MUSIC_KV.put("location_history", JSON.stringify(history));

        } catch (e) {}

      } else {

        // 2. For Audio updates: Only merge music/playback fields, preserve location fields

        const audioFields = [

          "audio_track", "audio_artist", "audio_state", "audio_position_ms",

          "audio_duration_ms", "audio_speed", "volume_pct", "audio_sr_actual",

          "audio_ch_mode", "audio_enc", "bt_device", "audio_pkg", "audio_sr",

          "audio_sr_max", "audio_ch", "audio_dev_type", "t"

        ];

        const audioData = {};

        for (const field of audioFields) {

          if (bodyJson[field] !== undefined) {

            audioData[field] = bodyJson[field];

          }

        }

        mergedStatus = Object.assign({}, currentStatus, audioData);

        mergedStatus.audio_position_ts = now - 2.0;



        if (currentStatus.audio_state !== mergedStatus.audio_state || currentStatus.audio_track !== mergedStatus.audio_track) {

          mergedStatus.state_change_ts = now;

        } else if (!currentStatus.state_change_ts) {

          mergedStatus.state_change_ts = now;

        }

      }

      

      mergedStatus.debug_info = {

        path: url.pathname,

        query: url.search,

        headers: headersObj,

        bodyRaw: bodyText,

        timestamp: new Date().toISOString()

      };



      // Always update the Cache API (free and fast)

      await setStatusToCache(mergedStatus);



      // Always forward to the router on every update (free and unlimited)

      let forwarded = await forwardToRouter(JSON.stringify(bodyJson));

      

      // If forwarding failed, write to KV on major events as a backup

      if (!forwarded) {

        const songChanged = mergedStatus.audio_track !== currentStatus.audio_track;

        const stateChanged = mergedStatus.audio_state !== currentStatus.audio_state;

        

        let seekOccurred = false;

        if (currentStatus.audio_position_ts && currentStatus.audio_position_ms && bodyJson.audio_position_ms) {

          const elapsedSec = now - currentStatus.audio_position_ts;

          const speed = currentStatus.audio_state === 'paused' ? 0 : parseFloat(currentStatus.audio_speed || 1.0);

          const expectedMs = currentStatus.audio_position_ms + elapsedSec * 1000 * speed;

          if (Math.abs(bodyJson.audio_position_ms - expectedMs) > 10000) {

            seekOccurred = true;

          }

        }



        if (songChanged || stateChanged || seekOccurred) {

          mergedStatus.last_kv_write_ts = now;

          await setStatusToCache(mergedStatus);

          try {

            await MUSIC_KV.put("status", JSON.stringify(mergedStatus));

          } catch(kvErr) {

            // Ignore KV write limit errors

          }

        }

      }

      

      return new Response(JSON.stringify({ success: true, message: "Captured on " + url.pathname, forwarded: forwarded }), {

        headers: { ...corsHeaders, "Content-Type": "application/json" }

      });

    } catch (e) {

      return new Response(JSON.stringify({ success: false, error: e.message, forwardError: lastForwardError }), { status: 400, headers: corsHeaders });

    }

  }



  return new Response("Not Found", { status: 405, headers: corsHeaders });

}

