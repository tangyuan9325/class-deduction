#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成《班级量化考核管理系统·学生家长使用手册》Word 文档（v1.1.0 在线版）"""
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

DOC_PATH = "班级量化考核管理系统-学生家长使用手册.docx"
ACCENT = RGBColor(0x1F, 0x6F, 0xC4)
GREEN = RGBColor(0x2E, 0x8B, 0x57)
RED = RGBColor(0xC0, 0x39, 0x2B)
GRAY = RGBColor(0x59, 0x59, 0x59)

doc = Document()

# ---------- 全局默认字体 ----------
def set_global_font(doc, name_cn="宋体", size=11):
    st = doc.styles["Normal"]
    st.font.name = "Calibri"
    st.font.size = Pt(size)
    st.element.rPr.rFonts.set(qn("w:eastAsia"), name_cn)

set_global_font(doc)

def add_para(text="", size=11, bold=False, color=None, align=None,
             font_cn="宋体", space_after=6, indent=None, italic=False):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.italic = italic
    if color: r.font.color.rgb = color
    r.font.name = "Calibri"
    r._element.rPr.rFonts.set(qn("w:eastAsia"), font_cn)
    if align is not None: p.alignment = align
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = 1.4
    if indent: p.paragraph_format.left_indent = Cm(indent)
    return p

def add_heading_cn(text, level=1):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.font.bold = True
    r.font.name = "Calibri"
    r._element.rPr.rFonts.set(qn("w:eastAsia"), "黑体")
    if level == 1:
        r.font.size = Pt(16); r.font.color.rgb = ACCENT
        p.paragraph_format.space_before = Pt(16); p.paragraph_format.space_after = Pt(8)
    elif level == 2:
        r.font.size = Pt(13.5); r.font.color.rgb = ACCENT
        p.paragraph_format.space_before = Pt(10); p.paragraph_format.space_after = Pt(6)
    else:
        r.font.size = Pt(12); r.font.color.rgb = RGBColor(0x33, 0x33, 0x33)
        p.paragraph_format.space_before = Pt(6); p.paragraph_format.space_after = Pt(4)
    return p

def add_bullet(text, size=11, bold=False, color=None):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.6)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.35
    r0 = p.add_run("• "); r0.font.size = Pt(size); r0.font.bold = True; r0.font.color.rgb = ACCENT
    r = p.add_run(text); r.font.size = Pt(size); r.font.bold = bold
    if color: r.font.color.rgb = color
    r.font.name = "Calibri"; r._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
    return p

def add_num(text, n, size=11):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.6)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.35
    r0 = p.add_run(f"{n}. "); r0.font.size = Pt(size); r0.font.bold = True; r0.font.color.rgb = ACCENT
    r = p.add_run(text); r.font.size = Pt(size)
    r.font.name = "Calibri"; r._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
    return p

def set_cell(cell, text, bold=False, size=10.5, color=None, bg=None, align="left"):
    cell.text = ""
    p = cell.paragraphs[0]
    if align == "center": p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(text)
    r.font.size = Pt(size); r.font.bold = bold
    r.font.name = "Calibri"; r._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
    if color: r.font.color.rgb = color
    if bg:
        tcPr = cell._tc.get_or_add_tcPr()
        shd = OxmlElement("w:shd")
        shd.set(qn("w:val"), "clear"); shd.set(qn("w:fill"), bg)
        tcPr.append(shd)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.2

def add_table(headers, rows, widths=None, header_bg="1F6FC4"):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr = t.rows[0].cells
    for i, h in enumerate(headers):
        set_cell(hdr[i], h, bold=True, size=10.5, color=RGBColor(0xFF, 0xFF, 0xFF), bg=header_bg, align="center")
    for row in rows:
        cells = t.add_row().cells
        for i, v in enumerate(row):
            set_cell(cells[i], str(v), size=10.5)
    if widths:
        for i, w in enumerate(widths):
            for row in t.rows:
                row.cells[i].width = Cm(w)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t

