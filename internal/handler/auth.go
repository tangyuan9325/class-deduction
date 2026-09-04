package handler

import (
	"class-deduction/internal/middleware"
	"class-deduction/internal/service"
	"class-deduction/pkg/errcode"
	"class-deduction/pkg/response"

	"github.com/gin-gonic/gin"
)

// AuthHandler 认证相关 HTTP 接口
type AuthHandler struct {
	svc *service.AuthService
}

// NewAuthHandler 构造 AuthHandler
func NewAuthHandler(svc *service.AuthService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

// loginRequest 登录请求体
type loginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	Remember bool   `json:"remember"` // true=保持登录(长有效期)；false=临时登录(短有效期)
}

// Login 用户登录
// POST /api/v1/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	res, err := h.svc.Login(req.Username, req.Password, req.Remember)
	if err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	response.OK(c, res)
}

// Me 获取当前登录用户信息
// GET /api/v1/auth/me
func (h *AuthHandler) Me(c *gin.Context) {
	uid := middleware.UserIDFromContext(c)
	u, err := h.svc.CurrentUser(uid)
	if err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	response.OK(c, u)
}

// changePasswordRequest 修改密码请求体
type changePasswordRequest struct {
	NewPassword string `json:"new_password" binding:"required"`
	RealName    string `json:"real_name"` // 可同时更新真实姓名
}

// ChangePassword 当前登录用户修改密码（首次登录强制改密）
// POST /api/v1/auth/change-password
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	uid := middleware.UserIDFromContext(c)
	if err := h.svc.ChangePassword(uid, req.NewPassword, req.RealName); err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	response.OK(c, gin.H{"changed": true})
}
