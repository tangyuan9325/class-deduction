package model

import (
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// User 用户表
type User struct {
	ID                   int64          `gorm:"primaryKey;autoIncrement" json:"id"`
	Username             string         `gorm:"size:64;uniqueIndex;not null" json:"username"`     // 登录账号
	Password             string         `gorm:"size:128;not null" json:"-"`                       // 加密后的密码
	RealName             string         `gorm:"size:64" json:"real_name"`                         // 真实姓名
	Role                 string         `gorm:"size:16;index;default:student" json:"role"`        // admin / teacher / student / viewer
	MustChangePassword   bool           `gorm:"default:false" json:"must_change_password"`        // 首次登录强制修改密码
	SeenChangelogVersion string         `gorm:"size:16;default:''" json:"seen_changelog_version"` // 已读过的更新日志版本（1.1.0 起记录）
	ClassID              int64          `gorm:"index" json:"class_id"`                            // 所属班级
	CreatedAt            time.Time      `json:"created_at"`
	UpdatedAt            time.Time      `json:"updated_at"`
	DeletedAt            gorm.DeletedAt `gorm:"index" json:"-"`
}

// TableName 表名
func (User) TableName() string { return "users" }

// SetPassword 用 bcrypt 加密明文密码并写入 Password 字段
func (u *User) SetPassword(plain string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	u.Password = string(hash)
	return nil
}

// CheckPassword 校验明文密码是否匹配
func (u *User) CheckPassword(plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(plain)) == nil
}

// 角色常量
const (
	RoleAdmin   = "admin"
	RoleTeacher = "teacher"
	RoleStudent = "student"
	// RoleViewer 班级看板只读账号：可查看班级看板/个人统计/小结/汇总/反馈/关于，但无任何录入与管理权限
	RoleViewer = "viewer"
)