def add_hr():
    p = doc.add_paragraph()
    pPr = p._p.get_or_add_pPr()
    pbdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single"); bottom.set(qn("w:sz"), "8")
    bottom.set(qn("w:space"), "1"); bottom.set(qn("w:color"), "1F6FC4")
    pbdr.append(bottom); pPr.append(pbdr)
    p.paragraph_format.space_after = Pt(8)

# ================= 封面 =================
for _ in range(4): doc.add_paragraph()
add_para("班级量化考核管理系统", size=30, bold=True, color=ACCENT,
         align=WD_ALIGN_PARAGRAPH.CENTER, font_cn="黑体", space_after=10)
add_para("学 生 · 家 长 使 用 手 册", size=22, bold=True, color=RGBColor(0x33, 0x33, 0x33),
         align=WD_ALIGN_PARAGRAPH.CENTER, font_cn="黑体", space_after=14)
add_para("（v1.1.0 在线版）", size=14, color=GRAY, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=30)
add_para("在线访问地址：https://tangyuan9325.github.io/class-deduction/",
         size=13, bold=True, color=GREEN, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=6)
add_para("适用对象：同学 · 家长　|　编制日期：2026 年 9 月", size=11, color=GRAY,
         align=WD_ALIGN_PARAGRAPH.CENTER)
doc.add_page_break()

# ================= 目录 =================
add_heading_cn("目  录", 1)
toc_items = [
    "一、系统简介", "二、如何访问与登录", "三、学生/家长常用功能",
    "四、账号与安全", "五、常见问题（FAQ）", "六、数据说明与支持",
]
for it in toc_items:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(8)
    r = p.add_run(it); r.font.size = Pt(12.5); r.font.bold = True
    r.font.name = "Calibri"; r._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
    pPr = p._p.get_or_add_pPr()
    tabs = OxmlElement("w:tabs")
    tab = OxmlElement("w:tab"); tab.set(qn("w:val"), "right"); tab.set(qn("w:leader"), "dot"); tab.set(qn("w:pos"), "9200")
    tabs.append(tab); pPr.append(tabs)
    r2 = p.add_run("\t"); r2.font.size = Pt(12.5)
doc.add_page_break()

# ================= 一、系统简介 =================
add_heading_cn("一、系统简介", 1)
add_para("班级量化考核管理系统是一套用于班级日常管理的在线工具，采用“扣分 / 加分制”对同学们的学习、寝室、日常、两操等表现进行记录与统计。本手册面向同学与家长，介绍如何登录系统、查看孩子的在校表现数据，以及常见问题的处理方法。", size=11)
add_para("系统特点：", size=11, bold=True, space_after=4)
add_bullet("在线访问：无需安装任何软件，用电脑或手机浏览器（推荐 Chrome、Edge、Safari）打开网址即可使用；")
add_bullet("数据实时同步：任何一方录入或修改数据后，所有在线页面会自动刷新，大家看到的数据始终一致；")
add_bullet("数据持久保存：所有记录保存在云端数据库，关闭页面、更换设备后数据不丢失；")
add_bullet("权限清晰：同学 / 家长只能查看本人数据，班级整体数据由班主任授权后可见，保护每位同学隐私。")
add_para("主要功能一览：", size=11, bold=True, space_after=4)
add_table(
    ["功能", "适用角色", "说明"],
    [
        ["个人统计", "学生 / 家长", "查看本人累计扣分、加分、净分及明细"],
        ["扣分记录", "获授权账号", "查看班级扣分明细，支持筛选与导出 CSV"],
        ["周 / 学期小结", "学生 / 家长", "查看班级或个人每周、本学期表现小结"],
        ["同学扣分汇总", "获授权账号", "按日 / 周 / 月查看每位同学扣分点总结"],
        ["意见反馈", "全部角色", "提交意见与建议，老师可见并可处理"],
        ["班级看板", "班主任 / 获授权", "班级整体数据、类别分布、趋势与排名"],
    ],
    widths=[3.0, 3.2, 9.5],
)
doc.add_page_break()

# ================= 二、如何访问与登录 =================
add_heading_cn("二、如何访问与登录", 1)

add_heading_cn("2.1　访问系统", 2)
add_num("用电脑或手机浏览器打开：https://tangyuan9325.github.io/class-deduction/", 1)
add_num("页面自动进入登录界面，输入本人的账号和密码后点击“登录”。", 2)

