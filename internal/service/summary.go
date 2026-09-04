package service

import (
	"time"

	"class-deduction/internal/model"
	"gorm.io/gorm"
)

// SummaryService 小结与汇总业务逻辑（1.1.0）
// 覆盖：班级/个人 周小结、学期小结；每个同学 每日/每周/每月 扣分点汇总
type SummaryService struct {
	db            *gorm.DB
	semesterStart string
}

// NewSummaryService 构造 SummaryService
func NewSummaryService(db *gorm.DB, semesterStart string) *SummaryService {
	return &SummaryService{db: db, semesterStart: semesterStart}
}

// ========== 周小结 / 学期小结 ==========

// SummaryScope 小结范围
const (
	SummaryScopeClass    = "class"    // 班级小结
	SummaryScopePersonal = "personal" // 个人小结
)

// SummaryPeriod 小结周期
const (
	SummaryPeriodWeek     = "week"     // 周小结
	SummaryPeriodSemester = "semester" // 学期小结
)

// CategorySummary 单类别汇总
type CategorySummary struct {
	Category    string `json:"category"`
	Count       int64  `json:"count"`
	DeductScore int    `json:"deduct_score"` // 扣分合计（负数）
	BonusScore  int    `json:"bonus_score"`  // 加分合计（正数）
	DeductCount int64  `json:"deduct_count"`
	BonusCount  int64  `json:"bonus_count"`
}

// SummaryStudent 学生维度的汇总行
type SummaryStudent struct {
	TargetUserID int64  `json:"target_user_id"`
	TargetName   string `json:"target_name"`
	Count        int64  `json:"count"`
	DeductScore  int    `json:"deduct_score"`
	BonusScore   int    `json:"bonus_score"`
	NetScore     int    `json:"net_score"`
}

// SummaryResult 小结结果
type SummaryResult struct {
	Scope       string            `json:"scope"`
	Period      string            `json:"period"`
	PeriodLabel string            `json:"period_label"`
	StartDate   string            `json:"start_date"`
	EndDate     string            `json:"end_date"`
	UserID      int64             `json:"user_id,omitempty"`
	UserName    string            `json:"user_name,omitempty"`
	TotalDeduct int               `json:"total_deduct"` // 扣分合计（负数）
	TotalBonus  int               `json:"total_bonus"`  // 加分合计（正数）
	NetScore    int               `json:"net_score"`    // 净分 = 扣分+加分
	TotalCount  int64             `json:"total_count"`
	ByCategory  []CategorySummary `json:"by_category"`
	TopDeduct   []SummaryStudent  `json:"top_deduct"` // 扣分最多的同学（负数绝对值大）
	TopBonus    []SummaryStudent  `json:"top_bonus"`  // 加分最多的同学
}

// periodRange 计算指定周期的起止时间
// period: week=本周一~今天（或结束日期）；semester=学期开始~今天
func (s *SummaryService) periodRange(period string, start, end *time.Time) (time.Time, time.Time) {
	now := time.Now()
	var from, to time.Time
	switch period {
	case SummaryPeriodSemester:
		// 学期起始：优先配置的 semester_start，否则取最早记录日期，再否则取当前日期
		from = now
		if s.semesterStart != "" {
			if t, err := time.ParseInLocation("2006-01-02", s.semesterStart, time.Local); err == nil {
				from = t
			}
		}
		if start != nil {
			from = *start
		}
		to = now
		if end != nil {
			to = *end
		}
	case SummaryPeriodWeek:
		// 本周一
		wd := (int(now.Weekday()) + 6) % 7 // 周一=0
		from = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local).AddDate(0, 0, -wd)
		if start != nil {
			from = *start
		}
		to = now
		if end != nil {
			to = *end
		}
	default:
		from = now
		to = now
	}
	// to 截止到当天 23:59:59
	to = time.Date(to.Year(), to.Month(), to.Day(), 23, 59, 59, 0, time.Local)
	return from, to
}

// periodLabel 生成周期展示文案
func (s *SummaryService) periodLabel(period string, from, to time.Time) string {
	switch period {
	case SummaryPeriodWeek:
		return "第" + weekNumberOfYear(from) + "周（" + from.Format("01-02") + " ~ " + to.Format("01-02") + "）"
	case SummaryPeriodSemester:
		return "本学期（" + from.Format("2006-01-02") + " 起）"
	default:
		return ""
	}
}

func weekNumberOfYear(t time.Time) string {
	_, w := t.ISOWeek()
	return itoa(w)
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var b [8]byte
	pos := len(b)
	neg := false
	if i < 0 {
		neg = true
		i = -i
	}
	for i > 0 {
		pos--
		b[pos] = byte('0' + i%10)
		i /= 10
	}
	if neg {
		pos--
		b[pos] = '-'
	}
	return string(b[pos:])
}

