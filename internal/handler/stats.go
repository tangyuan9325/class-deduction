package handler

import (
	"strconv"
	"time"

	"class-deduction/internal/middleware"
	"class-deduction/internal/service"
	"class-deduction/pkg/errcode"
	"class-deduction/pkg/response"

	"github.com/gin-gonic/gin"
)

// StatsHandler 统计 HTTP 接口
type StatsHandler struct {
	svc     *service.StatsService
	permSvc *service.PermissionService
}

// NewStatsHandler 构造 StatsHandler
func NewStatsHandler(svc *service.StatsService, permSvc *service.PermissionService) *StatsHandler {
	return &StatsHandler{svc: svc, permSvc: permSvc}
}

// parseDateRange 解析 start_date / end_date 查询参数为时间指针
func parseDateRange(c *gin.Context) (*time.Time, *time.Time) {
	var start, end *time.Time
	if v := c.Query("start_date"); v != "" {
		if t, err := time.ParseInLocation("2006-01-02", v, time.Local); err == nil {
			start = &t
		}
	}
	if v := c.Query("end_date"); v != "" {
		if t, err := time.ParseInLocation("2006-01-02", v, time.Local); err == nil {
			t = t.Add(24*time.Hour - time.Second)
			end = &t
		}
	}
	return start, end
}

// Personal 获取个人量化统计
// GET /api/v1/stats/personal?user_id=1&start_date=2026-09-01&end_date=2026-09-30
// user_id 为空时取当前登录用户
func (h *StatsHandler) Personal(c *gin.Context) {
	// 权限控制：学生只能查看自己的统计；
	// 班主任/管理员，或被分配"查看班级"权限的学生，可查看任何同学的统计
	currentID := middleware.UserIDFromContext(c)
	role := middleware.RoleFromContext(c)
	var userID int64
	if v := c.Query("user_id"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			userID = id
		}
	}
	if userID == 0 {
		userID = currentID
	}
	if userID != currentID && !h.permSvc.CanViewAllStats(currentID, role) {
		response.Fail(c, errcode.ErrForbidden)
		return
	}
	start, end := parseDateRange(c)
	res, err := h.svc.Personal(userID, start, end)
	if err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	response.OK(c, res)
}

// Overview 获取班级整体看板
// GET /api/v1/stats/overview?start_date=2026-09-01&end_date=2026-09-30
// 仅班主任/管理员，或被分配"查看班级"权限的学生可查看
func (h *StatsHandler) Overview(c *gin.Context) {
	uid := middleware.UserIDFromContext(c)
	role := middleware.RoleFromContext(c)
	if !h.permSvc.CanViewAllStats(uid, role) {
		response.Fail(c, errcode.ErrForbidden)
		return
	}
	start, end := parseDateRange(c)
	res, err := h.svc.Overview(start, end)
	if err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	response.OK(c, res)
}
