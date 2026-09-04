package service

import (
	"class-deduction/internal/model"
	"gorm.io/gorm"
)

// MetaService 应用元信息业务逻辑（版本 / 更新日志 / 学期开始日期 / 克隆仓库引导）
type MetaService struct {
	db            *gorm.DB
	repoURL       string
	semesterStart string
}

// NewMetaService 构造 MetaService
func NewMetaService(db *gorm.DB, repoURL, semesterStart string) *MetaService {
	return &MetaService{db: db, repoURL: repoURL, semesterStart: semesterStart}
}

// MetaResult 元信息返回结构
type MetaResult struct {
	Version          string   `json:"version"`
	Name             string   `json:"name"`
	RepoURL          string   `json:"repo_url"`
	CloneCommand     string   `json:"clone_command"`
	SemesterStart    string   `json:"semester_start"`
	Changelog        []string `json:"changelog"`
	HasSeenChangelog bool     `json:"has_seen_changelog"`
}

// GetMeta 获取应用元信息，并根据当前用户是否已读本次更新日志返回 has_seen_changelog
func (s *MetaService) GetMeta(userID int64) (*MetaResult, error) {
	semester := s.semesterStart
	if semester == "" {
		var m model.AppMeta
		if err := s.db.Where("key = ?", model.MetaKeySemesterStart).First(&m).Error; err == nil {
			semester = m.Value
		}
	}
	var u model.User
	seen := false
	if err := s.db.First(&u, userID).Error; err == nil {
		seen = u.SeenChangelogVersion == model.AppVersion
	}
	return &MetaResult{
		Version:          model.AppVersion,
		Name:             model.AppName,
		RepoURL:          s.repoURL,
		CloneCommand:     "git clone " + s.repoURL,
		SemesterStart:    semester,
		Changelog:        model.Changelog,
		HasSeenChangelog: seen,
	}, nil
}

// MarkSeenChangelog 记录当前用户已读当前版本更新日志
func (s *MetaService) MarkSeenChangelog(userID int64) error {
	return s.db.Model(&model.User{}).Where("id = ?", userID).
		Update("seen_changelog_version", model.AppVersion).Error
}
