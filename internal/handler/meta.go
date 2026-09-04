package handler

import (
	"class-deduction/internal/middleware"
	"class-deduction/internal/service"
	"class-deduction/pkg/errcode"
	"class-deduction/pkg/response"
	"github.com/gin-gonic/gin"
)

// MetaHandler 应用元信息 HTTP 接口（1.1.0）
type MetaHandler struct {
	svc *service.MetaService
}

// NewMetaHandler 构造 MetaHandler
func NewMetaHandler(svc *service.MetaService) *MetaHandler {
	return &MetaHandler{svc: svc}
}

// Get 获取版本/更新日志/克隆仓库引导等元信息
// GET /api/v1/meta
func (h *MetaHandler) Get(c *gin.Context) {
	uid := middleware.UserIDFromContext(c)
	res, err := h.svc.GetMeta(uid)
	if err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	response.OK(c, res)
}

// MarkSeenChangelog 标记当前用户已读本次更新日志
// POST /api/v1/meta/seen-changelog
func (h *MetaHandler) MarkSeenChangelog(c *gin.Context) {
	uid := middleware.UserIDFromContext(c)
	if err := h.svc.MarkSeenChangelog(uid); err != nil {
		response.Fail(c, errcode.AsApp(err))
		return
	}
	response.OK(c, gin.H{"seen": true})
}
