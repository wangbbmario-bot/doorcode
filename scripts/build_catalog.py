#!/usr/bin/env python3
"""
素材索引 + 缩略图生成

输入:  材料文件/  (门面类型 / 门头类型 / 门柱类型 / 锁类型 / 压花类型 / 颜色类型)
输出:  public/assets/<分类>/<缩略图.webp>  + public/assets/<分类>/<预览.jpg>
       public/catalog.json

缩略图用于选择网格，预览图用于实时合成与 AI 生图参考。
"""
import json, os, shutil, sys, re
from concurrent.futures import ProcessPoolExecutor
from PIL import Image

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
#   ratio  = 缩略图宽高比，None = 保持原始比例（完整显示）
#   cover  = 裁切填满指定比例（快速识别，看局部）
#   contain= 完整放进方框（看全貌，可能留白/细条）
THUMB_PLAN = {
    'face':   {'ratio': 1.0,  'mode': 'cover'},    # 门面：整门渲染图，方形取上部
    'color':  {'ratio': 1.0,  'mode': 'cover'},    # 颜色：方形成品纹理
    'head':   {'ratio': 4.0,  'mode': 'cover'},    # 门头：横向长条（原件 ~10:1），取中段
    'pillar': {'ratio': 1.0,  'mode': 'cover'},    # 门柱：纵向细条（原件 ~1:7），取局部
    'lock':   {'ratio': 1.0,  'mode': 'cover'},    # 门锁：纵向细条（原件 ~1:2.4），取局部
    'emboss': {'ratio': None, 'mode': 'contain'},  # 压花：长条/方块都有，保持完整
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
        cw0, ch0 = im.size
        ratio = plan['ratio']
        if ratio is None or plan['mode'] == 'contain':
            # 保持原始比例：缩到 THUMB_MAX 的最长边，完整可见
            t = im.copy()
            t.thumbnail((THUMB_MAX, THUMB_MAX), Image.LANCZOS)
            out_ratio = t.width / t.height
        else:
            # 裁成目标比例（居中）
            target = ratio
            cur = cw0 / ch0
            if cur > target:      # 原图更宽 -> 裁左右
                nw = int(ch0 * target)
                t = im.crop(((cw0 - nw) // 2, 0, (cw0 - nw) // 2 + nw, ch0))
            else:                 # 原图更高 -> 裁上下（取上段，纹样更全）
                nh = int(cw0 / target)
                t = im.crop((0, 0, cw0, nh))
            t = t.resize((THUMB_MAX, int(THUMB_MAX / target)), Image.LANCZOS)
            out_ratio = ratio
        thumb_name = f'{s}.webp'
        t.save(os.path.join(out_dir, 'thumb', thumb_name), 'WEBP', quality=80, method=4)

        # 预览图：透明素材走 PNG（带 alpha），其余走 JPEG
        p = im.copy()
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
        group_ratio = THUMB_PLAN.get(ck, {}).get('ratio') or 1.0
        catalog[ck] = {'key': ck, 'label': label, 'items': items, 'thumbRatio': group_ratio}
        print(f'{label}({ck}): {len(items)} 项')

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
