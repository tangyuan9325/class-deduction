package handler

import (
	"class-deduction/internal/model"
	"class-deduction/pkg/errcode"
	"class-deduction/pkg/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// DictionaryHandler 数据字典 HTTP 接口
type DictionaryHandler struct {
	db *gorm.DB
}

// NewDictionaryHandler 构造 DictionaryHandler
func NewDictionaryHandler(db *gorm.DB) *DictionaryHandler {
	return &DictionaryHandler{db: db}
}

// List 查询字典
// GET /api/v1/dictionaries?type=subject
// type 可选：学习 / 寝室 / 日常 / 两操；为空时返回全部
func (h *DictionaryHandler) List(c *gin.Context) {
	typ := c.Query("type")
	var list []model.Dictionary
	tx := h.db.Order("id ASC")
	if typ != "" {
		tx = tx.Where("type = ?", typ)
	}
	if err := tx.Find(&list).Error; err != nil {
		response.Fail(c, errcode.ErrInternal)
		return
	}
	response.OK(c, list)
}
