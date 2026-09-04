package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"class-deduction/internal/model"
	"class-deduction/pkg/errcode"
	"gorm.io/gorm"
)

// FeedbackService 意见反馈业务逻辑（1.1.0）
// 任何登录用户可提交；管理员/班主任可查看、更新状态、同步到 GitHub Issues。
type FeedbackService struct {
	db        *gorm.DB
	ghToken   string
	ghRepo    string
	ghEnabled bool
	client    *http.Client
}

// NewFeedbackService 构造 FeedbackService
func NewFeedbackService(db *gorm.DB, ghToken, ghRepo string) *FeedbackService {
	return &FeedbackService{
		db:        db,
		ghToken:   ghToken,
		ghRepo:    ghRepo,
		ghEnabled: ghToken != "" && ghRepo != "",
		client:    &http.Client{Timeout: 15 * time.Second},
	}
}

// GitHubEnabled 是否已配置 GitHub（供前端显示"同步到 Issues"按钮是否可用）
func (s *FeedbackService) GitHubEnabled() bool { return s.ghEnabled }

// GitHubRepo 返回已配置的仓库名（owner/repo）
func (s *FeedbackService) GitHubRepo() string { return s.ghRepo }

// IssueURL 构造 GitHub Issue 访问地址
func (s *FeedbackService) IssueURL(num int) string {
	if s.ghRepo == "" || num <= 0 {
		return ""
	}
	return "https://github.com/" + s.ghRepo + "/issues/" + itoa(num)
}

// CreateFeedbackInput 提交意见入参
type CreateFeedbackInput struct {
	Content string `json:"content" binding:"required"`
	Contact string `json:"contact"`
}

// Create 提交意见
func (s *FeedbackService) Create(userID int64, userName, userRole string, in CreateFeedbackInput) (*model.Feedback, error) {
	if in.Content == "" {
		return nil, errcode.ErrBadRequest
	}
	fb := &model.Feedback{
		UserID:   userID,
		UserName: userName,
		UserRole: userRole,
		Content:  in.Content,
		Contact:  in.Contact,
		Status:   model.FeedbackOpen,
	}
	if err := s.db.Create(fb).Error; err != nil {
		return nil, errcode.ErrInternal
	}
	return fb, nil
}

// FeedbackQuery 反馈查询条件
type FeedbackQuery struct {
	Page     int
	PageSize int
	Status   string
	Keyword  string
}

// List 分页查询反馈（管理员/班主任）
func (s *FeedbackService) List(q FeedbackQuery) ([]model.Feedback, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 || q.PageSize > 200 {
		q.PageSize = 20
	}
	tx := s.db.Model(&model.Feedback{})
	if q.Status != "" {
		tx = tx.Where("status = ?", q.Status)
	}
	if q.Keyword != "" {
		kw := "%" + q.Keyword + "%"
		tx = tx.Where("content LIKE ? OR user_name LIKE ?", kw, kw)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, errcode.ErrInternal
	}
	var list []model.Feedback
	if err := tx.Order("created_at DESC").
		Offset((q.Page - 1) * q.PageSize).
		Limit(q.PageSize).
		Find(&list).Error; err != nil {
		return nil, 0, errcode.ErrInternal
	}
	if list == nil {
		list = []model.Feedback{}
	}
	return list, total, nil
}

// UpdateStatus 更新反馈状态
func (s *FeedbackService) UpdateStatus(id int64, status string) (*model.Feedback, error) {
	var fb model.Feedback
	if err := s.db.First(&fb, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errcode.ErrNotFound
		}
		return nil, errcode.ErrInternal
	}
	if err := s.db.Model(&model.Feedback{}).Where("id = ?", id).
		Updates(map[string]interface{}{"status": status, "updated_at": time.Now()}).Error; err != nil {
		return nil, errcode.ErrInternal
	}
	fb.Status = status
	return &fb, nil
}

// SyncToGitHub 将反馈同步为 GitHub Issue，返回 issue 编号
// 需在 config 中配置 github.token 与 github.repo
func (s *FeedbackService) SyncToGitHub(id int64) (int, error) {
	if !s.ghEnabled {
		return 0, errcode.New(50001, "未配置 GitHub 集成（缺少 token/repo），请联系管理员配置", 400)
	}
	var fb model.Feedback
	if err := s.db.First(&fb, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, errcode.ErrNotFound
		}
		return 0, errcode.ErrInternal
	}
	if fb.GithubIssueNum > 0 {
		return fb.GithubIssueNum, nil // 已同步过，直接返回
	}

	title := "【意见反馈#" + itoa(int(fb.ID)) + "】" + truncateStr(fb.Content, 40)
	body := fmt.Sprintf("**反馈人**：%s（%s）\n\n**联系方式**：%s\n\n**内容**：\n\n%s\n\n---\n\n*由班级量化考核管理系统自动同步*",
		fb.UserName, fb.UserRole, fb.Contact, fb.Content)
	payload, _ := json.Marshal(map[string]interface{}{
		"title": title,
		"body":  body,
	})
	url := fmt.Sprintf("https://api.github.com/repos/%s/issues", s.ghRepo)
	req, err := http.NewRequest("POST", url, bytes.NewReader(payload))
	if err != nil {
		return 0, errcode.New(50002, "构造 GitHub 请求失败", 500)
	}
	req.Header.Set("Authorization", "Bearer "+s.ghToken)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		return 0, errcode.New(50003, "连接 GitHub 失败，请检查网络或 Token", 500)
	}
	defer resp.Body.Close()
	bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode != http.StatusCreated {
		return 0, errcode.New(50004, fmt.Sprintf("GitHub 创建 Issue 失败（HTTP %d）：%s", resp.StatusCode, truncateStr(string(bodyBytes), 200)), 500)
	}
	var out struct {
		Number int `json:"number"`
	}
	if err := json.Unmarshal(bodyBytes, &out); err != nil {
		return 0, errcode.New(50005, "解析 GitHub 响应失败", 500)
	}
	// 回写 issue 编号与状态
	if err := s.db.Model(&model.Feedback{}).Where("id = ?", id).
		Updates(map[string]interface{}{
			"github_issue_num": out.Number,
			"status":           model.FeedbackProcessing,
			"updated_at":       time.Now(),
		}).Error; err != nil {
		return 0, errcode.ErrInternal
	}
	return out.Number, nil
}

func truncateStr(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "…"
}
