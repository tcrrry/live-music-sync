#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import re
import json
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime
from random import choice, randint, random
from time import time

# --- CONFIGURATION ---
WEIBO_ACCOUNTS = [
    {"uid": "5043186742", "name": "黄霄雲"},
    {"uid": "5638314984", "name": "好想吃面包蛋糕芝士"},
    {"uid": "7425692430", "name": "见鬼SEEGHOST"},
    {"uid": "7869551031", "name": "宇宙回音"}
]
BILI_UID = "501005668"

DOUYIN_ACCOUNTS = [
    {"sec_uid": "MS4wLjABAAAAjW0gMk6HfnozLjpBmla_Ad2igcU4EkqV6WwnkK0ZuNM", "name": "黄霄雲"},
    {"sec_uid": "MS4wLjABAAAAkQtgDTZYCFE82g4_g5Ndt8y_TZ5MuAxOvTkBNR8OUx3jCoV1AKmU07GJ-Tv9FdAl", "name": "好想吃面包蛋糕芝士"}
]

WXPUSHER_APP_TOKEN = "YOUR_WXPUSHER_APP_TOKEN"  # Get from https://wxpusher.zjiecode.com
WXPUSHER_UID = "YOUR_WXPUSHER_UID"              # Your WxPusher user ID

# Cookies (automatically filled during SSH deploy)
WEIBO_COOKIE = ""
BILI_COOKIE = ""

# Save state in the same directory as the script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(SCRIPT_DIR, "hxy_scraper_state.json")


# --- CRYPTO & SIGNATURE GENERATOR FOR DOUYIN ---

IV = [
    1937774191, 1226093241, 388252375, 3666478592,
    2842636476, 372324522, 3817729613, 2969243214,
]

T_j = [
    2043430169, 2043430169, 2043430169, 2043430169, 2043430169, 2043430169,
    2043430169, 2043430169, 2043430169, 2043430169, 2043430169, 2043430169,
    2043430169, 2043430169, 2043430169, 2043430169, 2055708042, 2055708042,
    2055708042, 2055708042, 2055708042, 2055708042, 2055708042, 2055708042,
    2055708042, 2055708042, 2055708042, 2055708042, 2055708042, 2055708042,
    2055708042, 2055708042, 2055708042, 2055708042, 2055708042, 2055708042,
    2055708042, 2055708042, 2055708042, 2055708042, 2055708042, 2055708042,
    2055708042, 2055708042, 2055708042, 2055708042, 2055708042, 2055708042,
    2055708042, 2055708042, 2055708042, 2055708042, 2055708042, 2055708042,
    2055708042, 2055708042, 2055708042, 2055708042, 2055708042, 2055708042,
    2055708042, 2055708042, 2055708042, 2055708042
]

def rotl(x, n):
    return ((x << n) & 0xffffffff) | ((x >> (32 - n)) & 0xffffffff)

def sm3_ff_j(x, y, z, j):
    if 0 <= j and j < 16:
        return x ^ y ^ z
    elif 16 <= j and j < 64:
        return (x & y) | (x & z) | (y & z)
    return 0

def sm3_gg_j(x, y, z, j):
    if 0 <= j and j < 16:
        return x ^ y ^ z
    elif 16 <= j and j < 64:
        return (x & y) | ((~ x) & z)
    return 0

def sm3_p_0(x):
    return x ^ (rotl(x, 9)) ^ (rotl(x, 17))

def sm3_p_1(x):
    return x ^ (rotl(x, 15)) ^ (rotl(x, 23))

def sm3_cf(v_i, b_i):
    w = []
    for i in range(16):
        weight = 0x1000000
        data = 0
        for k in range(i*4,(i+1)*4):
            data = data + b_i[k]*weight
            weight = int(weight/0x100)
        w.append(data)

    for j in range(16, 68):
        w.append(0)
        w[j] = sm3_p_1(w[j-16] ^ w[j-9] ^ (rotl(w[j-3], 15))) ^ (rotl(w[j-13], 7)) ^ w[j-6]

    w_1 = []
    for j in range(0, 64):
        w_1.append(0)
        w_1[j] = w[j] ^ w[j+4]

    a, b, c, d, e, f, g, h = v_i

    for j in range(0, 64):
        ss_1 = rotl(
            ((rotl(a, 12)) + e + (rotl(T_j[j], j % 32))) & 0xffffffff, 7
        )
        ss_2 = ss_1 ^ (rotl(a, 12))
        tt_1 = (sm3_ff_j(a, b, c, j) + d + ss_2 + w_1[j]) & 0xffffffff
        tt_2 = (sm3_gg_j(e, f, g, j) + h + ss_1 + w[j]) & 0xffffffff
        d = c
        c = rotl(b, 9)
        b = a
        a = tt_1
        h = g
        g = rotl(f, 19)
        f = e
        e = sm3_p_0(tt_2)

        a, b, c, d, e, f, g, h = map(lambda x: x & 0xFFFFFFFF, [a, b, c, d, e, f, g, h])

    v_j = [a, b, c, d, e, f, g, h]
    return [v_j[i] ^ v_i[i] for i in range(8)]

