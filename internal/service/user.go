package service

import (
	"errors"
	"strings"

	"class-deduction/internal/model"
	"class-deduction/internal/repo"
	"class-deduction/pkg/errcode"

	"gorm.io/gorm"
)

// UserService 用户管理业务逻辑层
type UserService struct {
	repo *repo.UserRepo
}

// NewUserService 构造 UserService
func NewUserService(r *repo.UserRepo) *UserService {
	return &UserService{repo: r}
}

// CreateUserInput 创建用户入参
type CreateUserInput struct {
	Username string `json:"username"`
	Password string `json:"password"`
	RealName string `json:"real_name"`
	Role     string `json:"role"`
	ClassID  int64  `json:"class_id"`
}

// UpdateUserInput 更新用户入参
type UpdateUserInput struct {
	RealName string `json:"real_name"`
	Role     string `json:"role"`
	ClassID  int64  `json:"class_id"`
}

// ResetPasswordInput 重置密码入参
type ResetPasswordInput struct {
	Password string `json:"password"`
}

// normalizeRole 校验角色，默认学生
func normalizeRole(role string) string {
	switch strings.ToLower(role) {
	case model.RoleAdmin:
		return model.RoleAdmin
	case model.RoleTeacher:
		return model.RoleTeacher
	case model.RoleViewer:
		return model.RoleViewer
	default:
		return model.RoleStudent
	}
}

// List 分页查询用户
func (s *UserService) List(q repo.UserQuery) ([]model.User, int64, error) {
	return s.repo.List(q)
}

// ListStudents 查询学生列表
func (s *UserService) ListStudents(classID int64) ([]model.User, error) {
	return s.repo.ListStudents(classID)
}

// Create 创建用户
func (s *UserService) Create(in CreateUserInput) (*model.User, error) {
	if in.Username == "" || in.Password == "" {
		return nil, errcode.ErrBadRequest
	}
	cnt, err := s.repo.CountByUsername(in.Username, 0)
	if err != nil {
		return nil, errcode.ErrInternal
	}
	if cnt > 0 {
		return nil, errcode.ErrUserExists
	}
	role := normalizeRole(in.Role)
	u := &model.User{
		Username:           in.Username,
		RealName:           in.RealName,
		Role:               role,
		ClassID:            in.ClassID,
		MustChangePassword: role == model.RoleStudent, // 学生首次登录需强制修改密码
	}
	// 1.1.0：viewer（看板只读账号）不强制改密，保证直接可用；可由管理员重置密码
	if role == model.RoleViewer {
		u.MustChangePassword = false
	}
	if err := u.SetPassword(in.Password); err != nil {
		return nil, errcode.ErrInternal
	}
	if err := s.repo.Create(u); err != nil {
		return nil, errcode.ErrInternal
	}
	return u, nil
}

// Update 更新用户基本信息
func (s *UserService) Update(id int64, in UpdateUserInput) (*model.User, error) {
	u, err := s.repo.FindByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errcode.ErrUserNotFound
		}
		return nil, errcode.ErrInternal
	}
	u.RealName = in.RealName
	// 角色未传时保持原角色，避免编辑姓名/班级时误改权限角色
	if in.Role != "" {
		u.Role = normalizeRole(in.Role)
	}
	u.ClassID = in.ClassID
	if err := s.repo.Update(u); err != nil {
		return nil, errcode.ErrInternal
	}
	return u, nil
}

// ResetPassword 重置密码（学生重置后需再次登录修改密码）
func (s *UserService) ResetPassword(id int64, password string) error {
	if password == "" {
		return errcode.ErrBadRequest
	}
	u, err := s.repo.FindByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errcode.ErrUserNotFound
		}
		return errcode.ErrInternal
	}
	if err := u.SetPassword(password); err != nil {
		return errcode.ErrInternal
	}
	// 学生重置密码后需再次登录修改密码；viewer/teacher/admin 重置后不强制
	mustChange := u.Role == model.RoleStudent
	return s.repo.UpdatePasswordAndFlag(id, u.Password, mustChange)
}

// Delete 删除用户，禁止删除自己
func (s *UserService) Delete(id, currentID int64) error {
	if id == currentID {
		return errcode.ErrCannotDeleteSelf
	}
	_, err := s.repo.FindByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errcode.ErrUserNotFound
		}
		return errcode.ErrInternal
	}
	return s.repo.Delete(id)
}
