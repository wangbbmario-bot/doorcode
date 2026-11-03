#!/usr/bin/env python3
"""
素材索引 + 缩略图生成

输入:  材料文件/  (门面类型 / 门头类型 / 门柱类型 / 锁类型 / 压花类型 / 颜色类型)
输出:  public/assets/<分类>/<缩略图.webp>  + public/assets/<分类>/<预览.jpg>
       public/catalog.json

缩略图用于选择网格，预览图用于实时合成与 AI 生图参考。
"""
import hashlib, json, math, os, shutil, sys, re
from concurrent.futures import ProcessPoolExecutor
from PIL import Image, ImageChops

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)


def _default_src():
    """材料目录优先级：命令行参数 > 项目内 .materials > 原材料包路径"""
    local = os.path.join(_ROOT, '.materials', '材料文件')
    if os.path.isdir(local):
        return local
    return '/Users/qi/Desktop/doordocument/材料文件'


SRC = sys.argv[1] if len(sys.argv) > 1 else _default_src()
DST = '/Users/qi/Desktop/doorcode/public/assets'

CATEGORIES = {
    '门面类型': ('face', '门面'),
    '门头类型': ('head', '门头'),
    '门柱类型': ('pillar', '门柱'),
    '锁类型': ('lock', '门锁'),
    '压花类型': ('emboss', '压花'),
    '颜色类型': ('color', '颜色'),
}

# 元素相对门框的定位常数（由六扇门 / 八扇门交叉标定验证）
REL = {
    'head':   {'x0': 0.042, 'x1': 0.893, 'y0': 0.135, 'y1': 0.215},
    'pillar': {'x0': 0.030, 'x1': 0.076, 'y0': 0.260, 'y1': 0.930},
    'lock':   {'y0': 0.530, 'y1': 0.710},
    'lockW':  0.025,
    'lockGap': 0.015,
}

THUMB_MAX = 220
PREVIEW_MAX = 760

# 缩略图展示策略（BUG: 各类素材形状差异大，统一方框看不清）
#   ratio  = 缩略图框的宽高比，None = 保持原始比例（完整显示）
#   cover  = 裁切填满指定比例（看局部，会丢内容）
#   pad    = 等比缩放后居中贴进指定比例的画布（内容完整，边上留白）
#   contain= 不裁不补，保持原始比例（看全貌）
#   trim   = 先裁掉原图四周白边，避免大片留白把主体压小
#   maxH   = 前端格子的高度上限（相对格宽的倍数），防止极端比例撑爆一屏
THUMB_PLAN = {
    'face':   {'ratio': 1.0,  'mode': 'cover',  'maxH': 1},
    'color':  {'ratio': 1.0,  'mode': 'cover',  'maxH': 1},
    'head':   {'ratio': 4.0,  'mode': 'cover',  'maxH': 1},
    # 门柱：原件是 1:10 的细长柱，裁成方块只能看到顶部一个角（花纹全看不见）。
    # 改成 1:4 的窄高框 + 居中裁 -> 柱身满宽，雕花/文字清晰可辨
    'pillar': {'ratio': 0.25, 'mode': 'cover', 'trim': True, 'maxH': 4},
    # 门锁：单个完整产品（拉手），上下裁会切掉握柄和装饰头 -> 1:2.4 框完整贴入
    'lock':   {'ratio': 0.42, 'mode': 'pad',   'trim': True, 'maxH': 3},
    # 压花：1324 项各种形状都有，各自保持原比例；格子高度封顶 2.5 倍格宽
    # trim：15.5% 的压花是带白边的电商产品图，不去白边缩略图顶部会有一条白带
    'emboss': {'ratio': None, 'mode': 'contain', 'trim': True, 'maxH': 2.5},
}


def slug(name: str) -> str:
    """文件名 -> URL 安全 slug（保留中文，去掉特殊字符）"""
    stem = os.path.splitext(name)[0]
    stem = re.sub(r'[\\/:*?"<>|\s]+', '_', stem)
    stem = re.sub(r'_+', '_', stem).strip('_')
    return stem


