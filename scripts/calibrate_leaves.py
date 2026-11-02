#!/usr/bin/env python3
"""
门扇边界标定与校验

- `leaf_lines.json` 是门扇边界的**唯一真源**（人工标定 + 视觉验证）
- `verify` 子命令：自动检测门缝候选，报告每条标定线与最近候选的偏差；
  偏差超阈值说明底图换了或标定过期 —— 报警而不是静默出错。

用法:
  python3 scripts/calibrate_leaves.py verify
"""
import cv2, numpy as np, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
CFG = os.path.join(DATA, 'leaf_lines.json')

# 底图目录优先级：
#   1) DOOR_FACES 环境变量
#   2) 项目内 .materials/材料文件/门面类型（材料包解压，可复现）
#   3) public/assets/face/prev（构建产物，兜底）
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)


def _faces_dir():
    env = os.environ.get('DOOR_FACES')
    if env and os.path.isdir(env):
        return env
    local = os.path.join(_ROOT, '.materials', '材料文件', '门面类型')
    if os.path.isdir(local):
        return local
    return os.path.join(_ROOT, 'public', 'assets', 'face', 'prev')


FACES = _faces_dir()
BODY = {
    '两扇门': (0.279, 0.931),
    '四扇门': (0.300, 0.924),
    '六扇门': (0.285, 0.927),
    '八扇门': (0.286, 0.928),
}
LEAF_COUNT = {'两扇门': 2, '四扇门': 4, '六扇门': 6, '八扇门': 8}
TOLERANCE = 0.025  # 标定线与检测候选的最大允许偏差（画布比例）


def candidates(gray, W, H, y0, y1):
    """门体区域内的竖框料候选"""
    band = gray[int(H * y0):int(H * y1), :].astype(float)
    k = 61
    bg = np.apply_along_axis(lambda r: np.convolve(r, np.ones(k) / k, mode='same'), 1, band)
    hp = band - bg
    prof = np.abs(hp).mean(axis=0)
    prof = np.convolve(prof, np.ones(9) / 9, mode='same')
    out = []
    i = 2
    while i < W - 2:
        win = prof[max(0, i - 25):i + 25]
        if prof[i] > win.mean() * 1.45 and prof[i] > 2.0:
            j = i
            while j < W - 2 and prof[j] > prof[max(0, j - 25):j + 25].mean() * 1.2:
                j += 1
            out.append((i + j) // 2)
            i = j
        else:
            i += 1
    return sorted(out)


def load():
    with open(CFG) as f:
        return json.load(f)


def verify(cfg=None):
    cfg = cfg or load()
    ok = True
    for key, info in cfg.items():
        fn = f'{key}.jpeg'
        path = os.path.join(FACES, fn)
        if not os.path.exists(path):
            path = os.path.join(FACES, os.path.splitext(fn)[0] + '.jpg')
        if not os.path.exists(path):
            print(f'✗ {key}: 找不到底图 {path}')
            ok = False
            continue
        img = cv2.imread(path)
        H, W = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        cands = candidates(gray, W, H, *BODY[key])

        lines = info['lines']
        n = LEAF_COUNT[key]
        problems = []
        if len(lines) != n + 1:
            problems.append(f'边界数 {len(lines)} != {n+1}')
        if not all(lines[i] < lines[i + 1] for i in range(len(lines) - 1)):
            problems.append('边界非递增')
        # 门是透视渲染，左右允许少量不等（实测四/六扇门约 1.2%）
        sym = max(abs((lines[i] + lines[-1 - i]) - W) for i in range(len(lines)))
        if sym > W * 0.02:
            problems.append(f'左右不对称 {sym:.0f}px')

        # 每条标定线到最近检测候选的距离
        # 中心线（两扇门拼接缝）没有框料，不参与候选比对
        devs = []
        for x in lines:
            if abs(x - W / 2) <= W * 0.02:
                continue
            near = min((abs(x - c) for c in cands), default=9999)
            devs.append(near / W)
        worst = max(devs) if devs else 0.0

        status = '✓' if not problems and worst <= TOLERANCE else '✗'
        if status == '✗':
            ok = False
        print(f'{status} {key}: {len(lines)} 条边界, 对称偏差 {sym:.0f}px, '
              f'最大单边偏差 {worst*100:.2f}% (阈值 {TOLERANCE*100:.1f}%)')
        if problems:
            for p in problems:
                print(f'    ! {p}')
        if worst > TOLERANCE:
            print(f'    ! 标定线与检测候选偏差过大，底图可能已更换')
            print(f'      标定: {[round(x) for x in lines]}')
            print(f'      候选: {cands}')
    print('\n' + ('全部通过' if ok else '存在问题，需重新标定'))
    return ok


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'verify':
        sys.exit(0 if verify() else 1)
    print(__doc__)
    print('标定配置:', CFG)