// Summary 生成周小结 / 学期小结
// scope: class / personal；period: week / semester
// userID 在 personal 时指定学生；class 时用于判断可查看
func (s *SummaryService) Summary(scope, period string, userID int64, start, end *time.Time) (*SummaryResult, error) {
	from, to := s.periodRange(period, start, end)
	res := &SummaryResult{
		Scope:       scope,
		Period:      period,
		PeriodLabel: s.periodLabel(period, from, to),
		StartDate:   from.Format("2006-01-02"),
		EndDate:     to.Format("2006-01-02"),
		ByCategory:  []CategorySummary{},
		TopDeduct:   []SummaryStudent{},
		TopBonus:    []SummaryStudent{},
	}

	base := s.db.Model(&model.DeductionRecord{}).Where("record_date >= ?", from).Where("record_date <= ?", to)
	if scope == SummaryScopePersonal {
		base = base.Where("target_user_id = ?", userID)
		var u model.User
		if err := s.db.First(&u, userID).Error; err == nil {
			res.UserID = u.ID
			res.UserName = u.RealName
		}
	}

	// 总扣分/总加分/总数
	var agg struct {
		DeductScore int   `gorm:"column:deduct_score"`
		BonusScore  int   `gorm:"column:bonus_score"`
		TotalCount  int64 `gorm:"column:total_count"`
	}
	if err := base.Select(
		"COALESCE(SUM(CASE WHEN score < 0 THEN score ELSE 0 END),0) as deduct_score, " +
			"COALESCE(SUM(CASE WHEN score > 0 THEN score ELSE 0 END),0) as bonus_score, " +
			"COUNT(*) as total_count",
	).Scan(&agg).Error; err != nil {
		return nil, err
	}
	res.TotalDeduct = agg.DeductScore
	res.TotalBonus = agg.BonusScore
	res.NetScore = agg.DeductScore + agg.BonusScore
	res.TotalCount = agg.TotalCount

	// 按类别汇总
	var cats []CategorySummary
	if err := base.Select(
		"category, COUNT(*) as count, " +
			"COALESCE(SUM(CASE WHEN score < 0 THEN score ELSE 0 END),0) as deduct_score, " +
			"COALESCE(SUM(CASE WHEN score > 0 THEN score ELSE 0 END),0) as bonus_score, " +
			"COALESCE(SUM(CASE WHEN score < 0 THEN 1 ELSE 0 END),0) as deduct_count, " +
			"COALESCE(SUM(CASE WHEN score > 0 THEN 1 ELSE 0 END),0) as bonus_count",
	).Group("category").Scan(&cats).Error; err != nil {
		return nil, err
	}
	if cats == nil {
		cats = []CategorySummary{}
	}
	res.ByCategory = cats

	// 扣分最多的同学 TOP5（个人小结不展示）
	if scope == SummaryScopeClass {
		var topD []SummaryStudent
		if err := base.Select("target_user_id, MAX(target_name) as target_name, COUNT(*) as count, " +
			"COALESCE(SUM(score),0) as net_score, " +
			"COALESCE(SUM(CASE WHEN score < 0 THEN score ELSE 0 END),0) as deduct_score, " +
			"COALESCE(SUM(CASE WHEN score > 0 THEN score ELSE 0 END),0) as bonus_score").
			Where("target_user_id > 0").Group("target_user_id").Order("deduct_score ASC").Limit(5).
			Scan(&topD).Error; err != nil {
			return nil, err
		}
		if topD == nil {
			topD = []SummaryStudent{}
		}
		res.TopDeduct = topD

		var topB []SummaryStudent
		if err := base.Select("target_user_id, MAX(target_name) as target_name, COUNT(*) as count, " +
			"COALESCE(SUM(score),0) as net_score, " +
			"COALESCE(SUM(CASE WHEN score < 0 THEN score ELSE 0 END),0) as deduct_score, " +
			"COALESCE(SUM(CASE WHEN score > 0 THEN score ELSE 0 END),0) as bonus_score").
			Where("target_user_id > 0").Group("target_user_id").Order("bonus_score DESC").Limit(5).
			Scan(&topB).Error; err != nil {
			return nil, err
		}
		if topB == nil {
			topB = []SummaryStudent{}
		}
		res.TopBonus = topB
	}
	return res, nil
}

// ========== 每日 / 每周 / 每月 同学扣分汇总 ==========

// StudentSummaryPeriod 汇总周期
const (
	StuSummaryDaily   = "daily"
	StuSummaryWeekly  = "weekly"
	StuSummaryMonthly = "monthly"
)

