#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把两套字体子集化为网页可用的 woff2。

用法：
    python3 tools/build-fonts.py <JetBrainsMono 解压目录> "<Genshin Impact font.ttf 路径>"

产物：
    docs/fonts/jetbrains-mono-{400,500,700}.woff2   仅拉丁与常用符号
    docs/fonts/genshin-sc.woff2                     站点用到的汉字 + 常用汉字

原 god 文件 11.4MB，直接放网页不可接受，故按页面语料 + 常用汉字子集化。
"""
import glob
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'fonts')

# 页面语料之外再补一层常用汉字，覆盖学生姓名与常见备注用字。
# 原字体 11.4MB，woff2 子集体积约 135 字节/字，因此只补最可能出现的字，
# 未收录的字由系统字体兜底，不会出现空白。
COMMON = (
    '鑫磊涛鹏辉宇航浩然子涵欣怡梓萱雨泽思远俊杰嘉豪天佑晨曦若曦一诺安然'
    '婉清梦瑶静怡佳琪雅婷诗涵语彤睿哲博文思彤梦琪悦涵雨桐欣妍晨曦皓轩'
    '课上讲话睡觉迟到早退缺席请假病事假跑步操集会升旗仪式课间午休晚修'
    '作业未交未改抄袭订正测验考试期中期末模拟月考周练成绩排名分数满分'
    '打架骂人顶撞辱骂同学师生关系手机游戏课外书零食饮料外卖插队拥挤'
    '宿舍寝室床铺被子枕头拖鞋毛巾牙刷脸盆衣柜鞋架阳台走廊楼梯卫生间'
    '值日值周卫生打扫扫地拖地擦窗倒垃圾黑板讲台桌椅门窗灯扇空调饮水机'
    '表扬进步优秀良好合格嘉奖鼓励先进标兵三好班干团干组长代表志愿者'
    '参加获奖竞赛运动会艺术节合唱朗诵演讲征文书法绘画手工科技社团'
)

ASCII = ''.join(chr(i) for i in range(0x20, 0x7F))
PUNCT = '　、。〃々〈〉《》「」『』【】〔〕〖〗〝〞–—‘’“”…‧﹏·×÷°±‰※→←↑↓↔■□●○◆◇★☆•'


def corpus():
    chars = set(ASCII) | set(PUNCT) | set(COMMON)
    chars.discard('\n')
    pats = ['docs/*.js', 'docs/*.html', 'docs/*.css', 'docs/README.md',
            'docs/data/*.json', 'docs/data/**/*.json']
    for pat in pats:
        for f in glob.glob(os.path.join(ROOT, pat), recursive=True):
            try:
                chars |= set(open(f, encoding='utf-8').read())
            except (UnicodeDecodeError, OSError):
                pass
    chars = {c for c in chars if c.isprintable() or c == '　'}
    return ''.join(sorted(chars))


def run(cmd):
    print('  $', ' '.join(cmd))
    subprocess.run(cmd, check=True)


def main():
    jb_dir = sys.argv[1] if len(sys.argv) > 1 else None
    gi_ttf = sys.argv[2] if len(sys.argv) > 2 else None
    os.makedirs(OUT, exist_ok=True)

    text = corpus()
    txt_path = '/tmp/font-corpus.txt'
    open(txt_path, 'w', encoding='utf-8').write(text)
    cjk = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    print(f'语料字符 {len(text)}（汉字 {cjk}）')

    if jb_dir:
        for weight in (400, 500, 700):
            src = os.path.join(jb_dir, f'JetBrainsMono-{weight if weight != 400 else "Regular"}.woff2')
            if not os.path.exists(src):
                src = os.path.join(jb_dir, f'JetBrainsMono-{ {400: "Regular", 500: "Medium", 700: "Bold"}[weight] }.woff2')
            dst = os.path.join(OUT, f'jetbrains-mono-{weight}.woff2')
            run([sys.executable, '-m', 'fontTools.subset', src, f'--text={ASCII}{PUNCT}',
                 '--flavor=woff2', '--layout-features=*', '--no-hinting',
                 '--desubroutinize', f'--output-file={dst}'])
            print(f'    → {dst} {os.path.getsize(dst) / 1024:.0f} KB')

    if gi_ttf:
        dst = os.path.join(OUT, 'genshin-sc.woff2')
        run([sys.executable, '-m', 'fontTools.subset', gi_ttf, f'--text-file={txt_path}',
             '--flavor=woff2', '--layout-features=', '--no-hinting',
             '--desubroutinize', '--drop-tables+=DSIG,GSUB,GPOS,GDEF,meta', f'--output-file={dst}'])
        print(f'    → {dst} {os.path.getsize(dst) / 1024:.0f} KB')


if __name__ == '__main__':
    main()
