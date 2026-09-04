package handler

import (
	"net/url"
	"strconv"
	"time"

	"class-deduction/internal/middleware"
	"class-deduction/internal/service"
	"class-deduction/pkg/errcode"
	"class-deduction/pkg/response"

	"github.com/gin-gonic/gin"
)

// ExportHandler 报表导出 HTTP 接口
type ExportHandler struct {
	svc        *service.ExportService
	summarySvc *service.SummaryService
	permSvc    *service.PermissionService
}

// NewExportHandler 构造 ExportHandler
func NewExportHandler(svc *service.ExportService, summarySvc *service.SummaryService, permSvc *service.PermissionService) *ExportHandler {
	return &ExportHandler{svc: svc, summarySvc: summarySvc, permSvc: permSvc}
}

// ExportRecords 导出扣分明细 Excel
// GET /api/v1/export/records?category=学习&subject_or_item=语文&target_user_id=1&start_date=&end_date=
func (h *ExportHandler) ExportRecords(c *gin.Context) {
	f := service.ExportFilter{
		Category:      c.Query("category"),
		SubjectOrItem: c.Query("subject_or_item"),
	}
	if v := c.Query("target_user_id"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			f.TargetUserID = id
		}
	}
	if v := c.Query("operator_id"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			f.OperatorID = id
		}
	}
	if v := c.Query("start_date"); v != "" {
		if t, err := time.ParseInLocation("2006-01-02", v, time.Local); err == nil {
			f.StartDate = &t
		}
	}
	if v := c.Query("end_date"); v != "" {
		if t, err := time.ParseInLocation("2006-01-02", v, time.Local); err == nil {
			t = t.Add(24*time.Hour - time.Second)
			f.EndDate = &t
		}
	}

	fx, err := h.svc.BuildRecordsExcel(f)
	if err != nil {
		errcode.AsApp(err)
		c.JSON(500, gin.H{"code": 10000, "message": "导出失败"})
		return
	}

	asciiName := "deduction_records_" + time.Now().Format("20060102_150405") + ".xlsx"
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition",
		`attachment; filename="`+asciiName+`"; filename*=UTF-8''`+url.PathEscape("扣分明细_"+time.Now().Format("20060102_150405")+".xlsx"))

	if err := fx.Write(c.Writer); err != nil {
		_ = err
	}
}

// ExportStudentSummary 导出每个同学的扣分点汇总 Excel
// GET /api/v1/export/student-summary?period=daily|weekly|monthly&start_date=&end_date=
// 需"查看班级"权限（班主任/管理员/被授权学生）
func (h *ExportHandler) ExportStudentSummary(c *gin.Context) {
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
	var start, end *time.Time
	if v := c.Query("start_date"); v != "" {
		if t, err := time.ParseInLocation("2006-01-02", v, time.Local); err == nil {
			start = &t
		}
	}
	if v := c.Query("end_date"); v != "" {
		if t, err := time.ParseInLocation("2006-01-02", v, time.Local); err == nil {
			end = &t
		}
	}
	res, err := h.summarySvc.StudentSummary(period, start, end, 0, 0)
	if err != nil {
		c.JSON(500, gin.H{"code": 10000, "message": "导出失败: " + err.Error()})
		return
	}
	fx, err := h.svc.BuildStudentSummaryExcel(res)
	if err != nil {
		c.JSON(500, gin.H{"code": 10000, "message": "导出失败: " + err.Error()})
		return
	}
	asciiName := "student_summary_" + time.Now().Format("20060102_150405") + ".xlsx"
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition",
		`attachment; filename="`+asciiName+`"; filename*=UTF-8''`+url.PathEscape("同学扣分汇总_"+time.Now().Format("20060102_150405")+".xlsx"))
	if err := fx.Write(c.Writer); err != nil {
		_ = err
	}
}
