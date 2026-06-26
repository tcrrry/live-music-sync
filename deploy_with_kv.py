import os
import urllib.request
import urllib.error
import json
import subprocess

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

def call_cf_api(endpoint, token, method='GET', data=None):
    url = f"https://api.cloudflare.com/client/v4/{endpoint}"
    req = urllib.request.Request(url, method=method)
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('Content-Type', 'application/json')
    
    if data:
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

    # 1. Use hardcoded KV Namespace ID
    namespace_id = "aebff9e7ffa64715ad0e03d4a558a421"
    print(f"Using KV Namespace 'tcrrry_music_kv' with ID: {namespace_id}")

    # 2. Read Worker code from worker.js (Service Worker format)
    with open("worker.js", "r", encoding="utf-8") as f:
        worker_js = f.read()
    
    with open("worker.js", "w", encoding="utf-8") as f:
        f.write(worker_js.strip())

    # 3. Write metadata (with body_part: script)
    metadata = {
        "body_part": "script",
        "bindings": [
            {
                "type": "kv_namespace",
                "name": "MUSIC_KV",
                "namespace_id": namespace_id
            }
        ]
    }
    with open("metadata.json", "w", encoding="utf-8") as f:
        f.write(json.dumps(metadata))

    print("\n3. Uploading Service Worker script to Cloudflare with KV binding...")
    cmd = [
        "curl.exe", "-s", "-X", "PUT",
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/tcrrry-music-backend",
        "-H", f"Authorization: Bearer {token}",
        "-F", "metadata=@metadata.json;type=application/json",
        "-F", "script=@worker.js;type=application/javascript"
    ]
    
    res = subprocess.run(cmd, capture_output=True)
    if res.returncode != 0:
        print(f"curl command failed: {res.stderr.decode('utf-8', errors='ignore')}")
        return

    try:
        res_json = json.loads(res.stdout.decode('utf-8', errors='ignore'))
        if res_json.get('success'):
            print("Service Worker with KV binding deployed successfully!")
        else:
            print("Failed to deploy Worker script:")
            print(json.dumps(res_json, indent=2))
    except Exception as e:
        print(f"Error parsing response: {e}")
        print(f"Stdout: {res.stdout.decode('utf-8', errors='ignore') if res.stdout else None}")

if __name__ == '__main__':
    main()