def sm3_hash(msg_bytes):
    msg = list(msg_bytes)
    len1 = len(msg)
    reserve1 = len1 % 64
    msg.append(0x80)
    reserve1 = reserve1 + 1
    
    range_end = 56
    if reserve1 > range_end:
        range_end = range_end + 64

    for i in range(reserve1, range_end):
        msg.append(0x00)

    bit_length = (len1) * 8
    bit_length_str = [bit_length % 0x100]
    for i in range(7):
        bit_length = int(bit_length / 0x100)
        bit_length_str.append(bit_length % 0x100)
    for i in range(8):
        msg.append(bit_length_str[7-i])

    group_count = round(len(msg) / 64)

    B = []
    for i in range(0, group_count):
        B.append(msg[i*64:(i+1)*64])

    V = []
    V.append(IV)
    for i in range(0, group_count):
        V.append(sm3_cf(V[i], B[i]))

    y = V[-1]
    result = ""
    for i in y:
        result = '%s%08x' % (result, i)
    return result


class ABogus:
    __filter = re.compile(r'%([0-9A-F]{2})')
    __arguments = [0, 1, 14]
    __ua_key = "\u0000\u0001\u000e"
    __end_string = "cus"
    __version = [1, 0, 1, 5]
    __browser = "1536|742|1536|864|0|0|0|0|1536|864|1536|864|1536|742|24|24|MacIntel"
    __reg = [
        1937774191,
        1226093241,
        388252375,
        3666478592,
        2842636476,
        372324522,
        3817729613,
        2969243214,
    ]
    __str = {
        "s0": "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
        "s1": "Dkdpgh4ZKsQB80/Mfvw36XI1R25+WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=",
        "s2": "Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=",
        "s3": "ckdp1h4ZKsUB80/Mfvw36XIgR25+WQAlEi7NLboqYTOPuzmFjJnryx9HVGDaStCe",
        "s4": "Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe",
    }

    def __init__(self, platform: str = None):
        self.chunk = []
        self.size = 0
        self.reg = self.__reg[:]
        self.ua_code = [
            76, 98, 15, 131, 97, 245, 224, 133, 122, 199, 241, 166, 79, 32, 90, 191,
            128, 126, 122, 98, 66, 11, 14, 40, 49, 110, 110, 173, 67, 96, 138, 252
        ]
        self.browser = self.generate_browser_info(platform) if platform else self.__browser
        self.browser_len = len(self.browser)
        self.browser_code = self.char_code_at(self.browser)

    @classmethod
    def list_1(cls, random_num=None, a=170, b=85, c=45) -> list:
        return cls.random_list(random_num, a, b, 1, 2, 5, c & a)

    @classmethod
    def list_2(cls, random_num=None, a=170, b=85) -> list:
        return cls.random_list(random_num, a, b, 1, 0, 0, 0)

    @classmethod
    def list_3(cls, random_num=None, a=170, b=85) -> list:
        return cls.random_list(random_num, a, b, 1, 0, 5, 0)

    @staticmethod
    def random_list(a: float = None, b=170, c=85, d=0, e=0, f=0, g=0) -> list:
        r = a or (random() * 10000)
        v = [r, int(r) & 255, int(r) >> 8]
        v.append(v[1] & b | d)
        v.append(v[1] & c | e)
        v.append(v[2] & b | f)
        v.append(v[2] & c | g)
        return v[-4:]

    @staticmethod
    def from_char_code(*args):
        return "".join(chr(code) for code in args)

    @classmethod
    def generate_string_1(cls, r1=None, r2=None, r3=None):
        return (
            cls.from_char_code(*cls.list_1(r1)) +
            cls.from_char_code(*cls.list_2(r2)) +
            cls.from_char_code(*cls.list_3(r3))
        )

    def generate_string_2(self, url_params: str, method="GET", start_time=0, end_time=0) -> str:
        a = self.generate_string_2_list(url_params, method, start_time, end_time)
        e = self.end_check_num(a)
        a.extend(self.browser_code)
        a.append(e)
        return self.rc4_encrypt(self.from_char_code(*a), "y")

    def generate_string_2_list(self, url_params: str, method="GET", start_time=0, end_time=0) -> list:
        start_time = start_time or int(time() * 1000)
        end_time = end_time or (start_time + randint(4, 8))
        params_array = self.generate_params_code(url_params)
        method_array = self.generate_method_code(method)
        return self.list_4(
            (end_time >> 24) & 255,
            params_array[21],
            self.ua_code[23],
            (end_time >> 16) & 255,
            params_array[22],
            self.ua_code[24],
            (end_time >> 8) & 255,
            (end_time >> 0) & 255,
            (start_time >> 24) & 255,
            (start_time >> 16) & 255,
            (start_time >> 8) & 255,
            (start_time >> 0) & 255,
            method_array[21],
            method_array[22],
            int(end_time / 256 / 256 / 256 / 256) >> 0,
            int(start_time / 256 / 256 / 256 / 256) >> 0,
            self.browser_len,
        )

    @staticmethod
    def list_4(a, b, c, d, e, f, g, h, i, j, k, m, n, o, p, q, r) -> list:
        return [
            44, a, 0, 0, 0, 0, 24, b, n, 0, c, d, 0, 0, 0, 1, 0, 239, e, o,
            f, g, 0, 0, 0, 0, h, 0, 0, 14, i, j, 0, k, m, 3, p, 1, q, 1, r, 0, 0, 0
        ]

    @staticmethod
    def end_check_num(a: list):
        r = 0
        for i in a:
            r ^= i
        return r

    @classmethod
    def decode_string(cls, url_string):
        return cls.__filter.sub(cls.replace_func, url_string)

    @staticmethod
    def replace_func(match):
        return chr(int(match.group(1), 16))

    @staticmethod
    def char_code_at(s):
        return [ord(char) for char in s]

    @classmethod
    def generate_result(cls, s, e="s4"):
        r = []
        for i in range(0, len(s), 3):
            if i + 2 < len(s):
                n = (ord(s[i]) << 16) | (ord(s[i + 1]) << 8) | ord(s[i + 2])
            elif i + 1 < len(s):
                n = (ord(s[i]) << 16) | (ord(s[i + 1]) << 8)
            else:
                n = ord(s[i]) << 16

            for j, k in zip(range(18, -1, -6), (0xFC0000, 0x03F000, 0x0FC0, 0x3F)):
                if j == 6 and i + 1 >= len(s):
                    break
                if j == 0 and i + 2 >= len(s):
                    break
                r.append(cls.__str[e][(n & k) >> j])

        r.append("=" * ((4 - len(r) % 4) % 4))
        return "".join(r)

    def generate_method_code(self, method: str = "GET") -> list[int]:
        return self.sm3_to_array(self.sm3_to_array(method + self.__end_string))

    def generate_params_code(self, params: str) -> list[int]:
        return self.sm3_to_array(self.sm3_to_array(params + self.__end_string))

    @classmethod
    def sm3_to_array(cls, data: str | list) -> list[int]:
        if isinstance(data, str):
            b = data.encode("utf-8")
        else:
            b = bytes(data)
        h = sm3_hash(b)
        return [int(h[i: i + 2], 16) for i in range(0, len(h), 2)]

    @classmethod
    def generate_browser_info(cls, platform: str = "Win32") -> str:
        inner_width = randint(1280, 1920)
        inner_height = randint(720, 1080)
        outer_width = randint(inner_width, 1920)
        outer_height = randint(inner_height, 1080)
        screen_x = 0
        screen_y = choice((0, 30))
        value_list = [
            inner_width, inner_height, outer_width, outer_height,
            screen_x, screen_y, 0, 0, outer_width, outer_height,
            outer_width, outer_height, inner_width, inner_height,
            24, 24, platform,
        ]
        return "|".join(str(i) for i in value_list)

    @staticmethod
    def rc4_encrypt(plaintext, key):
        s = list(range(256))
        j = 0
        for i in range(256):
            j = (j + s[i] + ord(key[i % len(key)])) % 256
            s[i], s[j] = s[j], s[i]

        i = 0
        j = 0
        cipher = []
        for k in range(len(plaintext)):
            i = (i + 1) % 256
            j = (j + s[i]) % 256
            s[i], s[j] = s[j], s[i]
            t = (s[i] + s[j]) % 256
            cipher.append(chr(s[t] ^ ord(plaintext[k])))
        return ''.join(cipher)

    def get_value(self, url_params: dict | str, method="GET", start_time=0, end_time=0) -> str:
        string_1 = self.generate_string_1()
        string_2 = self.generate_string_2(
            urllib.parse.urlencode(url_params) if isinstance(url_params, dict) else url_params,
            method, start_time, end_time
        )
        return self.generate_result(string_1 + string_2, "s4")


