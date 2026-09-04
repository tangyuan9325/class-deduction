package handler

import (
	"strconv"

	"class-deduction/internal/middleware"
	"class-deduction/internal/service"
	"class-deduction/pkg/errcode"
	"class-deduction/pkg/response"
	"github.com/gin-gonic/gin"
)

// FeedbackHandler 意见反馈 HTTP 接口（1.1.0）
type FeedbackHandler struct {
	svc *service.FeedbackService
}

// NewFeedbackHandler 构造 FeedbackHandler
func NewFeedbackHandler(svc *service.FeedbackService) *FeedbackHandler {
	return &FeedbackHandler{svc: svc}
}

// Create 提交意见（任何登录用户）
// POST /api/v1/feedback
func (h *FeedbackHandler) Create(c *gin.Context) {
	var req service.CreateFeedbackInput
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	uid := middleware.UserIDFromContext(c)
	fb, err := h.svc.Create(uid, middleware.UsernameFromContext(c), middleware.RoleFromContext(c), req)
	if err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	response.OK(c, fb)
}

// List 分页查询反馈（管理员/班主任）
// GET /api/v1/feedback?page=1&page_size=20&status=open&keyword=
func (h *FeedbackHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	list, total, err := h.svc.List(service.FeedbackQuery{
		Page:     page,
		PageSize: pageSize,
		Status:   c.Query("status"),
		Keyword:  c.Query("keyword"),
	})
	if err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	response.OKPage(c, list, total, page, pageSize)
}

// UpdateStatus 更新反馈状态（管理员/班主任）
// PUT /api/v1/feedback/:id/status  body: {"status":"processing|resolved|closed|open"}
func (h *FeedbackHandler) UpdateStatus(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	var req struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	if req.Status != "open" && req.Status != "processing" && req.Status != "resolved" && req.Status != "closed" {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	fb, err := h.svc.UpdateStatus(id, req.Status)
	if err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	response.OK(c, fb)
}

// SyncToGitHub 将反馈同步到 GitHub Issues（管理员/班主任）
// POST /api/v1/feedback/:id/to-github
func (h *FeedbackHandler) SyncToGitHub(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.Fail(c, errcode.ErrBadRequest)
		return
	}
	num, err := h.svc.SyncToGitHub(id)
	if err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	response.OK(c, gin.H{"issue_number": num, "issue_url": h.svc.IssueURL(num)})
}
