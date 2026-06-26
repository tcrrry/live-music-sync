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

    # 1. Find KV Namespace ID
    print("1. Querying KV Namespaces...")
    kv_endpoint = f"accounts/{account_id}/storage/kv/namespaces"
    list_res = call_cf_api(kv_endpoint, token)
    
    namespace_id = None
    if list_res.get('success'):
        for ns in list_res.get('result', []):
            if ns.get('title') == "tcrrry_music_kv":
                namespace_id = ns.get('id')
                break
                
    if not namespace_id:
        print("Error: KV Namespace 'tcrrry_music_kv' not found.")
        return
    print(f"Found KV Namespace ID: {namespace_id}")

    # 2. Try to query or create the workers.dev subdomain
    print("\n2. Checking workers.dev subdomain status...")
    subdomain_info = call_cf_api(f"accounts/{account_id}/workers/subdomain", token)
    
    subdomain = None
    if subdomain_info.get('success') and subdomain_info.get('result'):
        subdomain = subdomain_info.get('result', {}).get('subdomain')
        print(f"Found existing workers.dev subdomain: {subdomain}")
    else:
        print("No workers.dev subdomain found. Attempting to register 'tcrrry' as your subdomain...")
        # Try to register 'tcrrry' as subdomain
        sub_res = call_cf_api(f"accounts/{account_id}/workers/subdomain", token, method='PUT', data={"subdomain": "tcrrry"})
        if sub_res.get('success'):
            subdomain = "tcrrry"
            print("Successfully registered subdomain 'tcrrry.workers.dev'!")
        else:
            print("Failed to register 'tcrrry' subdomain. Trying 'tcrrry-home'...")
            sub_res2 = call_cf_api(f"accounts/{account_id}/workers/subdomain", token, method='PUT', data={"subdomain": "tcrrry-home"})
            if sub_res2.get('success'):
                subdomain = "tcrrry-home"
                print("Successfully registered subdomain 'tcrrry-home.workers.dev'!")
            else:
                print("Failed to register subdomain automatically.")
                print(json.dumps(sub_res2, indent=2))
                # We can't proceed without a subdomain for schedules, but let's try configuring it anyway

    script_name = "hxy-news-tracker"

    # 2.5 Upload script with KV binding
    print("\n2.5 Uploading scraper.js with KV binding...")
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
    metadata_file = "scraper_metadata.json"
    with open(metadata_file, "w", encoding="utf-8") as f:
        f.write(json.dumps(metadata))

    cmd = [
        "curl.exe", "-s", "-X", "PUT",
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{script_name}",
        "-H", f"Authorization: Bearer {token}",
        "-F", f"metadata=@{metadata_file};type=application/json",
        "-F", "script=@scraper.js;type=application/javascript"
    ]
    
    res = subprocess.run(cmd, capture_output=True)
    if res.returncode != 0:
        print(f"curl command failed: {res.stderr.decode('utf-8', errors='ignore')}")
        return

    try:
        res_json = json.loads(res.stdout.decode('utf-8', errors='ignore'))
        if res_json.get('success'):
            print("Worker script scraper.js with KV binding deployed successfully!")
        else:
            print("Failed to deploy Worker script:")
            print(json.dumps(res_json, indent=2))
            return
    except Exception as e:
        print(f"Error parsing response: {e}")
        print(f"Stdout: {res.stdout.decode('utf-8', errors='ignore') if res.stdout else None}")
        return

    # 3. Configure Cron Trigger Schedule (Run every 10 minutes)
    print("\n3. Configuring Cron Trigger Schedule (run every 10 minutes)...")
    schedule_endpoint = f"accounts/{account_id}/workers/scripts/{script_name}/schedules"
    schedule_data = [{"cron": "*/10 * * * *"}]
    schedule_res = call_cf_api(schedule_endpoint, token, method='PUT', data=schedule_data)
    
    if schedule_res.get('success'):
        print("Cron Trigger scheduled successfully!")
    else:
        print("Failed to configure schedule:")
        print(json.dumps(schedule_res, indent=2))
        return

    # 4. Enable workers.dev subdomain for the script
    if subdomain:
        print(f"\n4. Enabling {subdomain}.workers.dev subdomain for the script...")
        subdomain_endpoint = f"accounts/{account_id}/workers/scripts/{script_name}/subdomain"
        subdomain_res = call_cf_api(subdomain_endpoint, token, method='POST', data={"enabled": True})
        if subdomain_res.get('success'):
            print(f"Subdomain enabled! You can manually run the scraper and check logs by visiting:")
            print(f"-> https://{script_name}.{subdomain}.workers.dev/run")
        else:
            print("Failed to enable script subdomain:")
            print(json.dumps(subdomain_res, indent=2))

if __name__ == '__main__':
    main()
