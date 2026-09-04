package repo

import (
	"errors"

	"class-deduction/internal/model"

	"gorm.io/gorm"
)

// UserRepo 用户数据访问层
type UserRepo struct {
	db *gorm.DB
}

// NewUserRepo 构造 UserRepo
func NewUserRepo(db *gorm.DB) *UserRepo {
	return &UserRepo{db: db}
}

// UserQuery 用户查询条件
type UserQuery struct {
	Page     int
	PageSize int
	Role     string
	ClassID  int64
	Keyword  string // 按姓名或账号模糊搜索
}

// List 分页查询用户
func (r *UserRepo) List(q UserQuery) ([]model.User, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 || q.PageSize > 500 {
		q.PageSize = 20
	}
	tx := r.db.Model(&model.User{})
	if q.Role != "" {
		tx = tx.Where("role = ?", q.Role)
	}
	if q.ClassID > 0 {
		tx = tx.Where("class_id = ?", q.ClassID)
	}
	if q.Keyword != "" {
		kw := "%" + q.Keyword + "%"
		tx = tx.Where("real_name LIKE ? OR username LIKE ?", kw, kw)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.User
	if err := tx.Order("id ASC").
		Offset((q.Page - 1) * q.PageSize).
		Limit(q.PageSize).
		Find(&list).Error; err != nil {
		return nil, 0, err
	}
	return list, total, nil
}

// ListStudents 查询全部学生（供录入页穿梭框使用，不分页）
func (r *UserRepo) ListStudents(classID int64) ([]model.User, error) {
	var list []model.User
	tx := r.db.Where("role = ?", model.RoleStudent)
	if classID > 0 {
		tx = tx.Where("class_id = ?", classID)
	}
	err := tx.Order("id ASC").Find(&list).Error
	return list, err
}

// FindByID 按 ID 查询
func (r *UserRepo) FindByID(id int64) (*model.User, error) {
	var u model.User
	err := r.db.First(&u, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}
	return &u, nil
}

// FindByIDs 按 ID 批量查询
func (r *UserRepo) FindByIDs(ids []int64) ([]model.User, error) {
	var list []model.User
	if len(ids) == 0 {
		return list, nil
	}
	err := r.db.Where("id IN ?", ids).Find(&list).Error
	return list, err
}

// Create 创建用户
func (r *UserRepo) Create(u *model.User) error {
	return r.db.Create(u).Error
}

// Update 更新用户（零值字段会被忽略）
func (r *UserRepo) Update(u *model.User) error {
	return r.db.Model(&model.User{}).Where("id = ?", u.ID).
		Updates(map[string]interface{}{
			"real_name": u.RealName,
			"role":      u.Role,
			"class_id":  u.ClassID,
		}).Error
}

// UpdatePassword 更新密码
func (r *UserRepo) UpdatePassword(id int64, hashed string) error {
	return r.db.Model(&model.User{}).Where("id = ?", id).
		Update("password", hashed).Error
}

// UpdatePasswordAndFlag 更新密码并设置/清除强制改密标志
func (r *UserRepo) UpdatePasswordAndFlag(id int64, hashed string, mustChange bool) error {
	return r.db.Model(&model.User{}).Where("id = ?", id).
		Updates(map[string]interface{}{
			"password":             hashed,
			"must_change_password": mustChange,
		}).Error
}

// Delete 软删除
func (r *UserRepo) Delete(id int64) error {
	return r.db.Delete(&model.User{}, id).Error
}

// CountByUsername 统计同名账号数量（判断账号是否已存在）
func (r *UserRepo) CountByUsername(username string, excludeID int64) (int64, error) {
	var cnt int64
	tx := r.db.Model(&model.User{}).Where("username = ?", username)
	if excludeID > 0 {
		tx = tx.Where("id <> ?", excludeID)
	}
	return cnt, tx.Count(&cnt).Error
}