# --- UTILITIES ---

def clean_html(raw_html):
    if not raw_html:
        return ""
    text = re.sub(r'<br\s*/?>', '\n', raw_html, flags=re.IGNORECASE)
    text = re.sub(r'</p>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace('&nbsp;', ' ').replace('&lt;', '<').replace('&gt;', '>')\
               .replace('&amp;', '&').replace('&quot;', '"')
    return text.strip()

def get_proxy_image_url(original_url):
    if not original_url:
        return ""
    url_no_proto = re.sub(r'^https?://', '', original_url)
    return f"https://i3.wp.com/{url_no_proto}"

def get_douyin_proxy_url(original_url):
    if not original_url:
        return ""
    return f"https://wsrv.nl/?url={urllib.parse.quote(original_url)}"

def format_html_template(template_str, **kwargs):
    # Collapse all layout/formatting spaces and newlines
    cleaned = template_str.replace('\n', ' ')
    cleaned = re.sub(r'\s+', ' ', cleaned)
    cleaned = re.sub(r'>\s+<', '><', cleaned)
    return cleaned.strip().format(**kwargs)

def format_weibo_time(time_str):
    try:
        dt = datetime.strptime(time_str, "%a %b %d %H:%M:%S %z %Y")
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return time_str

def extract_time_only(time_str):
    if not time_str:
        return ""
    match = re.search(r'\b(\d{1,2}):(\d{2})\b', time_str)
    if match:
        return f"{int(match.group(1)):02d}:{match.group(2)}"
    return time_str

def build_wxpusher_summary(platform, name, time_str, content):
    time_only = extract_time_only(time_str)
    content_clean = clean_html(content)
    content_clean = " ".join(content_clean.split())
    preview_len = 45
    if len(content_clean) > preview_len:
        preview = content_clean[:preview_len] + "..."
    else:
        preview = content_clean
    if time_only:
        return f"【{platform}】{name} ⏰{time_only}\n{preview}"
    return f"【{platform}】{name}\n{preview}"

def get_ttwid():
    url = "https://ttwid.bytedance.com/ttwid/union/register/"
    payload = {
        "region": "cn",
        "aid": 1768,
        "needFid": False,
        "service": "www.douyin.com",
        "migrate_info": {"ticket": "", "source": "node"},
        "cbUrlProtocol": "https",
        "union": True
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            headers = res.info()
            cookie_headers = headers.get_all('Set-Cookie', [])
            for cookie in cookie_headers:
                if 'ttwid=' in cookie:
                    return cookie.split('ttwid=')[1].split(';')[0]
    except Exception as e:
        print("Failed to get ttwid:", e)
    return None

def send_wxpusher(title, html_body, url=None, summary=None):
    push_url = "https://wxpusher.zjiecode.com/api/send/message"
    payload = {
        "appToken": WXPUSHER_APP_TOKEN,
        "content": html_body.strip(),
        "summary": summary or title,  # list preview text, falls back to title
        "contentType": 2, # HTML format
        "uids": [WXPUSHER_UID]
    }
    
    req = urllib.request.Request(
        push_url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            res = json.loads(response.read().decode('utf-8'))
            return res
    except Exception as e:
        print(f"WxPusher push failed: {e}")
        return None

def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {"weibo_seen": [], "bilibili_seen": [], "weibo_seen_by_uid": {}, "douyin_seen_by_uid": {}}

def save_state(state):
    try:
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Failed to save state file: {e}")


def push_slideshow_images_to_cf(images):
    url = "https://loc.tcrrry.com/api/slideshow-images"
    payload = {
        "token": "YOUR_PUSH_TOKEN",  # Must match the token in your worker.js
        "images": images
    }
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers=headers
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            res = json.loads(response.read().decode('utf-8'))
            print(f"Pushed slideshow images to Cloudflare: {res}")
            return res
    except Exception as e:
        print(f"Failed to push slideshow images to Cloudflare: {e}")
        return None


# --- SCRAPERS ---

def scrape_weibo(state):
    print("Scraping Weibo...")
    
    # Initialize slideshow pool
    slideshow_images = state.get("slideshow_images", [])
    if not slideshow_images:
        slideshow_images = [
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
        ]
        state["slideshow_images"] = slideshow_images

    collected_verticals = []
    if "weibo_seen_by_uid" not in state:
        state["weibo_seen_by_uid"] = {}
        # Migrate old flat seen list if present
        if "weibo_seen" in state:
            state["weibo_seen_by_uid"]["5043186742"] = state["weibo_seen"]

    for account in WEIBO_ACCOUNTS:
        uid = account["uid"]
        name = account["name"]
        print(f"Scraping Weibo account: {name} ({uid})...")
        
        if uid not in state["weibo_seen_by_uid"]:
            state["weibo_seen_by_uid"][uid] = []
            
        url = f"https://m.weibo.cn/api/container/getIndex?type=uid&value={uid}&containerid=107603{uid}"
        headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"
        }
        if WEIBO_COOKIE:
            headers["Cookie"] = WEIBO_COOKIE
            
        req = urllib.request.Request(url, headers=headers)
        
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))
        except Exception as e:
            print(f"Weibo request failed for {name}: {e}")
            continue

        if not data.get('ok') or 'data' not in data or 'cards' not in data['data']:
            print(f"Weibo response structure invalid or login verification required for {name}.")
            continue

        cards = [c for c in data['data']['cards'] if c.get('card_type') == 9 and c.get('mblog')]
        if not cards:
            print(f"No Weibo cards found for {name}.")
            continue

        # Collect vertical photos for slideshow from target accounts (黄霄雲, 好想吃面包蛋糕芝士)
        if uid in ["5043186742", "5638314984"]:
            for card in cards:
                mblog = card.get('mblog', {})
                pics = mblog.get('pics') or []
                retweeted = mblog.get('retweeted_status')
                if retweeted and not pics:
                    pics = retweeted.get('pics') or []
                
                for pic in pics:
                    large_geo = pic.get('large', {}).get('geo', {})
                    geo = pic.get('geo', {})
                    
                    w = int(large_geo.get('width') or geo.get('width') or 0)
                    h = int(large_geo.get('height') or geo.get('height') or 0)
                    
                    if w > 0 and h / w >= 1.25:
                        large_url = pic.get('large', {}).get('url', pic.get('url'))
                        if large_url:
                            # Replace size to get original resolution
                            large_url = large_url.replace("/orj360/", "/large/").replace("/orj480/", "/large/").replace("/bmiddle/", "/large/").replace("/thumb150/", "/large/")
                            original_url = large_url.replace("/large/", "/original/")
                            
                            clean_url = re.sub(r'^https?://', '', original_url)
                            photon_url = f"https://i3.wp.com/{clean_url}"
                            collected_verticals.append(photon_url)

        # If seen list for this uid is empty, initialize it with current cards and skip pushing
        if not state["weibo_seen_by_uid"][uid]:
            state["weibo_seen_by_uid"][uid] = [c['mblog']['id'] for c in cards[:5]]
            print(f"Initialized Weibo seen list for {name}.")
            continue

        new_posts = []
        for card in cards:
            mblog = card['mblog']
            post_id = mblog['id']
            if post_id not in state["weibo_seen_by_uid"][uid]:
                new_posts.append(mblog)

        for mblog in reversed(new_posts):
            try:
                post_id = mblog['id']
                bid = mblog.get('bid', '')
                raw_text = mblog.get('text', '')
                text = clean_html(raw_text)
                created_at = format_weibo_time(mblog.get('created_at', ''))
                
                likes = mblog.get('attitudes_count', 0)
                comments = mblog.get('comments_count', 0)
                reposts = mblog.get('reposts_count', 0)
                post_url = f"https://weibo.com/{uid}/{bid}"
                
                # Format Images
                images_html = ""
                pics = mblog.get('pics', [])
                if pics:
                    img_tags = ""
                    for pic in pics:
                        large_url = pic.get('large', {}).get('url', pic.get('url'))
                        if large_url:
                            proxy_url = get_proxy_image_url(large_url)
                            img_tags += f'<img referrerpolicy="no-referrer" src="{proxy_url}" style="max-width: 100%; border-radius: 8px; margin-bottom: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.06); border: 1px solid #eee;" />'
                    images_html = f'<div style="margin-top: 10px; margin-bottom: 12px; text-align: center;">{img_tags}</div>'
                else:
                    # Check for video cover via page_info (for Weibo video posts)
                    page_info = mblog.get('page_info') or {}
                    if page_info.get('type') == 'video':
                        cover_img = (page_info.get('page_pic') or {}).get('url', '')
                        if cover_img:
                            proxy_cover = get_proxy_image_url(cover_img)
                            wb_video_tpl = """
                            <div style="margin-top: 10px; margin-bottom: 12px; text-align: center; position: relative;">
                                <img referrerpolicy="no-referrer" src="{cover_url}" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.06); border: 1px solid #eee;" />
                                <span style="position: absolute; bottom: 8px; right: 12px; background: rgba(0,0,0,0.65); color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px;">▶ 视频</span>
                            </div>
                            """
                            images_html = format_html_template(wb_video_tpl, cover_url=proxy_cover)
                
                # Format Retweet (if any)
                retweet_html = ""
                retweeted = mblog.get('retweeted_status')
                if retweeted:
                    retweet_user = retweeted.get('user', {}).get('screen_name', '原作者')
                    retweet_text = clean_html(retweeted.get('text', ''))
                    retweet_pics_html = ""
                    retweet_pics = retweeted.get('pics', [])
                    if retweet_pics:
                        r_img_tags = ""
                        for r_pic in retweet_pics:
                            r_large_url = r_pic.get('large', {}).get('url', r_pic.get('url'))
                            if r_large_url:
                                r_proxy_url = get_proxy_image_url(r_large_url)
                                r_img_tags += f'<img referrerpolicy="no-referrer" src="{r_proxy_url}" style="max-width: 90%; border-radius: 6px; margin-bottom: 6px; border: 1px solid #ddd;" />'
                        retweet_pics_html = f'<div style="margin-top: 8px; text-align: center;">{r_img_tags}</div>'
                    
                    retweet_html_tpl = """
                    <div style="background-color: #f5f7fa; border-left: 3px solid #cbd5e1; padding: 10px; border-radius: 4px; margin-top: 10px; margin-bottom: 10px; font-size: 13.5px; color: #475569;">
                        <strong style="color: #334155;">@{retweet_user}:</strong> {retweet_text}
                        {retweet_pics_html}
                    </div>
                    """
                    retweet_html = format_html_template(retweet_html_tpl, retweet_user=retweet_user, retweet_text=retweet_text, retweet_pics_html=retweet_pics_html)
                
                # Build beautiful HTML payload
                weibo_tpl = """
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; background-color: #fcfdfe; padding: 16px; border-radius: 14px; border: 1px solid #eef1f6; box-shadow: 0 4px 15px rgba(0,0,0,0.04); max-width: 580px; margin: 0 auto;">
                    
                    <!-- Platform Header -->
                    <div style="background-color: #fff4ee; border-radius: 10px; padding: 10px 14px; margin-bottom: 16px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                            <div style="display: flex; align-items: center;">
                                <span style="background: linear-gradient(135deg, #ff8200, #ff5000); color: #fff; font-size: 11px; font-weight: bold; padding: 3px 9px; border-radius: 20px; margin-right: 8px;">微博</span>
                                <span style="color: #1e293b; font-weight: bold; font-size: 15px;">{name}</span>
                            </div>
                            <span style="color: #94a3b8; font-size: 12px;">⏰ {created_at}</span>
                        </div>
                    </div>
                    
                    <!-- Post Text -->
                    <div style="font-size: 15px; line-height: 1.6; color: #334155; white-space: pre-wrap; margin-bottom: 12px;">{text}</div>
                    
                    <!-- Retweet Status -->
                    {retweet_html}
                    
                    <!-- Images -->
                    {images_html}
                    
                    <!-- Interactions -->
                    <div style="display: flex; align-items: center; justify-content: space-around; background-color: #f8fafc; border-radius: 10px; padding: 8px 12px; margin-bottom: 18px; font-size: 13px; color: #64748b; border: 1px solid #f1f5f9;">
                        <div>🔁 <span style="font-weight: bold; color: #475569;">{reposts}</span> 转发</div>
                        <div style="color: #e2e8f0;">|</div>
                        <div>💬 <span style="font-weight: bold; color: #475569;">{comments}</span> 评论</div>
                        <div style="color: #e2e8f0;">|</div>
                        <div>👍 <span style="font-weight: bold; color: #475569;">{likes}</span> 点赞</div>
                    </div>
                    
                    <!-- Link Button -->
                    <div style="text-align: center; margin-top: 10px;">
                        <a href="{post_url}" style="display: inline-block; background: linear-gradient(135deg, #ff8200, #ff6200); color: #fff; text-decoration: none; font-weight: bold; font-size: 14px; padding: 10px 26px; border-radius: 30px; box-shadow: 0 4px 10px rgba(255, 130, 0, 0.25);">
                            👉 点击打开微博原文
                        </a>
                    </div>
                </div>
                """
                html_body = format_html_template(
                    weibo_tpl,
                    name=name,
                    created_at=created_at,
                    text=text,
                    retweet_html=retweet_html,
                    images_html=images_html,
                    reposts=reposts,
                    comments=comments,
                    likes=likes,
                    post_url=post_url
                )
                
                print(f"New Weibo post found for {name}: {post_id}")
                summary_text = build_wxpusher_summary("微博", name, created_at, text)
                send_wxpusher(f"{name} 微博更新了！", html_body, post_url, summary=summary_text)
                state["weibo_seen_by_uid"][uid].append(post_id)
            except Exception as ex:
                print(f"Error processing Weibo post for {name}: {ex}")
        
        state["weibo_seen_by_uid"][uid] = state["weibo_seen_by_uid"][uid][-20:]

    if collected_verticals:
        # Prepend new images and deduplicate
        combined = []
        seen = set()
        for img in collected_verticals + slideshow_images:
            if img not in seen:
                seen.add(img)
                combined.append(img)
        
        updated_slideshow = combined[:100]
        if updated_slideshow != slideshow_images:
            state["slideshow_images"] = updated_slideshow
            print(f"Slideshow pool changed! New count: {len(updated_slideshow)}")
            push_slideshow_images_to_cf(updated_slideshow)

