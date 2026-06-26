import os
import urllib.request
import urllib.error
import json

def load_env():
    env_vars = {}
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    key, val = line.split('=', 1)
                    env_vars[key.strip()] = val.strip()
    return env_vars

def call_cf_api(endpoint, token, method='GET', data=None, content_type='application/json'):
    url = f"https://api.cloudflare.com/client/v4/{endpoint}"
    req = urllib.request.Request(url, method=method)
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('Content-Type', content_type)
    
    if data:
        if isinstance(data, str):
            req.data = data.encode('utf-8')
        else:
            req.data = json.dumps(data).encode('utf-8')
            
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode('utf-8'))
            return err_body
        except Exception:
            return {"success": False, "errors": [{"message": str(e)}]}
    except Exception as e:
        return {"success": False, "errors": [{"message": str(e)}]}

def main():
    env = load_env()
    token = env.get('CLOUDFLARE_API_TOKEN')
    account_id = env.get('CLOUDFLARE_ACCOUNT_ID')
    
    if not token or not account_id:
        print("Error: Required environment variables not found in .env.")
        return

    script_name = "tcrrry-music-backend"
    
    # We update the Worker code to catch ALL requests and record the path/body for debugging.
    # It will print the request path, method, headers and body to help us see where LobstaTracker pushes.
    worker_code = """
let currentStatus = {
  "volume_pct": 50,
  "audio_sr_actual": 44100,
  "audio_ch_mode": "Stereo",
  "audio_enc": "FLAC",
  "bt_device": "Speaker",
  "audio_track": "No Track Playing",
  "debug_info": {}
};

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

  // Debugging: If it's a GET request, return currentStatus including the captured debug_info
  if (request.method === "GET") {
    return new Response(JSON.stringify(currentStatus), {
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" }
    });
  }

  // If it's a POST, capture the request URL, headers, and body for diagnosis, 
  // and temporarily return 200 OK for ALL paths to see if it makes the app succeed.
  if (request.method === "POST") {
    let bodyText = "";
    let bodyJson = null;
    try {
      bodyText = await request.text();
      bodyJson = JSON.parse(bodyText);
    } catch (e) {
      // Not JSON or empty body
    }

    // Capture debug info
    const headersObj = {};
    for (const [key, value] of request.headers.entries()) {
      headersObj[key] = value;
    }

    currentStatus.debug_info = {
      path: url.pathname,
      query: url.search,
      headers: headersObj,
      bodyRaw: bodyText,
      timestamp: new Date().toISOString()
    };

    // If it is JSON, also try to update currentStatus (in case it is the correct update request)
    if (bodyJson) {
      currentStatus = Object.assign({}, currentStatus, bodyJson);
    }

    return new Response(JSON.stringify({ success: true, message: "Captured" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  return new Response("Not Allowed", { status: 405, headers: corsHeaders });
}
"""

    print(f"Uploading Debugging Worker script '{script_name}' to Cloudflare...")
    upload_endpoint = f"accounts/{account_id}/workers/scripts/{script_name}"
    upload_res = call_cf_api(
        upload_endpoint, 
        token, 
        method='PUT', 
        data=worker_code.strip(), 
        content_type='application/javascript'
    )
    
    if not upload_res.get('success'):
        print("Failed to upload Debugging Worker script:")
        print(json.dumps(upload_res, indent=2))
        return
    print("Debugging Worker script deployed successfully!")

if __name__ == '__main__':
    main()
