package model

import "time"

// DeductionRecord 扣分记录表
// category 为四大类：学习 / 寝室 / 日常 / 两操
// subject_or_item 存科目（学习类）或扣分项目（其它类）
type DeductionRecord struct {
	ID             int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	TargetUserID   int64     `gorm:"index;not null" json:"target_user_id"`   // 被扣分学生
	TargetName     string    `gorm:"size:64" json:"target_name"`             // 冗余学生姓名，便于导出
	OperatorUserID int64     `gorm:"index" json:"operator_user_id"`          // 操作人（学生干部/班主任/管理员）
	OperatorName   string    `gorm:"size:64" json:"operator_name"`           // 操作人姓名
	Category       string    `gorm:"size:32;index;not null" json:"category"` // 类别：学习 / 寝室 / 日常 / 两操
	SubjectOrItem  string    `gorm:"size:32;index" json:"subject_or_item"`   // 科目或扣分项目
	Score          int       `gorm:"not null;default:0" json:"score"`        // 扣分/加分（负数扣分，正数加分）
	Reason         string    `gorm:"size:512" json:"reason"`                 // 扣分原因说明
	RecordDate     time.Time `gorm:"index;type:date" json:"record_date"`     // 记录归属日期
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// TableName 表名
func (DeductionRecord) TableName() string { return "deduction_records" }

// 扣分类别常量
// 权限体系分为四大类：学习（各科作业上交）/ 寝室 / 日常 / 两操
const (
	CategoryStudy    = "学习" // 学习类：项目为各科目（作业上交情况）
	CategoryDorm     = "寝室" // 寝室类：地未拖、灯未关、垃圾未倒…
	CategoryDaily    = "日常" // 日常类：迟到、卫生、纪律…
	CategoryExercise = "两操" // 两操类：早操、课间操、眼保健操…
	CategoryBonus    = "加分" // 加分：助人为乐、学习进步、卫生优秀、比赛获奖…
)

// AllCategories 全部扣分类别（顺序固定，用于字典/权限界面展示）
var AllCategories = []string{CategoryStudy, CategoryDorm, CategoryDaily, CategoryExercise, CategoryBonus}

// DeductCategories 仅扣分类别（加分独立展示时用）
var DeductCategories = []string{CategoryStudy, CategoryDorm, CategoryDaily, CategoryExercise}
