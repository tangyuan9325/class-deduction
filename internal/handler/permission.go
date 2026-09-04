package handler

import (
	"strconv"

	"class-deduction/internal/middleware"
	"class-deduction/internal/realtime"
	"class-deduction/internal/service"
	"class-deduction/pkg/errcode"
	"class-deduction/pkg/response"

	"github.com/gin-gonic/gin"
)

// PermissionHandler 扣分权限 HTTP 接口
type PermissionHandler struct {
	svc *service.PermissionService
}

// NewPermissionHandler 构造 PermissionHandler
func NewPermissionHandler(svc *service.PermissionService) *PermissionHandler {
	return &PermissionHandler{svc: svc}
}

// Me 当前登录用户自己的权限信息（学生用于判断是否有"查看班级"权限）
// GET /api/v1/permissions/me
func (h *PermissionHandler) Me(c *gin.Context) {
	uid := middleware.UserIDFromContext(c)
	role := middleware.RoleFromContext(c)
	cats, err := h.svc.ListByUser(uid)
	if err != nil {
		cats = []string{}
	}
	response.OK(c, gin.H{
		"user_id":          uid,
		"role":             role,
		"categories":       cats,
		"can_view_all":     h.svc.CanViewAllStats(uid, role),
		"can_view_records": h.svc.CanViewRecords(uid, role),
	})
}

// GetUserPermissions 查询某用户的扣分权限（管理员 / 班主任）
// GET /api/v1/permissions/user/:id
func (h *PermissionHandler) GetUserPermissions(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	cats, err := h.svc.ListByUser(id)
	if err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	response.OK(c, gin.H{"user_id": id, "categories": cats})
}

// SetUserPermissions 设置某用户的扣分权限（管理员 / 班主任）
// PUT /api/v1/permissions/user/:id  body: {"categories": ["学习","寝室"]}
func (h *PermissionHandler) SetUserPermissions(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	var req service.SetUserPermissionsInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	if err := h.svc.SetPermissions(id, middleware.UserIDFromContext(c), req.Categories); err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	realtime.Publish("users")
	response.OK(c, gin.H{"user_id": id, "categories": req.Categories})
}
