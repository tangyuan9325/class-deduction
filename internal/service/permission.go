package service

import (
	"class-deduction/internal/model"
	"class-deduction/pkg/errcode"
	"gorm.io/gorm"
)

// PermissionService 扣分权限业务逻辑层
// 班主任（teacher）/ 管理员拥有全部扣分权限；学生需由班主任分配对应类别权限后，方可录入该类扣分。
// 1.1.0：新增"加分"类别权限；新增 viewer（班级看板只读账号）角色，仅可查看，无任何录入/管理权限。
type PermissionService struct {
	db *gorm.DB
}

// NewPermissionService 构造 PermissionService
func NewPermissionService(db *gorm.DB) *PermissionService {
	return &PermissionService{db: db}
}

// SetUserPermissionsInput 设置用户权限入参
type SetUserPermissionsInput struct {
	Categories []string `json:"categories"` // 拥有的扣分类别，如 ["学习","寝室","加分"]
}

// ListByUser 查询某用户拥有的权限类别
func (s *PermissionService) ListByUser(userID int64) ([]string, error) {
	var perms []model.DeductionPermission
	if err := s.db.Where("user_id = ?", userID).Find(&perms).Error; err != nil {
		return nil, errcode.ErrInternal
	}
	seen := make(map[string]bool, 6)
	cats := make([]string, 0, 6)
	for _, p := range perms {
		if !seen[p.Category] {
			seen[p.Category] = true
			cats = append(cats, p.Category)
		}
	}
	return cats, nil
}

// SetPermissions 设置用户权限（先清空旧权限再写入）
func (s *PermissionService) SetPermissions(userID, grantedBy int64, categories []string) error {
	if err := s.db.Where("user_id = ?", userID).Delete(&model.DeductionPermission{}).Error; err != nil {
		return errcode.ErrInternal
	}
	if len(categories) == 0 {
		return nil
	}
	perms := make([]*model.DeductionPermission, 0, len(categories))
	for _, cat := range categories {
		if !validCategory(cat) && cat != model.ViewStatsCategory && cat != model.ViewRecordsCategory {
			continue
		}
		perms = append(perms, &model.DeductionPermission{
			UserID:    userID,
			Category:  cat,
			GrantedBy: grantedBy,
		})
	}
	if len(perms) > 0 {
		if err := s.db.Create(&perms).Error; err != nil {
			return errcode.ErrInternal
		}
	}
	return nil
}

// HasPermission 判断用户是否拥有某类别扣分权限
// admin / teacher（班主任）默认拥有全部权限；viewer（看板账号）无任何录入权限；
// 学生需在 user_permissions 中匹配到该类别（含"加分"）。
func (s *PermissionService) HasPermission(userID int64, role, category string) bool {
	if role == model.RoleAdmin || role == model.RoleTeacher {
		return true
	}
	if role == model.RoleViewer {
		return false
	}
	var cnt int64
	if err := s.db.Model(&model.DeductionPermission{}).
		Where("user_id = ? AND category = ?", userID, category).Count(&cnt).Error; err != nil {
		return false
	}
	return cnt > 0
}

// CanViewAllStats 判断用户是否可查看班级全部统计
// admin/teacher/viewer 默认可看；学生需被分配"查看班级"权限
func (s *PermissionService) CanViewAllStats(userID int64, role string) bool {
	if role == model.RoleAdmin || role == model.RoleTeacher || role == model.RoleViewer {
		return true
	}
	var cnt int64
	if err := s.db.Model(&model.DeductionPermission{}).
		Where("user_id = ? AND category = ?", userID, model.ViewStatsCategory).Count(&cnt).Error; err != nil {
		return false
	}
	return cnt > 0
}

// CanViewRecords 判断用户是否可查看扣分记录（全量扣分明细）
// admin/teacher 默认可看；学生需被分配"查看扣分记录"权限；viewer 无该权限
func (s *PermissionService) CanViewRecords(userID int64, role string) bool {
	if role == model.RoleAdmin || role == model.RoleTeacher {
		return true
	}
	if role == model.RoleViewer {
		return false
	}
	var cnt int64
	if err := s.db.Model(&model.DeductionPermission{}).
		Where("user_id = ? AND category = ?", userID, model.ViewRecordsCategory).Count(&cnt).Error; err != nil {
		return false
	}
	return cnt > 0
}

// CanManageFeedback 判断用户是否可管理（查看/改状态/同步）意见反馈：管理员/班主任
func (s *PermissionService) CanManageFeedback(role string) bool {
	return role == model.RoleAdmin || role == model.RoleTeacher
}

// validCategory 校验扣分类别是否合法（含加分）
func validCategory(cat string) bool {
	for _, c := range model.AllCategories {
		if c == cat {
			return true
		}
	}
	return false
}