def scrape_bilibili(state):
    print("Scraping Bilibili...")
    url = f"https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid={BILI_UID}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": f"https://space.bilibili.com/{BILI_UID}"
    }
    if BILI_COOKIE:
        headers["Cookie"] = BILI_COOKIE
        
    req = urllib.request.Request(url, headers=headers)
    
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Bilibili request failed: {e}")
        return

    if data.get('code') != 0 or 'data' not in data or 'items' not in data['data']:
        print(f"Bilibili API error: code={data.get('code')}, message={data.get('message')}")
        return

    items = data['data']['items']
    if not items:
        print("No Bilibili items found.")
        return

    if "bilibili_seen" not in state or not state["bilibili_seen"]:
        state["bilibili_seen"] = [item['id_str'] for item in items[:5]]
        print("Initialized Bilibili seen list with current items.")
        return

    new_items = []
    for item in items:
        item_id = item['id_str']
        if item_id not in state["bilibili_seen"]:
            new_items.append(item)

    for item in reversed(new_items):
        try:
            item_id = item['id_str']
            dynamic_type = item.get('type')
            modules = item.get('modules', {})
            
            module_author = modules.get('module_author', {})
            pub_time = module_author.get('pub_time', '')
            
            module_dynamic = modules.get('module_dynamic', {})
            text = ""
            if module_dynamic and 'desc' in module_dynamic and module_dynamic['desc']:
                text = module_dynamic['desc'].get('text', '')
            
            module_stat = modules.get('module_stat', {})
            likes = module_stat.get('like', {}).get('count', 0)
            comments = module_stat.get('comment', {}).get('count', 0)
            reposts = module_stat.get('forward', {}).get('count', 0)
            
            title = "黄霄雲 B站发新动态了！"
            post_url = f"https://t.bilibili.com/{item_id}"
            
            # Format media / content based on dynamic type
            media_html = ""
            
            if dynamic_type == "DYNAMIC_TYPE_AV" and module_dynamic.get('major') and module_dynamic['major'].get('archive'):
                archive = module_dynamic['major']['archive']
                title = "黄霄雲 B站投稿视频了！"
                text = f"《{archive.get('title')}》\n\n简介: {archive.get('desc', '无')}"
                post_url = f"https://www.bilibili.com/video/{archive.get('bvid')}"
                cover = archive.get('cover')
                if cover:
                    proxy_cover = get_proxy_image_url(cover)
                    av_media_tpl = """
                    <div style="margin-top: 10px; margin-bottom: 12px; text-align: center; position: relative;">
                        <img referrerpolicy="no-referrer" src="{cover_url}" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.06); border: 1px solid #eee;" />
                        <span style="position: absolute; bottom: 8px; right: 12px; background: rgba(0,0,0,0.6); color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 11px;">视频</span>
                    </div>
                    """
                    media_html = format_html_template(av_media_tpl, cover_url=proxy_cover)
            elif dynamic_type == "DYNAMIC_TYPE_DRAW" and module_dynamic.get('major') and module_dynamic['major'].get('draw'):
                draw_items = module_dynamic['major']['draw'].get('items', [])
                if draw_items:
                    img_tags = ""
                    for draw_item in draw_items:
                        img_src = draw_item.get('src')
                        if img_src:
                            proxy_img_src = get_proxy_image_url(img_src)
                            img_tags += f'<img referrerpolicy="no-referrer" src="{proxy_img_src}" style="max-width: 100%; border-radius: 8px; margin-bottom: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.06); border: 1px solid #eee;" />'
                    media_html = f'<div style="margin-top: 10px; margin-bottom: 12px; text-align: center;">{img_tags}</div>'
            
            # Build Bilibili dynamic card HTML
            bili_tpl = """
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; background-color: #fcfdfe; padding: 16px; border-radius: 14px; border: 1px solid #eef1f6; box-shadow: 0 4px 15px rgba(0,0,0,0.04); max-width: 580px; margin: 0 auto;">
                
                <!-- Platform Header -->
                <div style="background-color: #fff0f6; border-radius: 10px; padding: 10px 14px; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                        <div style="display: flex; align-items: center;">
                            <span style="background: linear-gradient(135deg, #fb7299, #fc9bba); color: #fff; font-size: 11px; font-weight: bold; padding: 3px 9px; border-radius: 20px; margin-right: 8px;">B站</span>
                            <span style="color: #1e293b; font-weight: bold; font-size: 15px;">黄霄雲</span>
                        </div>
                        <span style="color: #94a3b8; font-size: 12px;">⏰ {pub_time}</span>
                    </div>
                </div>
                
                <!-- Post Text -->
                <div style="font-size: 15px; line-height: 1.6; color: #334155; white-space: pre-wrap; margin-bottom: 12px;">{text}</div>
                
                <!-- Media / Video cover / Draw images -->
                {media_html}
                
                <!-- Interactions -->
                <div style="display: flex; align-items: center; justify-content: space-around; background-color: #f8fafc; border-radius: 10px; padding: 8px 12px; margin-bottom: 18px; font-size: 13px; color: #64748b; border: 1px solid #f1f5f9;">
                    <div>🔁 <span style="font-weight: bold; color: #475569;">{reposts}</span> 转发</div>
                    <div style="color: #e2e8f0;">|</div>
                    <div>💬 <span style="font-weight: bold; color: #475569;">{comments}</span> 评论</div>
                    <div style="color: #e2e8f0;">|</div>
                    <div>👍 <span style="font-weight: bold; color: #475569;">{likes}</span> 点赞</div>
                </div>
                
                <!-- Link Button -->
                <div style="text-align: center; margin-top: 10px;">
                    <a href="{post_url}" style="display: inline-block; background: linear-gradient(135deg, #fb7299, #fb5584); color: #fff; text-decoration: none; font-weight: bold; font-size: 14px; padding: 10px 26px; border-radius: 30px; box-shadow: 0 4px 10px rgba(251, 114, 153, 0.25);">
                        👉 点击查看B站原文
                    </a>
                </div>
            </div>
            """
            html_body = format_html_template(
                bili_tpl,
                pub_time=pub_time,
                text=text,
                media_html=media_html,
                reposts=reposts,
                comments=comments,
                likes=likes,
                post_url=post_url
            )
            
            print(f"New Bilibili item found: {item_id}")
            summary_text = build_wxpusher_summary("B站", "黄霄雲", pub_time, text)
            send_wxpusher(title, html_body, post_url, summary=summary_text)
            state["bilibili_seen"].append(item_id)
        except Exception as ex:
            print(f"Error processing Bilibili item: {ex}")
        
    state["bilibili_seen"] = state["bilibili_seen"][-20:]

