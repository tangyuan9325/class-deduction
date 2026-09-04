#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
班级量化考核管理系统 - 学生名单导入脚本

用法:
    python3 scripts/import_students.py --base-url http://localhost:8080 \
        --csv data/roster.csv --admin admin --password admin123

说明:
    - 读取 CSV（表头: 姓名,学号,性别），跳过标题行
    - 为每位学生创建账号 stu+学号，初始密码 123456，角色 student，班级 class_id=1
    - 幂等：已存在的账号自动跳过，可重复执行
    - 名单文件包含学生个人信息，请通过 GitHub Actions Secret 安全注入，
      不要提交到公开仓库（.gitignore 已排除 roster.csv / roster.json / 2706名单.xls）
"""
import argparse
import csv
import sys

try:
    import requests
except ImportError:
    print("[ERROR] 需要 requests 库：pip3 install requests", file=sys.stderr)
    sys.exit(2)


def main():
    ap = argparse.ArgumentParser(description="导入学生名单")
    ap.add_argument("--base-url", required=True, help="系统地址，如 http://localhost:8080")
    ap.add_argument("--csv", required=True, help="名单 CSV 路径（姓名,学号,性别）")
    ap.add_argument("--admin", default="admin")
    ap.add_argument("--password", default="admin123")
    ap.add_argument("--class-id", type=int, default=1)
    ap.add_argument("--initial-password", default="123456")
    args = ap.parse_args()

    base = args.base_url.rstrip("/")
    sess = requests.Session()

    # 1. 登录 admin
    r = sess.post(f"{base}/api/v1/auth/login", json={"username": args.admin, "password": args.password}, timeout=15)
    if r.status_code != 200:
        print(f"[ERROR] 登录失败: HTTP {r.status_code} {r.text[:200]}", file=sys.stderr)
        sys.exit(1)
    token = r.json()["data"]["token"]
    sess.headers["Authorization"] = f"Bearer {token}"

    # 2. 读取名单
    rows = []
    with open(args.csv, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        for i, row in enumerate(reader):
            if i == 0 and (row and row[0].strip() == "姓名"):
                continue  # 跳过表头
            if not row or not row[0].strip():
                continue
            name = row[0].strip()
            sid = row[1].strip() if len(row) > 1 else ""
            if not sid:
                continue
            rows.append((name, sid))

    if not rows:
        print("[ERROR] 名单为空", file=sys.stderr)
        sys.exit(1)

    # 3. 已有用户集合（避免重复）
    try:
        existing = set()
        page = 1
        while True:
            r = sess.get(f"{base}/api/v1/users", params={"page": page, "page_size": 100}, timeout=15)
            if r.status_code != 200:
                break
            data = r.json().get("data", {})
            items = data.get("list") or data.get("items") or []
            for u in items:
                existing.add(u.get("username", ""))
            if len(items) < 100:
                break
            page += 1
    except Exception as e:
        print(f"[WARN] 查询已有用户失败: {e}", file=sys.stderr)
        existing = set()

    created, skipped = 0, 0
    for name, sid in rows:
        username = f"stu{sid}"
        if username in existing:
            skipped += 1
            continue
        r = sess.post(f"{base}/api/v1/users", json={
            "username": username,
            "password": args.initial_password,
            "real_name": name,
            "role": "student",
            "class_id": args.class_id,
        }, timeout=15)
        if r.status_code in (200, 201):
            created += 1
            existing.add(username)
        else:
            print(f"[WARN] 创建 {username}({name}) 失败: HTTP {r.status_code} {r.text[:150]}", file=sys.stderr)

    print(f"[OK] 导入完成：新增 {created} 人，跳过 {skipped} 人（已存在）")


if __name__ == "__main__":
    main()
