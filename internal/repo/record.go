package repo

import (
	"errors"
	"time"

	"class-deduction/internal/model"

	"gorm.io/gorm"
)

// RecordRepo 扣分记录数据访问层
type RecordRepo struct {
	db *gorm.DB
}

// NewRecordRepo 构造 RecordRepo
func NewRecordRepo(db *gorm.DB) *RecordRepo {
	return &RecordRepo{db: db}
}

// RecordQuery 查询条件
type RecordQuery struct {
	Page          int        // 页码，从 1 开始
	PageSize      int        // 每页条数
	Category      string     // 扣分类别：学习 / 寝室 / 日常 / 两操
	SubjectOrItem string     // 科目或项目
	TargetUserID  int64      // 指定学生
	OperatorID    int64      // 操作人
	StartDate     *time.Time // 记录日期起
	EndDate       *time.Time // 记录日期止
}

// BatchCreate 批量创建扣分记录，使用事务保证原子性
func (r *RecordRepo) BatchCreate(records []*model.DeductionRecord) error {
	if len(records) == 0 {
		return errors.New("no records to create")
	}
	return r.db.Transaction(func(tx *gorm.DB) error {
		return tx.Create(&records).Error
	})
}

// List 分页查询扣分记录，按创建时间倒序
func (r *RecordRepo) List(q RecordQuery) ([]model.DeductionRecord, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 || q.PageSize > 500 {
		q.PageSize = 20
	}

	tx := r.db.Model(&model.DeductionRecord{})
	if q.Category != "" {
		tx = tx.Where("category = ?", q.Category)
	}
	if q.SubjectOrItem != "" {
		tx = tx.Where("subject_or_item = ?", q.SubjectOrItem)
	}
	if q.TargetUserID > 0 {
		tx = tx.Where("target_user_id = ?", q.TargetUserID)
	}
	if q.OperatorID > 0 {
		tx = tx.Where("operator_user_id = ?", q.OperatorID)
	}
	if q.StartDate != nil {
		tx = tx.Where("record_date >= ?", *q.StartDate)
	}
	if q.EndDate != nil {
		tx = tx.Where("record_date <= ?", *q.EndDate)
	}

	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var list []model.DeductionRecord
	if err := tx.Order("created_at DESC").
		Offset((q.Page - 1) * q.PageSize).
		Limit(q.PageSize).
		Find(&list).Error; err != nil {
		return nil, 0, err
	}
	return list, total, nil
}

// FindByID 按 ID 查询单条记录
func (r *RecordRepo) FindByID(id int64) (*model.DeductionRecord, error) {
	var rec model.DeductionRecord
	err := r.db.First(&rec, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}
	return &rec, nil
}

// Delete 软删除单条记录
func (r *RecordRepo) Delete(id int64) error {
	return r.db.Delete(&model.DeductionRecord{}, id).Error
}
