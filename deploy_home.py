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

def main():
    env = load_env()
    token = env.get('CLOUDFLARE_API_TOKEN')
    account_id = env.get('CLOUDFLARE_ACCOUNT_ID')
    
    if not token or not account_id:
        print("Error: Required environment variables not found in .env.")
        return

    script_name = "tcrrry-home"
    namespace_id = "aebff9e7ffa64715ad0e03d4a558a421" # tcrrry_music_kv namespace ID

    # 1. Write metadata (with body_part: script and MUSIC_KV binding)
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
    metadata_file = "metadata_home.json"
    with open(metadata_file, "w", encoding="utf-8") as f:
        f.write(json.dumps(metadata))

    print(f"Uploading tcrrry-home.js to Cloudflare with MUSIC_KV binding...")
    cmd = [
        "curl.exe", "-s", "-X", "PUT",
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{script_name}",
        "-H", f"Authorization: Bearer {token}",
        "-F", f"metadata=@{metadata_file};type=application/json",
        "-F", "script=@tcrrry-home.js;type=application/javascript"
    ]
    
    res = subprocess.run(cmd, capture_output=True)
    if res.returncode != 0:
        print(f"curl command failed: {res.stderr.decode('utf-8', errors='ignore')}")
        return

    try:
        res_json = json.loads(res.stdout.decode('utf-8', errors='ignore'))
        if res_json.get('success'):
            print("Worker script tcrrry-home with KV binding deployed successfully!")
        else:
            print("Failed to deploy Worker script:")
            print(json.dumps(res_json, indent=2))
    except Exception as e:
        print(f"Error parsing response: {e}")
        print(f"Stdout: {res.stdout.decode('utf-8', errors='ignore') if res.stdout else None}")

if __name__ == '__main__':
    main()
