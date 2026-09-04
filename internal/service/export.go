package service

import (
	"fmt"
	"time"

	"class-deduction/internal/model"
	"class-deduction/pkg/errcode"

	"github.com/xuri/excelize/v2"
	"gorm.io/gorm"
)

// ExportService 报表导出业务逻辑层
type ExportService struct {
	db *gorm.DB
}

// NewExportService 构造 ExportService
func NewExportService(db *gorm.DB) *ExportService {
	return &ExportService{db: db}
}

// ExportFilter 导出筛选条件
type ExportFilter struct {
	Category      string
	SubjectOrItem string
	TargetUserID  int64
	OperatorID    int64
	StartDate     *time.Time
	EndDate       *time.Time
}

// BuildRecordsExcel 导出扣分明细到 Excel，返回 *excelize.File
func (s *ExportService) BuildRecordsExcel(f ExportFilter) (*excelize.File, error) {
	tx := s.db.Model(&model.DeductionRecord{})
	if f.Category != "" {
		tx = tx.Where("category = ?", f.Category)
	}
	if f.SubjectOrItem != "" {
		tx = tx.Where("subject_or_item = ?", f.SubjectOrItem)
	}
	if f.TargetUserID > 0 {
		tx = tx.Where("target_user_id = ?", f.TargetUserID)
	}
	if f.OperatorID > 0 {
		tx = tx.Where("operator_user_id = ?", f.OperatorID)
	}
	if f.StartDate != nil {
		tx = tx.Where("record_date >= ?", *f.StartDate)
	}
	if f.EndDate != nil {
		tx = tx.Where("record_date <= ?", *f.EndDate)
	}
	var list []model.DeductionRecord
	if err := tx.Order("record_date DESC, id DESC").Find(&list).Error; err != nil {
		return nil, errcode.ErrInternal
	}

	fx := excelize.NewFile()
	sheet := fx.GetSheetName(0)
	_ = fx.SetSheetName(sheet, "扣分明细")

	headers := []string{"序号", "学生姓名", "扣分类别", "科目/项目", "分值", "原因", "操作人", "记录日期"}
	if err := fx.SetSheetRow("扣分明细", "A1", &headers); err != nil {
		return nil, errcode.ErrInternal
	}
	style, _ := fx.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "FFFFFF"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"4472C4"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	})
	_ = fx.SetCellStyle("扣分明细", "A1", "H1", style)

	for i, rec := range list {
		row := i + 2
		values := []interface{}{
			i + 1,
			rec.TargetName,
			rec.Category,
			rec.SubjectOrItem,
			rec.Score,
			rec.Reason,
			rec.OperatorName,
			rec.RecordDate.Format("2006-01-02"),
		}
		cell := fmt.Sprintf("A%d", row)
		if err := fx.SetSheetRow("扣分明细", cell, &values); err != nil {
			return nil, errcode.ErrInternal
		}
	}

	widths := map[string]float64{
		"A": 8, "B": 14, "C": 12, "D": 14, "E": 10, "F": 40, "G": 14, "H": 14,
	}
	for col, w := range widths {
		_ = fx.SetColWidth("扣分明细", col, col, w)
	}
	return fx, nil
}

// StudentSummaryExcel 将每个同学的扣分点汇总导出为 Excel
// rows 来自 SummaryService.StudentSummary 的结果
func (s *ExportService) BuildStudentSummaryExcel(res *StudentSummaryResult) (*excelize.File, error) {
	fx := excelize.NewFile()
	const sheet = "同学扣分汇总"
	_ = fx.SetSheetName(fx.GetSheetName(0), sheet)
	title := "同学扣分汇总（" + res.PeriodLabel + "，" + res.StartDate + " ~ " + res.EndDate + "）"
	_ = fx.SetCellValue(sheet, "A1", title)
	headers := []interface{}{"序号", "姓名", "账号", "班级", "记录数", "扣分合计", "加分合计", "净分", "类别明细"}
	if err := fx.SetSheetRow(sheet, "A2", &headers); err != nil {
		return nil, errcode.ErrInternal
	}
	style, _ := fx.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "FFFFFF"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"4472C4"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	})
	_ = fx.SetCellStyle(sheet, "A1", "I2", style)
	for i, row := range res.Rows {
		r := i + 3
		detail := ""
		for cat, score := range row.ByCategory {
			if detail != "" {
				detail += "；"
			}
			detail += cat + ":" + itoa(score)
		}
		values := []interface{}{
			i + 1,
			row.RealName,
			row.Username,
			row.ClassID,
			row.RecordCount,
			row.DeductScore,
			row.BonusScore,
			row.NetScore,
			detail,
		}
		cell := fmt.Sprintf("A%d", r)
		if err := fx.SetSheetRow(sheet, cell, &values); err != nil {
			return nil, errcode.ErrInternal
		}
	}
	widths := map[string]float64{"A": 8, "B": 14, "C": 16, "D": 8, "E": 10, "F": 12, "G": 12, "H": 10, "I": 50}
	for col, w := range widths {
		_ = fx.SetColWidth(sheet, col, col, w)
	}
	return fx, nil
}
