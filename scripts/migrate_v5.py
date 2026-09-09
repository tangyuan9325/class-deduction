#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v1.3.0 数据库拆分迁移：单文件 db.json(v4) → 多文件（accounts/records/feedback/每用户pwd）"""
import json, os, base64, hashlib, secrets, datetime, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'docs')
DATA = os.path.join(DOCS, 'data')

PBKDF2_ITER = 600000
APP_VERSION = '1.3.0'
DB_VERSION = 5

def pbkdf2(passwd):
    salt = secrets.token_bytes(16)
    h = hashlib.pbkdf2_hmac('sha256', passwd.encode(), salt, PBKDF2_ITER, dklen=32)
    return 'pbkdf2$%d$%s$%s' % (PBKDF2_ITER, base64.b64encode(salt).decode(), base64.b64encode(h).decode())

def sha256hex(s):
    return hashlib.sha256(s.encode()).hexdigest()

# 已知初始密码的 sha256 值 → 迁移时直接升级为 PBKDF2（避免登录时逐个触发升级写）
KNOWN_SHA = {sha256hex('123456'): '123456', sha256hex('admin123'): 'admin123'}

def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')

def read_xls_roster():
    import xlrd
    wb = xlrd.open_workbook(os.path.join(ROOT, '2706名单.xls'))
    sh = wb.sheet_by_index(0)
    roster = {}
    for r in range(2, sh.nrows):
        name = str(sh.cell_value(r, 0)).strip()
        sid = str(sh.cell_value(r, 1)).strip().replace('.0', '')
        g = str(sh.cell_value(r, 2)).strip()
        roster[name] = (sid, g)
    return roster

def main():
    src = os.path.join(DATA, 'db.json')
    if not os.path.exists(src):
        src = os.path.join(DATA, 'backup', 'db.v4.backup.json')   # 支持从备份重跑
    d = json.load(open(src, encoding='utf-8'))
    t = now()
    roster = read_xls_roster()

    users = []
    max_id = 0
    for u in d['users']:
        u = dict(u)
        if u['username'] == 'kandban':
            u['username'] = '看板'
            u['real_name'] = '看板'
            u['permissions'] = ['查看扣分记录']
        if u['role'] == 'student':
            g = roster.get(u['real_name'], (None, None))[1]
            u['gender'] = g or '男'
        # 已知初始密码的 legacy sha256 → 直接升级 PBKDF2；未知明文保留原值（登录时自动升级）
        if not str(u.get('pass','')).startswith('pbkdf2$') and u.get('pass') in KNOWN_SHA:
            u['pass'] = pbkdf2(KNOWN_SHA[u['pass']])
        users.append(u)
        max_id = max(max_id, u['id'])

    # 新增学科老师（帐号为中文，首次登录需改密；权限：加分 + 学习类扣分 + 班级看板）
    for name in ['语文老师', '英语老师']:
        max_id += 1
        users.append({
            'id': max_id, 'username': name, 'pass': pbkdf2('123456'),
            'real_name': name, 'role': 'teacher', 'class_id': 1,
            'must_change': True, 'gender': None, 'permissions': ['学习', '加分']
        })

    # 排序：管理员/班主任/看板在前，学生按 id
    order = {'admin': 0, 'teacher': 1, 'viewer': 2, 'student': 3}
    users.sort(key=lambda u: (order.get(u['role'], 9), u['id']))

    # v1.3.0 更新日志（功能更新）
    changelog = [
        '【v1.3.0 功能更新】新增学科老师账号（语文老师/英语老师）：可录入学习类扣分与加分、查看班级看板，首次登录需修改密码',
        '【v1.3.0 功能更新】看板账号更名「看板」，可查看扣分明细，密码支持自助修改',
        '【v1.3.0 功能更新】扣分记录全面展示具体原因（含备注），无备注时显示「无备注」',
        '【v1.3.0 功能更新】所有扣分/加分类别新增「其它」项，选「其它」时须填写备注原因',
        '【v1.3.0 功能更新】数据库拆分重构：扣分记录库 / 账号控制库 / 每用户独立密码文件，读写更高效',
        '【v1.3.0 功能更新】新增「暂存-递交更新」：加/减分与账号修改先暂存浏览器，确认后统一递交',
        '【v1.3.0 功能更新】按 2706 名单修复学生性别数据；实时同步改为 CDN/源站双通道，API 配额消耗大幅下降',
    ] + (d.get('meta', {}).get('changelog', []) or [])
    seen = d.get('seen_changelog', {}) or {}
    # 老账号已看过 v1.2.0 日志，v1.3.0 需再次展示：清空 seen 由前端重新标记
    seen = {}

    accounts = {
        'version': DB_VERSION, 't': t,
        'users': users,
        'seen_changelog': seen,
        'meta': {'version': APP_VERSION, 'semester_start': d.get('meta', {}).get('semester_start') or '2026-09-01', 'changelog': changelog},
    }
    records = {'version': DB_VERSION, 't': t, 'records': d.get('records', []) or [], 'audit': d.get('audit', []) or []}
    feedback = {'version': DB_VERSION, 't': t, 'feedback': d.get('feedback', []) or []}

    # 每用户密码文件
    os.makedirs(os.path.join(DATA, 'users'), exist_ok=True)
    for u in users:
        folder = os.path.join(DATA, 'users', u['username'])
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, 'pwd.json'), 'w', encoding='utf-8') as f:
            json.dump({'version': DB_VERSION, 'pass': u['pass'], 'updated_at': t}, f, ensure_ascii=False, indent=1)
        # 密码不出现在 accounts.json
        u.pop('pass', None)

    with open(os.path.join(DATA, 'accounts.json'), 'w', encoding='utf-8') as f:
        json.dump(accounts, f, ensure_ascii=False, indent=1)
    with open(os.path.join(DATA, 'records.json'), 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=1)
    with open(os.path.join(DATA, 'feedback.json'), 'w', encoding='utf-8') as f:
        json.dump(feedback, f, ensure_ascii=False, indent=1)

    # 旧单文件移入 backup（保留数据）
    shutil.move(src, os.path.join(DATA, 'backup', 'db.v4.backup.json'))

    print('迁移完成: users=%d | 新老师: %s | 看板账号: %s' % (
        len(accounts['users']),
        [u['username'] for u in users if u['username'] in ('语文老师', '英语老师')],
        [u['username'] for u in users if u['role'] == 'viewer']))
    girls = sum(1 for u in users if u['role'] == 'student' and u['gender'] == '女')
    print('学生性别: 女%d 男%d' % (girls, len([u for u in users if u['role'] == 'student']) - girls))
    print('changelog: %d 条 (v1.3.0 前置 %d 条)' % (len(changelog), 7))

if __name__ == '__main__':
    main()