// StudentSummaryRow 单个同学的汇总行
type StudentSummaryRow struct {
	UserID      int64          `json:"user_id"`
	RealName    string         `json:"real_name"`
	Username    string         `json:"username"`
	ClassID     int64          `json:"class_id"`
	RecordCount int64          `json:"record_count"`
	DeductScore int            `json:"deduct_score"` // 扣分合计（负数）
	BonusScore  int            `json:"bonus_score"`  // 加分合计（正数）
	NetScore    int            `json:"net_score"`
	ByCategory  map[string]int `json:"by_category"` // 类别 -> 净分
}

// StudentSummaryResult 汇总结果
type StudentSummaryResult struct {
	Period      string              `json:"period"`
	PeriodLabel string              `json:"period_label"`
	StartDate   string              `json:"start_date"`
	EndDate     string              `json:"end_date"`
	Rows        []StudentSummaryRow `json:"rows"`
}

// studentRange 计算每日/每周/每月的默认时间范围
func (s *SummaryService) studentRange(period string, start, end *time.Time) (time.Time, time.Time) {
	now := time.Now()
	var from time.Time
	switch period {
	case StuSummaryDaily:
		from = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	case StuSummaryWeekly:
		wd := (int(now.Weekday()) + 6) % 7
		from = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local).AddDate(0, 0, -wd)
	case StuSummaryMonthly:
		from = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.Local)
	default:
		from = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	}
	if start != nil {
		from = *start
	}
	to := now
	if end != nil {
		to = *end
	}
	to = time.Date(to.Year(), to.Month(), to.Day(), 23, 59, 59, 0, time.Local)
	return from, to
}

func (s *SummaryService) studentPeriodLabel(period string, from, to time.Time) string {
	switch period {
	case StuSummaryDaily:
		return from.Format("2006-01-02")
	case StuSummaryWeekly:
		return "第" + weekNumberOfYear(from) + "周（" + from.Format("01-02") + " ~ " + to.Format("01-02") + "）"
	case StuSummaryMonthly:
		return from.Format("2006年01月")
	default:
		return ""
	}
}

// StudentSummary 每个同学的 每日/每周/每月 扣分点汇总
// period: daily / weekly / monthly；classID 可选（0=全部班级）；userID 可选（>0 只看某位同学）
func (s *SummaryService) StudentSummary(period string, start, end *time.Time, classID, userID int64) (*StudentSummaryResult, error) {
	from, to := s.studentRange(period, start, end)
	res := &StudentSummaryResult{
		Period:      period,
		PeriodLabel: s.studentPeriodLabel(period, from, to),
		StartDate:   from.Format("2006-01-02"),
		EndDate:     to.Format("2006-01-02"),
		Rows:        []StudentSummaryRow{},
	}

	// 全部学生
	users := s.db.Model(&model.User{}).Where("role = ?", model.RoleStudent)
	if classID > 0 {
		users = users.Where("class_id = ?", classID)
	}
	if userID > 0 {
		users = users.Where("id = ?", userID)
	}
	var stuList []model.User
	if err := users.Order("id ASC").Find(&stuList).Error; err != nil {
		return nil, err
	}
	if len(stuList) == 0 {
		return res, nil
	}

	// 批量查询区间内的记录（按学生分组聚合）
	type recAgg struct {
		TargetUserID int64  `gorm:"column:target_user_id"`
		Category     string `gorm:"column:category"`
		DeductScore  int    `gorm:"column:deduct_score"`
		BonusScore   int    `gorm:"column:bonus_score"`
		NetScore     int    `gorm:"column:net_score"`
		Count        int64  `gorm:"column:count"`
	}
	var aggs []recAgg
	if err := s.db.Model(&model.DeductionRecord{}).
		Select("target_user_id, category, "+
			"COALESCE(SUM(CASE WHEN score < 0 THEN score ELSE 0 END),0) as deduct_score, "+
			"COALESCE(SUM(CASE WHEN score > 0 THEN score ELSE 0 END),0) as bonus_score, "+
			"COALESCE(SUM(score),0) as net_score, COUNT(*) as count").
		Where("record_date >= ?", from).Where("record_date <= ?", to).
		Where("target_user_id > 0").
		Group("target_user_id, category").Scan(&aggs).Error; err != nil {
		return nil, err
	}

	rowMap := make(map[int64]*StudentSummaryRow, len(stuList))
	for _, u := range stuList {
		rowMap[u.ID] = &StudentSummaryRow{
			UserID:     u.ID,
			RealName:   u.RealName,
			Username:   u.Username,
			ClassID:    u.ClassID,
			ByCategory: map[string]int{},
		}
	}
	for _, a := range aggs {
		row, ok := rowMap[a.TargetUserID]
		if !ok {
			continue
		}
		row.RecordCount += a.Count
		row.DeductScore += a.DeductScore
		row.BonusScore += a.BonusScore
		row.NetScore += a.NetScore
		row.ByCategory[a.Category] += a.NetScore
	}
	for _, u := range stuList {
		res.Rows = append(res.Rows, *rowMap[u.ID])
	}
	return res, nil
}