add_heading_cn("2.2　登录方式（临时登录 / 保持登录）", 2)
add_para("登录界面的“登录选项”提供两种方式，可按需要选择：", size=11, space_after=4)
add_table(
    ["登录选项", "说明", "适用场景"],
    [
        ["临时登录", "仅在当前浏览器会话内有效，关闭浏览器后需重新登录", "公共电脑、他人手机，用完即走，更安全"],
        ["保持登录", "系统会记住登录状态约 30 天，期间打开网址直接进入", "自己的手机 / 电脑，免去重复输入账号"],
    ],
    widths=[2.8, 7.5, 5.4],
)

add_heading_cn("2.3　首次登录：请立即修改密码", 2)
add_para("为保证账号安全，学生首次登录时，系统会弹出“修改密码”窗口，强制要求修改初始密码。请按以下步骤操作：", size=11)
add_num("输入“当前密码”（即初始密码 123456）；", 1)
add_num("设置一个“新密码”（建议至少 6 位，可混合数字与字母，如 Abc123456）；", 2)
add_num("在“确认新密码”中再次输入新密码，两次必须一致；", 3)
add_num("点击“保存”，提示成功后即可进入系统首页。", 4)
add_para("提示：新密码请务必牢记并妥善保管；修改成功后，以后请用新密码登录。", size=11, italic=True, color=GREEN)
doc.add_page_break()

# ================= 三、学生/家长常用功能 =================
add_heading_cn("三、学生/家长常用功能", 1)
add_para("家长可使用孩子的学生账号登录（学生账号可与家长共用），用于查看孩子的在校表现。登录后即可看到左侧功能菜单。", size=11)

add_heading_cn("3.1　查看个人统计（最常用）", 2)
add_para("点击左侧菜单“个人统计”，可查看孩子本人：", size=11)
add_bullet("累计扣分、累计加分、净分、记录条数等核心指标；")
add_bullet("逐条明细：日期、类别（学习 / 寝室 / 日常 / 两操 / 加分）、项目、分值、原因；")
add_bullet("哪些方面被扣了分、哪些方面获得了加分，一目了然。")

add_heading_cn("3.2　查看扣分记录", 2)
add_para("点击左侧菜单“扣分记录”，可查看班级全量扣分明细（需账号已获“查看扣分记录”权限）：", size=11)
add_bullet("每条记录包含：学生姓名、类别、项目、分值、原因、记录人、日期；")
add_bullet("支持按类别、搜索姓名/项目/原因进行筛选；")
add_bullet("可点击“导出 CSV”将当前列表下载保存，方便家长会或留档。")
add_para("若菜单中未显示“扣分记录”，说明该账号尚未获得查看权限，请联系班主任开通。", size=11, italic=True, color=GRAY)

add_heading_cn("3.3　周小结 / 学期小结", 2)
add_para("点击左侧菜单“周 / 学期小结”，可查看孩子（或个人）在“本周”或“本学期”的表现总结：", size=11)
add_bullet("切换“班级小结 / 个人小结”，个人小结中输入孩子的姓名或学号即可；")
add_bullet("展示周期内累计扣分、累计加分、净分、记录数，以及分项明细和 TOP 排行；")
add_bullet("一句话总结周期内表现，方便家长快速了解孩子近况。")

add_heading_cn("3.4　同学扣分汇总（日 / 周 / 月）", 2)
add_para("点击左侧菜单“同学扣分汇总”，可按“每日 / 每周 / 每月”查看班级每一位同学的扣分情况：", size=11)
add_bullet("表格列出每位同学的扣分总数、加分总数、净分、记录数；")
add_bullet("“主要扣分点”一栏自动汇总该同学本周期的高频扣分项目；")
add_bullet("可点击“导出 CSV”保存汇总表。")
add_para("说明：该功能需账号具备“查看班级”权限，普通学生默认仅能查看本人数据。", size=11, italic=True, color=GRAY)