def white_to_alpha(im: Image.Image) -> Image.Image:
    """白底素材 -> 透明通道（门头/门柱/门锁需要叠加到门上）"""
    rgba = im.convert('RGBA')
    px = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            # 用亮度做 alpha，白 -> 全透明
            a = 255 - int(min(r, g, b) * 1.0)
            if a <= 6:
                px[x, y] = (r, g, b, 0)
            else:
                px[x, y] = (r, g, b, min(255, a))
    return rgba


def strip_light_border(im, thresh=225, dark=200, guard=0.15):
    """从四边向内切掉**连续的浅色带**（电商产品图的白边）。

    判定用「行/列的平均亮度」而不是「浅色像素占比」：
    很多素材的白边是白->灰的渐变（255 渐变到 234），
    按像素占比判定会卡在渐变中间一行，导致整条白边都切不掉。

    保护：某行/列里「明显是内容」的像素超过 guard 比例就停止切，
    避免把拉手浅色高光、浮雕边缘这类真实内容当成白边切掉。

    只切边缘连续带，中间的浅色内容不动。
    """
    w, h = im.size
    if w < 8 or h < 8:
        return im
    g = im.convert('L')
    # BOX 降采样 -> 每行/每列的平均亮度
    rd = list(g.resize((1, h), Image.BOX).getdata())
    cd = list(g.resize((w, 1), Image.BOX).getdata())
    # 深色掩码：明显是内容的像素
    dark_mask = im.convert('L').point(lambda p: 255 if p < dark else 0)
    rdark = list(dark_mask.resize((1, h), Image.BOX).getdata())
    cdark = list(dark_mask.resize((w, 1), Image.BOX).getdata())

    def ok(avg, dk, limit):
        return avg >= thresh and dk < guard * limit

    top = 0
    while top < h and ok(rd[top], rdark[top], 255):
        top += 1
    bot = h
    while bot > top and ok(rd[bot - 1], rdark[bot - 1], 255):
        bot -= 1
    left = 0
    while left < w and ok(cd[left], cdark[left], 255):
        left += 1
    right = w
    while right > left and ok(cd[right - 1], cdark[right - 1], 255):
        right -= 1
    if top == 0 and bot == h and left == 0 and right == w:
        return im
    # 防护：剥太狠（内容几乎没了）就放弃，保留原图
    if (right - left) < 8 or (bot - top) < 8:
        return im
    if (right - left) * (bot - top) < 0.02 * w * h:
        return im
    return im.crop((left, top, right, bot))


def trim_white(im, thr=245):
    """裁掉白底产品图四周的白边，让主体在缩略图里更大"""
    bg = Image.new('RGB', im.size, (255, 255, 255))
    diff = ImageChops.difference(im, bg).convert('L')
    mask = diff.point(lambda p: 255 if p > (255 - thr) else 0)
    bbox = mask.getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    if (x1 - x0) < 4 or (y1 - y0) < 4:
        return im
    return im.crop(bbox)


