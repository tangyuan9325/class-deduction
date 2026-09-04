package handler

import (
	"strconv"
	"time"

	"class-deduction/internal/middleware"
	"class-deduction/internal/realtime"
	"class-deduction/internal/repo"
	"class-deduction/internal/service"
	"class-deduction/pkg/errcode"
	"class-deduction/pkg/response"

	"github.com/gin-gonic/gin"
)

// RecordHandler 扣分记录 HTTP 接口
type RecordHandler struct {
	svc     *service.RecordService
	permSvc *service.PermissionService
}

// NewRecordHandler 构造 RecordHandler
func NewRecordHandler(svc *service.RecordService, permSvc *service.PermissionService) *RecordHandler {
	return &RecordHandler{svc: svc, permSvc: permSvc}
}

// batchCreateRequest 批量新增请求体
type batchCreateRequest struct {
	TargetUserIDs []int64 `json:"target_user_ids"`
	Category      string  `json:"category"`
	SubjectOrItem string  `json:"subject_or_item"`
	Score         int     `json:"score"`
	Reason        string  `json:"reason"`
	RecordDate    string  `json:"record_date"`
}

// Create 批量新增扣分记录
// POST /api/v1/records
func (h *RecordHandler) Create(c *gin.Context) {
	var req batchCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	if len(req.TargetUserIDs) == 0 {
		response.Fail(c, errcode.ErrNoTargetUser)
		return
	}
	if req.Category == "" {
		response.Fail(c, errcode.ErrCategoryEmpty)
		return
	}
	// 扣分权限校验：admin / teacher（班主任）拥有全部权限；学生需被授予该类别权限
	opRole := middleware.RoleFromContext(c)
	opID := middleware.UserIDFromContext(c)
	if !h.permSvc.HasPermission(opID, opRole, req.Category) {
		response.Fail(c, errcode.New(30005, "你没有该类别（"+req.Category+"）的扣分权限，请联系班主任分配", 403))
		return
	}
	in := service.BatchCreateInput{
		TargetUserIDs: req.TargetUserIDs,
		Category:      req.Category,
		SubjectOrItem: req.SubjectOrItem,
		Score:         req.Score,
		Reason:        req.Reason,
		RecordDate:    req.RecordDate,
		OperatorID:    middleware.UserIDFromContext(c),
		OperatorName:  middleware.UsernameFromContext(c),
	}
	list, err := h.svc.BatchCreate(in)
	if err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	// 数据变更，广播实时事件
	realtime.Publish("records")
	response.OK(c, list)
}

// List 分页查询扣分记录
// GET /api/v1/records?page=1&page_size=20&category=学习&subject_or_item=语文&target_user_id=1&start_date=2026-09-01&end_date=2026-09-30
func (h *RecordHandler) List(c *gin.Context) {
	// 查看扣分记录权限：admin / teacher（班主任）默认可看；学生需被授予"查看扣分记录"权限
	opRole := middleware.RoleFromContext(c)
	opID := middleware.UserIDFromContext(c)
	if !h.permSvc.CanViewRecords(opID, opRole) {
		response.Fail(c, errcode.New(30006, "你没有查看扣分记录的权限，请联系班主任分配", 403))
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	q := repo.RecordQuery{
		Page:          page,
		PageSize:      pageSize,
		Category:      c.Query("category"),
		SubjectOrItem: c.Query("subject_or_item"),
	}
	if v := c.Query("target_user_id"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			q.TargetUserID = id
		}
	}
	if v := c.Query("operator_id"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			q.OperatorID = id
		}
	}
	if v := c.Query("start_date"); v != "" {
		if t, err := time.ParseInLocation("2006-01-02", v, time.Local); err == nil {
			q.StartDate = &t
		}
	}
	if v := c.Query("end_date"); v != "" {
		if t, err := time.ParseInLocation("2006-01-02", v, time.Local); err == nil {
			t = t.Add(24*time.Hour - time.Second)
			q.EndDate = &t
		}
	}

	list, total, err := h.svc.List(q)
	if err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	response.OKPage(c, list, total, q.Page, q.PageSize)
}

// Delete 删除（撤销）扣分记录，仅管理员
// DELETE /api/v1/records/:id
func (h *RecordHandler) Delete(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	if err := h.svc.Delete(id); err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	// 数据变更，广播实时事件
	realtime.Publish("records")
	response.OK(c, gin.H{"id": id})
}