add_heading_cn("3.5　提交意见反馈", 2)
add_para("点击左侧菜单“意见反馈”，可写下对系统的建议、遇到的问题或希望增加的功能：", size=11)
add_bullet("填写意见建议内容，可选填联系方式；")
add_bullet("点击“提交反馈”即可；班主任 / 管理员可查看并处理；")
add_bullet("也可以点击右上角“在 GitHub Issues 查看全部”，到项目主页反馈。")
doc.add_page_break()

# ================= 四、账号与安全 =================
add_heading_cn("四、账号与安全", 1)

add_heading_cn("4.1　账号说明", 2)
add_table(
    ["角色", "账号", "初始密码", "说明"],
    [
        ["学生", "stu+学号（如 stu02）", "123456", "首次登录强制修改密码"],
        ["班主任", "banzhuren", "123456", "班级管理全部功能（崔孝禹）"],
        ["班级看板", "kandban", "123456", "只读看板账号，无操作权限"],
        ["管理员", "admin", "admin123", "系统维护，全部权限"],
    ],
    widths=[2.4, 4.6, 2.6, 6.1],
)

add_heading_cn("4.2　忘记密码怎么办", 2)
add_para("若忘记密码，请联系班主任或管理员，在“用户管理”中为学生重置密码（重置后恢复为初始密码 123456，学生下次登录时再按提示修改即可）。")

add_heading_cn("4.3　安全提示", 2)
add_bullet("首次登录后请立即修改初始密码，不要继续使用默认密码；")
add_bullet("不要将账号密码告知他人，避免他人冒用账号查看或修改数据；")
add_bullet("在公共电脑上请选择“临时登录”，用完及时点左下角“退出登录”；")
add_bullet("如发现账号异常，请及时联系班主任或管理员。")
doc.add_page_break()

# ================= 五、常见问题 =================
add_heading_cn("五、常见问题（FAQ）", 1)
add_table(
    ["问题", "解决办法"],
    [
        ["登录后提示“需要修改密码”", "首次登录需按提示设置新密码并确认，保存后即可正常使用"],
        ["提示“账号或密码错误”", "确认账号格式为 stu+学号，密码无误；仍不行请联系班主任重置"],
        ["看不到“班级看板”菜单", "该账号未获“查看班级”权限，请联系班主任开通"],
        ["看不到“扣分记录”菜单", "该账号未获“查看扣分记录”权限，请联系班主任开通"],
        ["看不到“录入加分”菜单", "加分需单独的“加分”权限，由班主任在用户管理中分配"],
        ["想查看其他同学的扣分", "为保护隐私，系统不允许查看他人数据；需要时请班主任提供班级汇总"],
        ["页面数据没有更新", "系统会自动实时同步；若长时间无变化，可手动刷新一次页面"],
        ["更换手机 / 电脑后数据会丢吗", "不会。数据保存在云端数据库，任何设备登录都能看到最新数据"],
    ],
    widths=[7.0, 8.7],
)
doc.add_page_break()

# ================= 六、数据说明与支持 =================
add_heading_cn("六、数据说明与支持", 1)

add_heading_cn("6.1　数据说明", 2)
add_bullet("扣分 / 加分数据仅用于班级日常管理与家校沟通，由班主任及获授权人员按实际情况如实记录；")
add_bullet("扣分类别为：学习、寝室、日常、两操；加分类别为各类加分项（如助人为乐、学习进步、比赛获奖等）；")
add_bullet("所有数据保存在项目云端数据库，跨设备、多人在线实时同步。")

add_heading_cn("6.2　隐私保护", 2)
add_para("为保护每位同学的隐私，系统默认每个账号只能查看本人（或本账号对应学生）的数据；班级整体数据仅在获得班主任授权后可见。请所有使用者尊重他人隐私，不将他人数据外传。")

add_heading_cn("6.3　技术支持", 2)
add_para("使用过程中如遇问题，可通过“意见反馈”提交，或联系系统管理员：____________（姓名 / 电话 / 微信）。")
add_hr()
add_para("—— 班级量化考核管理系统 v1.1.0 · 学生家长使用手册 ——",
         size=10, color=GRAY, align=WD_ALIGN_PARAGRAPH.CENTER)

doc.save(DOC_PATH)
print("已生成:", DOC_PATH)
