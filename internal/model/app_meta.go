package model

import "time"

// AppMeta 应用元信息表（版本号 / 更新日志 / 学期开始日期等键值对）
type AppMeta struct {
	ID        int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	Key       string    `gorm:"size:64;uniqueIndex;not null" json:"key"`
	Value     string    `gorm:"size:4000" json:"value"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName 表名
func (AppMeta) TableName() string { return "app_meta" }

// 应用版本（1.1.0）
const AppVersion = "1.1.0"

// AppName 系统名称
const AppName = "班级量化考核管理系统"

// Changelog 更新日志（v1.1.0）
var Changelog = []string{
	"【新增】数据库持久化：数据存放于持久化目录，支持自动备份",
	"【新增】实时动态更新扣分情况：任一终端录入/撤销扣分或加分，全班页面即时刷新",
	"【新增】周小结 / 学期小结：支持班级与个人维度汇总",
	"【新增】每日 / 每周 / 每月同学扣分点汇总，支持导出 Excel",
	"【新增】加分功能：独立权限与独立录入页面",
	"【新增】意见反馈：支持提交意见并同步到 GitHub Issues",
	"【新增】关于/克隆仓库引导页：一键复制仓库克隆与部署指引",
	"【新增】班级看板只读账号（kandban）：仅供展示，无任何权限",
	"【新增】保持登录 / 临时登录两种登录方式",
	"【新增】首次进入更新后系统时展示本次更新日志",
	"【优化】前端每个模块的 HTML / CSS / JS 独立拆分，便于阅读与维护",
}

// MetaKeys 元信息键
const (
	MetaKeySemesterStart = "semester_start" // 学期开始日期 YYYY-MM-DD
)
