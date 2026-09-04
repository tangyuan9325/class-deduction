package model

import "time"

// DeductionPermission 扣分权限分配表
// 班主任（teacher 角色）/ 管理员默认拥有全部扣分权限；
// 班主任可将某类（或某类下某项目）的扣分权限授予学生（如寝室长授"寝室"类、课代表授"学习"类）。
// SubjectOrItem 为空表示整类权限；非空表示仅该类下某一具体项目。
type DeductionPermission struct {
	ID            int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID        int64     `gorm:"index;not null" json:"user_id"`          // 被授权学生
	Category      string    `gorm:"size:32;index;not null" json:"category"` // 学习 / 寝室 / 日常 / 两操
	SubjectOrItem string    `gorm:"size:64" json:"subject_or_item"`         // 具体项目，空 = 整类
	GrantedBy     int64     `gorm:"index" json:"granted_by"`                // 授权人（班主任/管理员）
	CreatedAt     time.Time `json:"created_at"`
}

// 特殊权限：可查看班级全部统计（个人统计页可查看其他同学）
// 班主任/管理员默认拥有；班主任可将该权限分配给同学。
const ViewStatsCategory = "查看班级"

// 特殊权限：可查看扣分记录（全量扣分明细）
// 普通同学默认无法查看扣分记录；班主任/管理员默认拥有，可将该权限分配给同学。
const ViewRecordsCategory = "查看扣分记录"

// TableName 表名
func (DeductionPermission) TableName() string { return "user_permissions" }
