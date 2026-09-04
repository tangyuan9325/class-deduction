package handler

import (
	"strconv"

	"class-deduction/internal/middleware"
	"class-deduction/internal/realtime"
	"class-deduction/internal/repo"
	"class-deduction/internal/service"
	"class-deduction/pkg/errcode"
	"class-deduction/pkg/response"

	"github.com/gin-gonic/gin"
)

// UserHandler 用户管理 HTTP 接口
type UserHandler struct {
	svc *service.UserService
}

// NewUserHandler 构造 UserHandler
func NewUserHandler(svc *service.UserService) *UserHandler {
	return &UserHandler{svc: svc}
}

// List 分页查询用户（管理员/班主任）
// GET /api/v1/users?page=1&page_size=20&role=student&keyword=张
func (h *UserHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	q := repo.UserQuery{
		Page:     page,
		PageSize: pageSize,
		Role:     c.Query("role"),
		Keyword:  c.Query("keyword"),
	}
	if v := c.Query("class_id"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			q.ClassID = id
		}
	}
	list, total, err := h.svc.List(q)
	if err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	response.OKPage(c, list, total, q.Page, q.PageSize)
}

// ListStudents 学生列表（班主任/管理员录入时使用）
// GET /api/v1/users/students?class_id=1
func (h *UserHandler) ListStudents(c *gin.Context) {
	var classID int64
	if v := c.Query("class_id"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			classID = id
		}
	}
	list, err := h.svc.ListStudents(classID)
	if err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	response.OK(c, list)
}

// Create 创建用户（管理员）
// POST /api/v1/users
func (h *UserHandler) Create(c *gin.Context) {
	var req service.CreateUserInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	u, err := h.svc.Create(req)
	if err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	realtime.Publish("users")
	response.OK(c, u)
}

// Update 更新用户基本信息（管理员）
// PUT /api/v1/users/:id
func (h *UserHandler) Update(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	var req service.UpdateUserInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	u, err := h.svc.Update(id, req)
	if err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	realtime.Publish("users")
	response.OK(c, u)
}

// ResetPassword 重置密码（管理员）
// PUT /api/v1/users/:id/password
func (h *UserHandler) ResetPassword(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	var req service.ResetPasswordInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	if err := h.svc.ResetPassword(id, req.Password); err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	realtime.Publish("users")
	response.OK(c, gin.H{"id": id})
}

// Delete 删除用户（管理员，不能删自己）
// DELETE /api/v1/users/:id
func (h *UserHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	if err := h.svc.Delete(id, middleware.UserIDFromContext(c)); err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	realtime.Publish("users")
	response.OK(c, gin.H{"id": id})
}
