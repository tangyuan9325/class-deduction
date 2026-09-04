package model

import "time"

// Feedback 意见反馈表（1.1.0 新增）
// 任何登录用户均可提交；班主任/管理员可查看、标记状态、同步到 GitHub Issues。
type Feedback struct {
	ID             int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID         int64     `gorm:"index;not null" json:"user_id"`            // 提交人
	UserName       string    `gorm:"size:64" json:"user_name"`                 // 提交人姓名（冗余）
	UserRole       string    `gorm:"size:16" json:"user_role"`                 // 提交人角色
	Content        string    `gorm:"size:2000;not null" json:"content"`        // 意见/建议内容
	Contact        string    `gorm:"size:128" json:"contact"`                  // 联系方式（可选）
	Status         string    `gorm:"size:16;index;default:open" json:"status"` // open=待处理 / processing=处理中 / resolved=已处理 / closed=已关闭
	GithubIssueNum int       `gorm:"default:0" json:"github_issue_num"`        // 已同步到 GitHub 的 Issue 编号（0=未同步）
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// TableName 表名
func (Feedback) TableName() string { return "feedbacks" }

// 反馈状态常量
const (
	FeedbackOpen       = "open"       // 待处理
	FeedbackProcessing = "processing" // 处理中
	FeedbackResolved   = "resolved"   // 已处理
	FeedbackClosed     = "closed"     // 已关闭
)
