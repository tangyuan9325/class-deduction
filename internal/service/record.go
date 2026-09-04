package service

import (
	"errors"
	"time"

	"class-deduction/internal/model"
	"class-deduction/internal/repo"
	"class-deduction/pkg/errcode"

	"gorm.io/gorm"
)

// RecordService 扣分记录业务逻辑层
type RecordService struct {
	repo *repo.RecordRepo
	db   *gorm.DB
}

// NewRecordService 构造 RecordService
func NewRecordService(r *repo.RecordRepo, db *gorm.DB) *RecordService {
	return &RecordService{repo: r, db: db}
}

// BatchCreateInput 批量新增扣分入参
type BatchCreateInput struct {
	TargetUserIDs []int64 `json:"target_user_ids"`
	Category      string  `json:"category"`
	SubjectOrItem string  `json:"subject_or_item"`
	Score         int     `json:"score"`
	Reason        string  `json:"reason"`
	RecordDate    string  `json:"record_date"` // 格式 YYYY-MM-DD，为空则取当天

	OperatorID   int64
	OperatorName string
}

// BatchCreate 批量新增扣分记录
func (s *RecordService) BatchCreate(in BatchCreateInput) ([]model.DeductionRecord, error) {
	if len(in.TargetUserIDs) == 0 {
		return nil, errcode.ErrNoTargetUser
	}
	if in.Category == "" {
		return nil, errcode.ErrCategoryEmpty
	}

	var recordDate time.Time
	if in.RecordDate != "" {
		t, err := time.ParseInLocation("2006-01-02", in.RecordDate, time.Local)
		if err != nil {
			return nil, errcode.ErrBadRequest
		}
		recordDate = t
	} else {
		recordDate = time.Now()
	}

	var students []model.User
	if err := s.db.Where("id IN ?", in.TargetUserIDs).Find(&students).Error; err != nil {
		return nil, errcode.ErrInternal
	}
	nameMap := make(map[int64]string, len(students))
	for _, stu := range students {
		nameMap[stu.ID] = stu.RealName
	}
	if len(nameMap) != len(in.TargetUserIDs) {
		return nil, errcode.New(30004, "存在未知学生 ID，请检查", 400)
	}

	records := make([]*model.DeductionRecord, 0, len(in.TargetUserIDs))
	for _, uid := range in.TargetUserIDs {
		rec := &model.DeductionRecord{
			TargetUserID:   uid,
			TargetName:     nameMap[uid],
			OperatorUserID: in.OperatorID,
			OperatorName:   in.OperatorName,
			Category:       in.Category,
			SubjectOrItem:  in.SubjectOrItem,
			Score:          in.Score,
			Reason:         in.Reason,
			RecordDate:     recordDate,
		}
		records = append(records, rec)
	}

	if err := s.repo.BatchCreate(records); err != nil {
		return nil, errcode.ErrInternal
	}
	out := make([]model.DeductionRecord, len(records))
	for i, r := range records {
		out[i] = *r
	}
	return out, nil
}

// List 分页查询
func (s *RecordService) List(q repo.RecordQuery) ([]model.DeductionRecord, int64, error) {
	return s.repo.List(q)
}

// Delete 删除（撤销）记录，要求管理员调用
func (s *RecordService) Delete(id int64) error {
	_, err := s.repo.FindByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errcode.ErrRecordNotFound
		}
		return errcode.ErrInternal
	}
	return s.repo.Delete(id)
}
