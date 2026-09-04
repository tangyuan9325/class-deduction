package service

import (
	"time"

	"class-deduction/internal/model"

	"gorm.io/gorm"
)

// StatsService 统计业务逻辑层
type StatsService struct {
	db *gorm.DB
}

// NewStatsService 构造 StatsService
func NewStatsService(db *gorm.DB) *StatsService {
	return &StatsService{db: db}
}

// SubjectStat 按科目/项目聚合
type SubjectStat struct {
	Name  string `json:"name"`
	Count int64  `json:"count"`
	Score int    `json:"score"` // 累计扣分（负数）
}

// DailyStat 按日期聚合
type DailyStat struct {
	Date  string `json:"date"` // YYYY-MM-DD
	Count int64  `json:"count"`
	Score int    `json:"score"`
}

// RankItem 扣分排名
type RankItem struct {
	TargetUserID int64  `json:"target_user_id"`
	TargetName   string `json:"target_name"`
	Count        int64  `json:"count"`
	Score        int    `json:"score"`
}

// PersonalResult 个人统计结果
type PersonalResult struct {
	TotalScore int                     `json:"total_score"`
	TotalCount int64                   `json:"total_count"`
	BySubject  []SubjectStat           `json:"by_subject"`
	Recent     []model.DeductionRecord `json:"recent"`
}

// Personal 个人统计
func (s *StatsService) Personal(userID int64, start, end *time.Time) (*PersonalResult, error) {
	res := &PersonalResult{
		BySubject: []SubjectStat{},
		Recent:    []model.DeductionRecord{},
	}

	var agg struct {
		TotalScore int   `gorm:"column:total_score"`
		TotalCount int64 `gorm:"column:total_count"`
	}
	tx := s.db.Model(&model.DeductionRecord{}).Where("target_user_id = ?", userID)
	if start != nil {
		tx = tx.Where("record_date >= ?", *start)
	}
	if end != nil {
		tx = tx.Where("record_date <= ?", *end)
	}
	if err := tx.Select("COALESCE(SUM(score),0) as total_score, COUNT(*) as total_count").
		Scan(&agg).Error; err != nil {
		return nil, err
	}
	res.TotalScore = agg.TotalScore
	res.TotalCount = agg.TotalCount

	var subjects []SubjectStat
	tx2 := s.db.Model(&model.DeductionRecord{}).Where("target_user_id = ?", userID)
	if start != nil {
		tx2 = tx2.Where("record_date >= ?", *start)
	}
	if end != nil {
		tx2 = tx2.Where("record_date <= ?", *end)
	}
	if err := tx2.Select("subject_or_item as name, COUNT(*) as count, COALESCE(SUM(score),0) as score").
		Where("subject_or_item <> ''").
		Group("subject_or_item").
		Order("count DESC").
		Scan(&subjects).Error; err != nil {
		return nil, err
	}
	if subjects == nil {
		subjects = []SubjectStat{}
	}
	res.BySubject = subjects

	var recent []model.DeductionRecord
	if err := s.db.Where("target_user_id = ?", userID).
		Order("created_at DESC").Limit(10).Find(&recent).Error; err != nil {
		return nil, err
	}
	if recent == nil {
		recent = []model.DeductionRecord{}
	}
	res.Recent = recent
	return res, nil
}

// OverviewResult 班级看板结果（1.1.0 增加扣分/加分拆分）
type OverviewResult struct {
	TotalScore  int           `json:"total_score"`  // 净分 = 扣分 + 加分
	TotalDeduct int           `json:"total_deduct"` // 扣分合计（负数）
	TotalBonus  int           `json:"total_bonus"`  // 加分合计（正数）
	TotalCount  int64         `json:"total_count"`
	BySubject   []SubjectStat `json:"by_subject"`
	ByDay       []DailyStat   `json:"by_day"`
	TopRank     []RankItem    `json:"top_rank"`
}

// Overview 班级整体看板（每个子查询独立构造，避免 GORM 子句累积）
func (s *StatsService) Overview(start, end *time.Time) (*OverviewResult, error) {
	res := &OverviewResult{
		BySubject: []SubjectStat{},
		ByDay:     []DailyStat{},
		TopRank:   []RankItem{},
	}

	var agg struct {
		TotalScore  int   `gorm:"column:total_score"`
		TotalDeduct int   `gorm:"column:total_deduct"`
		TotalBonus  int   `gorm:"column:total_bonus"`
		TotalCount  int64 `gorm:"column:total_count"`
	}
	q1 := s.db.Model(&model.DeductionRecord{})
	if start != nil {
		q1 = q1.Where("record_date >= ?", *start)
	}
	if end != nil {
		q1 = q1.Where("record_date <= ?", *end)
	}
	if err := q1.Select("COALESCE(SUM(score),0) as total_score, " +
		"COALESCE(SUM(CASE WHEN score < 0 THEN score ELSE 0 END),0) as total_deduct, " +
		"COALESCE(SUM(CASE WHEN score > 0 THEN score ELSE 0 END),0) as total_bonus, " +
		"COUNT(*) as total_count").
		Scan(&agg).Error; err != nil {
		return nil, err
	}
	res.TotalScore = agg.TotalScore
	res.TotalDeduct = agg.TotalDeduct
	res.TotalBonus = agg.TotalBonus
	res.TotalCount = agg.TotalCount

	var subjects []SubjectStat
	q2 := s.db.Model(&model.DeductionRecord{})
	if start != nil {
		q2 = q2.Where("record_date >= ?", *start)
	}
	if end != nil {
		q2 = q2.Where("record_date <= ?", *end)
	}
	if err := q2.Select("subject_or_item as name, COUNT(*) as count, COALESCE(SUM(score),0) as score").
		Where("subject_or_item <> ''").
		Group("subject_or_item").
		Order("count DESC").
		Scan(&subjects).Error; err != nil {
		return nil, err
	}
	if subjects == nil {
		subjects = []SubjectStat{}
	}
	res.BySubject = subjects

	var daily []DailyStat
	q3 := s.db.Model(&model.DeductionRecord{})
	if start != nil {
		q3 = q3.Where("record_date >= ?", *start)
	}
	if end != nil {
		q3 = q3.Where("record_date <= ?", *end)
	}
	if err := q3.Select("strftime('%Y-%m-%d', record_date) as date, COUNT(*) as count, COALESCE(SUM(score),0) as score").
		Group("date").
		Order("date ASC").
		Scan(&daily).Error; err != nil {
		return nil, err
	}
	if daily == nil {
		daily = []DailyStat{}
	}
	res.ByDay = daily

	var ranks []RankItem
	q4 := s.db.Model(&model.DeductionRecord{})
	if start != nil {
		q4 = q4.Where("record_date >= ?", *start)
	}
	if end != nil {
		q4 = q4.Where("record_date <= ?", *end)
	}
	if err := q4.Select("target_user_id, MAX(target_name) as target_name, COUNT(*) as count, COALESCE(SUM(score),0) as score").
		Where("target_user_id > 0").
		Group("target_user_id").
		Order("score ASC").
		Limit(10).
		Scan(&ranks).Error; err != nil {
		return nil, err
	}
	if ranks == nil {
		ranks = []RankItem{}
	}
	res.TopRank = ranks
	return res, nil
}