def scrape_douyin(state):
    print("Scraping Douyin...")
    if "douyin_seen_by_uid" not in state:
        state["douyin_seen_by_uid"] = {}
        
    for account in DOUYIN_ACCOUNTS:
        sec_uid = account["sec_uid"]
        name = account["name"]
        print(f"Scraping Douyin account: {name} ({sec_uid})...")
        
        if sec_uid not in state["douyin_seen_by_uid"]:
            state["douyin_seen_by_uid"][sec_uid] = []
            
        ttwid = get_ttwid()
        if not ttwid:
            print(f"Failed to get ttwid cookie for {name}. Skipping...")
            continue
            
        bogus = ABogus()
        api_url = "https://www.douyin.com/aweme/v1/web/aweme/post/"
        params = {
            "device_platform": "webapp",
            "aid": "6383",
            "channel": "channel_pc_web",
            "sec_user_id": sec_uid,
            "count": "10",
            "max_cursor": "0",
            "publish_video_strategy_type": "2",
            "show_live_replay_strategy": "1",
            "need_time_list": "1",
            "cookie_enabled": "true",
            "pc_client_type": "1"
        }
        
        a_bogus = bogus.get_value(params)
        params["a_bogus"] = a_bogus
        
        query_str = urllib.parse.urlencode(params)
        full_url = f"{api_url}?{query_str}"
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36",
            "Referer": f"https://www.douyin.com/user/{sec_uid}",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Cookie": f"ttwid={ttwid}"
        }
        
        req = urllib.request.Request(full_url, headers=headers)
        
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                body = response.read().decode('utf-8')
                if not body:
                    print(f"Empty response for Douyin account {name}.")
                    continue
                data = json.loads(body)
        except Exception as e:
            print(f"Douyin request failed for {name}: {e}")
            continue
            
        aweme_list = data.get("aweme_list", [])
        if not aweme_list:
            print(f"No Douyin posts found for {name}.")
            continue
            
        if not state["douyin_seen_by_uid"][sec_uid]:
            state["douyin_seen_by_uid"][sec_uid] = [item['aweme_id'] for item in aweme_list[:5]]
            print(f"Initialized Douyin seen list for {name}.")
            continue
            
        new_posts = []
        for item in aweme_list:
            post_id = item['aweme_id']
            if post_id not in state["douyin_seen_by_uid"][sec_uid]:
                new_posts.append(item)
                
        for item in reversed(new_posts):
            try:
                post_id = item['aweme_id']
                desc = item.get("desc", "")
                create_time_ts = item.get("create_time", 0)
                created_at = datetime.fromtimestamp(create_time_ts).strftime("%Y-%m-%d %H:%M:%S")
                
                stats = item.get("statistics", {})
                likes = stats.get("digg_count", 0)
                comments = stats.get("comment_count", 0)
                shares = stats.get("share_count", 0)
                
                # Check if slide (images) or a video
                images = item.get("images")
                media_html = ""
                post_url = f"https://www.douyin.com/video/{post_id}"
                
                if images:
                    post_url = f"https://www.douyin.com/note/{post_id}"
                    img_tags = ""
                    for img_obj in images[:9]:
                        url_list = img_obj.get("display_image", {}).get("url_list", [])
                        if url_list:
                            proxy_url = get_douyin_proxy_url(url_list[0])
                            img_tags += f'<img referrerpolicy="no-referrer" src="{proxy_url}" style="max-width: 100%; border-radius: 8px; margin-bottom: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.06); border: 1px solid #eee;" />'
                    media_html = f'<div style="margin-top: 10px; margin-bottom: 12px; text-align: center;">{img_tags}</div>'
                else:
                    video = item.get("video", {})
                    cover_url_list = video.get("cover", {}).get("url_list", [])
                    if cover_url_list:
                        proxy_cover = get_douyin_proxy_url(cover_url_list[0])
                        dy_cover_tpl = """
                        <div style="margin-top: 10px; margin-bottom: 12px; text-align: center; position: relative;">
                            <img referrerpolicy="no-referrer" src="{cover_url}" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.06); border: 1px solid #eee;" />
                            <span style="position: absolute; bottom: 8px; right: 12px; background: rgba(0,0,0,0.6); color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 11px;">视频封面</span>
                        </div>
                        """
                        media_html = format_html_template(dy_cover_tpl, cover_url=proxy_cover)
                        
                # Build HTML template for Douyin
                douyin_tpl = """
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; background-color: #fcfdfe; padding: 16px; border-radius: 14px; border: 1px solid #eef1f6; box-shadow: 0 4px 15px rgba(0,0,0,0.04); max-width: 580px; margin: 0 auto;">
                    
                    <!-- Platform Header -->
                    <div style="background-color: #f2f3f7; border-radius: 10px; padding: 10px 14px; margin-bottom: 16px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                            <div style="display: flex; align-items: center;">
                                <span style="background: linear-gradient(135deg, #161823, #2f344d); color: #fff; font-size: 11px; font-weight: bold; padding: 3px 9px; border-radius: 20px; margin-right: 8px;">抖音</span>
                                <span style="color: #1e293b; font-weight: bold; font-size: 15px;">{name}</span>
                            </div>
                            <span style="color: #94a3b8; font-size: 12px;">⏰ {created_at}</span>
                        </div>
                    </div>
                    
                    <!-- Post Text -->
                    <div style="font-size: 15px; line-height: 1.6; color: #334155; white-space: pre-wrap; margin-bottom: 12px;">{desc}</div>
                    
                    <!-- Media Cover / Images -->
                    {media_html}
                    
                    <!-- Interactions -->
                    <div style="display: flex; align-items: center; justify-content: space-around; background-color: #f8fafc; border-radius: 10px; padding: 8px 12px; margin-bottom: 18px; font-size: 13px; color: #64748b; border: 1px solid #f1f5f9;">
                        <div>🔁 <span style="font-weight: bold; color: #475569;">{shares}</span> 分享</div>
                        <div style="color: #e2e8f0;">|</div>
                        <div>💬 <span style="font-weight: bold; color: #475569;">{comments}</span> 评论</div>
                        <div style="color: #e2e8f0;">|</div>
                        <div>👍 <span style="font-weight: bold; color: #475569;">{likes}</span> 点赞</div>
                    </div>
                    
                    <!-- Link Button -->
                    <div style="text-align: center; margin-top: 10px;">
                        <a href="{post_url}" style="display: inline-block; background: linear-gradient(135deg, #161823, #333); color: #fff; text-decoration: none; font-weight: bold; font-size: 14px; padding: 10px 26px; border-radius: 30px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);">
                            👉 点击打开抖音观看
                        </a>
                    </div>
                </div>
                """
                html_body = format_html_template(
                    douyin_tpl,
                    name=name,
                    created_at=created_at,
                    desc=desc,
                    media_html=media_html,
                    shares=shares,
                    comments=comments,
                    likes=likes,
                    post_url=post_url
                )
                
                print(f"New Douyin post found for {name}: {post_id}")
                summary_text = build_wxpusher_summary("抖音", name, created_at, desc)
                send_wxpusher(f"{name} 抖音更新了！", html_body, post_url, summary=summary_text)
                state["douyin_seen_by_uid"][sec_uid].append(post_id)
            except Exception as ex:
                print(f"Error processing Douyin post for {name}: {ex}")
                
        state["douyin_seen_by_uid"][sec_uid] = state["douyin_seen_by_uid"][sec_uid][-20:]


# --- MAIN ---

def main():
    state = load_state()
    try:
        scrape_weibo(state)
    except Exception as e:
        print(f"Error scraping Weibo: {e}")
    try:
        scrape_bilibili(state)
    except Exception as e:
        print(f"Error scraping Bilibili: {e}")
    try:
        scrape_douyin(state)
    except Exception as e:
        print(f"Error scraping Douyin: {e}")
    save_state(state)

if __name__ == '__main__':
    main()
