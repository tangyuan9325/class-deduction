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

// SummaryHandler 小结与汇总 HTTP 接口（1.1.0）
type SummaryHandler struct {
	svc     *service.SummaryService
	permSvc *service.PermissionService
}

// NewSummaryHandler 构造 SummaryHandler
func NewSummaryHandler(svc *service.SummaryService, permSvc *service.PermissionService) *SummaryHandler {
	return &SummaryHandler{svc: svc, permSvc: permSvc}
}

// parseOptionalDate 解析可选日期参数
func parseOptionalDate(v string) (*time.Time, bool) {
	if v == "" {
		return nil, false
	}
	if t, err := time.ParseInLocation("2006-01-02", v, time.Local); err == nil {
		return &t, true
	}
	return nil, false
}

// Summary 周小结 / 学期小结（班级 or 个人）
// GET /api/v1/stats/summary?scope=class|personal&period=week|semester&user_id=1&start_date=&end_date=
func (h *SummaryHandler) Summary(c *gin.Context) {
	scope := c.DefaultQuery("scope", service.SummaryScopeClass)
	period := c.DefaultQuery("period", service.SummaryPeriodWeek)
	if scope != service.SummaryScopeClass && scope != service.SummaryScopePersonal {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	if period != service.SummaryPeriodWeek && period != service.SummaryPeriodSemester {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	currentID := middleware.UserIDFromContext(c)
	role := middleware.RoleFromContext(c)

	var userID int64
	if v := c.Query("user_id"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			userID = id
		}
	}
	// 个人小结：只能看自己；班主任/管理员/被授权学生可看他人
	if scope == service.SummaryScopePersonal {
		if userID == 0 {
			userID = currentID
		}
		if userID != currentID && !h.permSvc.CanViewAllStats(currentID, role) {
			response.Fail(c, errcode.ErrForbidden)
			return
		}
	}
	// 班级小结：需可查看班级
	if scope == service.SummaryScopeClass && !h.permSvc.CanViewAllStats(currentID, role) {
		response.Fail(c, errcode.ErrForbidden)
		return
	}
	start, _ := parseOptionalDate(c.Query("start_date"))
	end, _ := parseOptionalDate(c.Query("end_date"))
	res, err := h.svc.Summary(scope, period, userID, start, end)
	if err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	response.OK(c, res)
}

// StudentSummary 每个同学的 每日/每周/每月 扣分点汇总
// GET /api/v1/stats/student-summary?period=daily|weekly|monthly&start_date=&end_date=&class_id=&user_id=
func (h *SummaryHandler) StudentSummary(c *gin.Context) {
	uid := middleware.UserIDFromContext(c)
	role := middleware.RoleFromContext(c)
	if !h.permSvc.CanViewAllStats(uid, role) {
		response.Fail(c, errcode.ErrForbidden)
		return
	}
	period := c.DefaultQuery("period", service.StuSummaryDaily)
	switch period {
	case service.StuSummaryDaily, service.StuSummaryWeekly, service.StuSummaryMonthly:
	default:
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	start, _ := parseOptionalDate(c.Query("start_date"))
	end, _ := parseOptionalDate(c.Query("end_date"))
	var classID, userID int64
	if v := c.Query("class_id"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			classID = id
		}
	}
	if v := c.Query("user_id"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			userID = id
		}
	}
	res, err := h.svc.StudentSummary(period, start, end, classID, userID)
	if err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	response.OK(c, res)
}
