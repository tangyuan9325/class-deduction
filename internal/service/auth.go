package service

import (
	"errors"

	"class-deduction/internal/model"
	"class-deduction/pkg/errcode"
	"class-deduction/pkg/jwt"
	"gorm.io/gorm"
)

// AuthService 认证相关业务逻辑
type AuthService struct {
	db            *gorm.DB
	jwtMgr        *jwt.Manager
	rememberHours int
}

// NewAuthService 构造 AuthService
func NewAuthService(db *gorm.DB, jwtMgr *jwt.Manager, rememberHours int) *AuthService {
	if rememberHours <= 0 {
		rememberHours = 720
	}
	return &AuthService{db: db, jwtMgr: jwtMgr, rememberHours: rememberHours}
}

// LoginResult 登录成功后返回的数据结构
type LoginResult struct {
	Token              string `json:"token"`
	UserID             int64  `json:"user_id"`
	Username           string `json:"username"`
	RealName           string `json:"real_name"`
	Role               string `json:"role"`
	MustChangePassword bool   `json:"must_change_password"` // 首次登录需强制修改密码
	Remember           bool   `json:"remember"`             // 是否为"保持登录"（长有效期）
	ExpireHours        int    `json:"expire_hours"`         // token 有效期（小时）
}

// Login 校验账号密码并签发 token
// remember=true 表示"保持登录"（长有效期）；false 表示"临时登录"（短有效期）
func (s *AuthService) Login(username, password string, remember bool) (*LoginResult, error) {
	if username == "" || password == "" {
		return nil, errcode.ErrBadRequest
	}
	var u model.User
	err := s.db.Where("username = ?", username).First(&u).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errcode.ErrUserNotFound
		}
		return nil, errcode.ErrInternal
	}
	if !u.CheckPassword(password) {
		return nil, errcode.ErrPasswordWrong
	}
	expireHours := s.jwtExpireHours()
	if remember {
		expireHours = s.rememberHours
	}
	token, err := s.jwtMgr.GenerateWithExpiryHours(u.ID, u.Role, u.Username, expireHours)
	if err != nil {
		return nil, errcode.ErrInternal
	}
	return &LoginResult{
		Token:              token,
		UserID:             u.ID,
		Username:           u.Username,
		RealName:           u.RealName,
		Role:               u.Role,
		MustChangePassword: u.MustChangePassword,
		Remember:           remember,
		ExpireHours:        expireHours,
	}, nil
}

func (s *AuthService) jwtExpireHours() int {
	// 默认临时登录 2 小时（与 config 默认一致）
	return 2
}

// CurrentUser 根据 ID 获取当前用户信息（供 me 接口使用）
func (s *AuthService) CurrentUser(userID int64) (*model.User, error) {
	var u model.User
	err := s.db.First(&u, userID).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errcode.ErrUserNotFound
		}
		return nil, errcode.ErrInternal
	}
	return &u, nil
}

// ChangePassword 修改当前用户密码（首次登录强制改密等场景）
// 同时可更新真实姓名（"更换账号为每个人的名字"由姓名体现）；改密后清除强制改密标志
func (s *AuthService) ChangePassword(userID int64, newPassword, realName string) error {
	if newPassword == "" {
		return errcode.ErrBadRequest
	}
	var u model.User
	if err := s.db.First(&u, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errcode.ErrUserNotFound
		}
		return errcode.ErrInternal
	}
	if err := u.SetPassword(newPassword); err != nil {
		return errcode.ErrInternal
	}
	if realName != "" {
		u.RealName = realName
	}
	u.MustChangePassword = false
	if err := s.db.Save(&u).Error; err != nil {
		return errcode.ErrInternal
	}
	return nil
}