def process(cat_dir: str, out_dir: str, files: list, transparent: bool = False, ck: str = ''):
    out = []
    for fn in files:
        src_path = os.path.join(cat_dir, fn)
        try:
            im = Image.open(src_path)
            im = im.convert('RGB')
        except Exception as e:
            print(f'  !! {fn}: {e}', file=sys.stderr)
            continue

        s = slug(fn)
        tw, th = im.size
        src_ratio = tw / th if th else 1

        # 缩略图：按分类策略裁切/完整显示
        plan = THUMB_PLAN.get(ck, {'ratio': 1.0, 'mode': 'cover'})
        # trim 的分类要留一份原图给预览图用（预览图不能 trim，否则贴到门上比例会变）
        orig = im.copy() if plan.get('trim') else im
        if plan.get('trim'):
            im = trim_white(im)
            im = strip_light_border(im)
        cw0, ch0 = im.size
        ratio = plan['ratio']
        if ratio is None or plan['mode'] == 'contain':
            # 保持原始比例：缩到 THUMB_MAX 的最长边，完整可见
            t = im.copy()
            t.thumbnail((THUMB_MAX, THUMB_MAX), Image.LANCZOS)
            out_ratio = t.width / t.height
        elif plan['mode'] == 'pad':
            # 等比缩放后居中贴进目标比例的画布：内容完整，边上留白
            target = ratio
            box_w = THUMB_MAX
            box_h = int(round(THUMB_MAX / target))
            scale = min(box_w / cw0, box_h / ch0)
            nw = max(1, int(round(cw0 * scale)))
            nh = max(1, int(round(ch0 * scale)))
            content = im.resize((nw, nh), Image.LANCZOS)
            canvas = Image.new('RGB', (box_w, box_h), (255, 255, 255))
            canvas.paste(content, ((box_w - nw) // 2, (box_h - nh) // 2))
            t = canvas
            out_ratio = target
        else:
            # 裁成目标比例（居中）
            target = ratio
            cur = cw0 / ch0
            if cur > target:      # 原图更宽 -> 裁左右
                nw = int(ch0 * target)
                t = im.crop(((cw0 - nw) // 2, 0, (cw0 - nw) // 2 + nw, ch0))
            else:                 # 原图更高 -> 裁上下（居中裁，保住上下端）
                nh = int(cw0 / target)
                top = (ch0 - nh) // 2
                t = im.crop((0, top, cw0, top + nh))
            t = t.resize((THUMB_MAX, int(THUMB_MAX / target)), Image.LANCZOS)
            out_ratio = ratio
        thumb_name = f'{s}.webp'
        t.save(os.path.join(out_dir, 'thumb', thumb_name), 'WEBP', quality=80, method=4)

        # 预览图：透明素材走 PNG（带 alpha），其余走 JPEG
        # 用原图而不是 trim 后的图 —— 预览图要贴到门上/喂给 AI，必须保持原始比例
        p = orig.copy()
        p.thumbnail((PREVIEW_MAX, PREVIEW_MAX), Image.LANCZOS)
        if transparent:
            prev_name = f'{s}.png'
            white_to_alpha(p).save(os.path.join(out_dir, 'prev', prev_name), 'PNG', optimize=True)
        else:
            prev_name = f'{s}.jpg'
            p.save(os.path.join(out_dir, 'prev', prev_name), 'JPEG', quality=86, optimize=True)

        out.append({
            'name': os.path.splitext(fn)[0],
            'thumb': f'assets/{os.path.basename(out_dir)}/thumb/{thumb_name}',
            'prev': f'assets/{os.path.basename(out_dir)}/prev/{prev_name}',
            'w': tw, 'h': th, 'ratio': round(src_ratio, 4),
            'thumbRatio': round(out_ratio, 4),
        })
    return out


def main():
    if os.path.exists(DST):
        shutil.rmtree(DST)
    os.makedirs(DST, exist_ok=True)

    catalog = {}
    for cn, (ck, label) in CATEGORIES.items():
        cat_dir = os.path.join(SRC, cn)
        if not os.path.isdir(cat_dir):
            print(f'!! missing {cat_dir}', file=sys.stderr)
            continue
        out_dir = os.path.join(DST, ck)
        os.makedirs(os.path.join(out_dir, 'thumb'), exist_ok=True)
        os.makedirs(os.path.join(out_dir, 'prev'), exist_ok=True)
        files = sorted(f for f in os.listdir(cat_dir)
                       if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))
                       and not os.path.splitext(f)[0].endswith('副本'))
        transparent = ck in ('head', 'pillar', 'lock')
        with ProcessPoolExecutor(max_workers=8) as ex:
            chunks = ex.map(process, [cat_dir] * len(files), [out_dir] * len(files), [[f] for f in files],
                            [transparent] * len(files), [ck] * len(files))
            items = [c[0] for c in chunks]
        if ck == 'emboss':
            # 压花排序：1324 项形状差异 30 倍，按文件名排会让同一行高的矮的混排，
            # 行内下方留一大块空白。
            # 按「与方形的接近度」排（|log(比例)| 升序）：
            #   - 近方形的浮雕（最常用、最好看）排最前
            #   - 极细的「子门」件排最后（它们在网格里只有十几像素宽，看不清）
            #   - 同一行内比例接近 -> 高度接近 -> 行内几乎不留白
            items.sort(key=lambda it: abs(math.log(it['thumbRatio'] or 1)))
        group_ratio = THUMB_PLAN.get(ck, {}).get('ratio') or 1.0
        group_maxh = THUMB_PLAN.get(ck, {}).get('maxH') or 1.0
        # 资源 URL 加内容版本号：素材重建后内容变了但文件名没变，
        # 浏览器会继续用缓存里的旧图（表现为「改了还是有白边」）。
        # 版本号按分类算 —— 只有真正变了的分类才需要重新下载。
        payload = json.dumps(
            [[it['name'], it['w'], it['h'], it['ratio'], it['thumbRatio']] for it in items],
            ensure_ascii=False, sort_keys=True)
        version = hashlib.md5(payload.encode('utf-8')).hexdigest()[:8]
        for it in items:
            it['thumb'] = f"{it['thumb']}?v={version}"
            it['prev'] = f"{it['prev']}?v={version}"
        catalog[ck] = {'key': ck, 'label': label, 'items': items,
                       'thumbRatio': group_ratio, 'maxH': group_maxh}
        print(f'{label}({ck}): {len(items)} 项  v={version}')

    with open('/Users/qi/Desktop/doorcode/public/catalog.json', 'w', encoding='utf-8') as f:
        json.dump(catalog, f, ensure_ascii=False, separators=(',', ':'))

    # 门面槽位配置（门扇上下分段 + 门框 + 元素定位框）
    data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
    with open(os.path.join(data_dir, 'face_spec.json')) as f:
        spec = json.load(f)
    with open(os.path.join(data_dir, 'frames.json')) as f:
        frames = json.load(f)
    with open(os.path.join(data_dir, 'leaf_lines.json')) as f:
        leaf_lines = json.load(f)

    face_cfg = {}
    for fn, sp in spec.items():
        key = sp['key']
        fr = frames.get(key)
        ll = leaf_lines.get(key)
        if not fr or not ll:
            continue
        W, H = fr['w'], fr['h']
        fl, ft, frr, fb = fr['fl'], fr['ft'], fr['fr'], fr['fb']

        # 门扇边界来自标定文件（唯一真源），门扇数 = 边界数 - 1
        lines = ll['lines']
        assert len(lines) == len(sp['leaves']) + 1, f'{key}: 标定边界数与门扇数不符'
        dt, db = sp['doorTop'], sp['doorBottom']
        dh = db - dt
        leaves = []
        for i in range(len(lines) - 1):
            leaves.append({
                'i': i + 1,
                'x0': round(lines[i] / W, 5),
                'x1': round(lines[i + 1] / W, 5),
                'zones': {
                    # 每扇门面的纵向划分：上 10% / 中 80% / 下 10%
                    'top':    {'y0': round(dt, 5), 'y1': round(dt + dh * 0.10, 5)},
                    'mid':    {'y0': round(dt + dh * 0.10, 5), 'y1': round(dt + dh * 0.90, 5)},
                    'bottom': {'y0': round(dt + dh * 0.90, 5), 'y1': round(db, 5)},
                },
            })

        face_cfg[key] = {
            'key': key, 'w': W, 'h': H,
            'frame': {'x0': round(fl / W, 5), 'x1': round(frr / W, 5),
                      'y0': round(ft / H, 5), 'y1': round(fb / H, 5)},
            'doorTop': dt, 'doorBottom': db,
            'leaves': leaves,
            'headBox': dict(REL['head']),
            'pillarL': dict(REL['pillar']),
            'pillarR': {'x0': round(1 - REL['pillar']['x1'], 5),
                        'x1': round(1 - REL['pillar']['x0'], 5),
                        'y0': REL['pillar']['y0'], 'y1': REL['pillar']['y1']},
            'lockL': {'x0': round(0.5 - REL['lockGap'] - REL['lockW'], 5),
                      'x1': round(0.5 - REL['lockGap'], 5),
                      'y0': REL['lock']['y0'], 'y1': REL['lock']['y1']},
            'lockR': {'x0': round(0.5 + REL['lockGap'], 5),
                      'x1': round(0.5 + REL['lockGap'] + REL['lockW'], 5),
                      'y0': REL['lock']['y0'], 'y1': REL['lock']['y1']},
            'thumb': f'assets/face/thumb/{slug(fn)}.webp',
            'prev': f'assets/face/prev/{slug(fn)}.jpg',
        }
    with open('/Users/qi/Desktop/doorcode/public/faces.json', 'w', encoding='utf-8') as f:
        json.dump(face_cfg, f, ensure_ascii=False, separators=(',', ':'))

    print('\ncatalog.json + faces.json written')


if __name__ == '__main__':
    main()
